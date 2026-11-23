import {
  clearProxySection,
  mutateAppState,
  readAppState,
  runCommand,
  setCommandRunnerForTests,
  type CommandRunner,
  type RegistryValueSnapshot,
  type SystemProxySnapshot
} from './KillSwitch';

/** WinINet / Internet Explorer proxy settings key (per user). */
export const REG_INTERNET_SETTINGS = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings';

const DEFAULT_PROXY_OVERRIDE = '<local>;localhost;127.*;10.*;172.16.*;192.168.*';

/** Loopback ports this client is known to put in the system proxy. */
const KNOWN_LOOPBACK_PORTS = [10808, 10809];

/**
 * WinINet only re-reads the proxy configuration when it is told to. Writing the
 * registry alone leaves already-running browsers on the old settings until they
 * are restarted, so every change is followed by
 * `InternetSetOption(INTERNET_OPTION_SETTINGS_CHANGED)` /
 * `INTERNET_OPTION_REFRESH` plus a `WM_SETTINGCHANGE` broadcast.
 *
 * (`netsh winhttp` and launching a browser both target different subsystems and
 * do not refresh WinINet — deliberately not used here.)
 */
export const WININET_REFRESH_SCRIPT = `
$sig = @'
[DllImport("wininet.dll", SetLastError=true)]
public static extern bool InternetSetOption(IntPtr hInternet, int dwOption, IntPtr lpBuffer, int dwBufferLength);
[DllImport("user32.dll", SetLastError=true)]
public static extern IntPtr SendMessageTimeout(IntPtr hWnd, uint Msg, IntPtr wParam, string lParam, uint fuFlags, uint uTimeout, out IntPtr lpdwResult);
'@
$type = Add-Type -MemberDefinition $sig -Name RyoxWinInetRefresh -Namespace Ryox -PassThru
$INTERNET_OPTION_SETTINGS_CHANGED = 39
$INTERNET_OPTION_REFRESH = 37
$type::InternetSetOption([IntPtr]::Zero, $INTERNET_OPTION_SETTINGS_CHANGED, [IntPtr]::Zero, 0) | Out-Null
$type::InternetSetOption([IntPtr]::Zero, $INTERNET_OPTION_REFRESH, [IntPtr]::Zero, 0) | Out-Null
$out = [IntPtr]::Zero
$type::SendMessageTimeout([IntPtr]0xffff, 0x001A, [IntPtr]::Zero, 'Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings', 2, 5000, [ref]$out) | Out-Null
`;

/**
 * Test seam shared with {@link KillSwitch}: every `reg`/`powershell` call goes
 * through the injected runner. Passing no argument restores the real one.
 */
export function setRunnerForTests(fn?: CommandRunner): void {
  setCommandRunnerForTests(fn);
}

/* ------------------------------------------------------------------------ *
 * reg.exe helpers
 * ------------------------------------------------------------------------ */

function parseRegQueryOutput(stdout: string, name: string): RegistryValueSnapshot | null {
  const line = new RegExp(`^\\s*${name}\\s+(REG_[A-Z_]+)\\s+(.*)$`, 'im').exec(stdout);
  if (!line) return null;

  const type = line[1].toUpperCase();
  let data = line[2].trim();

  if (type === 'REG_DWORD') {
    const hex = /^0x([0-9a-f]+)$/i.exec(data);
    if (hex) data = String(parseInt(hex[1], 16));
  }
  return { type, data };
}

/**
 * `reg query <key> /v <name>` exits with code 1 when the key or the value does
 * not exist ("The system was unable to find the specified registry key or
 * value."). Any other failure (spawn error, timeout) is a real error.
 */
function isMissingRegValueError(err: unknown): boolean {
  const error = err as { code?: number | string; exitCode?: number | string };
  return error?.exitCode === 1 || error?.exitCode === '1' || error?.code === 1;
}

async function queryRegValue(name: string): Promise<RegistryValueSnapshot | null> {
  try {
    const { stdout } = await runCommand('reg', ['query', REG_INTERNET_SETTINGS, '/v', name]);
    return parseRegQueryOutput(stdout, name);
  } catch (err) {
    if (isMissingRegValueError(err)) return null;
    throw err;
  }
}

async function writeRegValue(name: string, type: string, data: string): Promise<void> {
  await runCommand('reg', ['add', REG_INTERNET_SETTINGS, '/v', name, '/t', type, '/d', data, '/f']);
}

async function deleteRegValueIfPresent(name: string): Promise<void> {
  try {
    await runCommand('reg', ['delete', REG_INTERNET_SETTINGS, '/v', name, '/f']);
  } catch (err) {
    if (isMissingRegValueError(err)) return;
    throw err;
  }
}

/** Put a captured value back verbatim; an absent value is deleted again. */
async function restoreRegValue(name: string, snapshot: RegistryValueSnapshot | null): Promise<void> {
  if (snapshot === null) {
    await deleteRegValueIfPresent(name);
    return;
  }
  await writeRegValue(name, snapshot.type, snapshot.data);
}

/**
 * Whether a `ProxyServer` value points at one of our own loopback ports (plain
 * `127.0.0.1:10808` or per-protocol `http=localhost:10808;https=...`).
 */
export function isOurLoopbackProxy(value: string, ports: number[] = KNOWN_LOOPBACK_PORTS): boolean {
  if (!value) return false;

  const allowed = new Set(ports);
  return value
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .some((entry) => {
      const target = (entry.includes('=') ? entry.slice(entry.indexOf('=') + 1) : entry).trim();
      const match = /^\[?([a-zA-Z0-9.\-]+)\]?:(\d+)$/.exec(target);
      if (!match) return false;

      const host = match[1].toLowerCase();
      const port = Number(match[2]);
      const loopback = host === '127.0.0.1' || host === 'localhost' || host === '0.0.0.0';
      return loopback && allowed.has(port);
    });
}

/**
 * Tell WinINet that the proxy configuration changed. Failures are logged but
 * not fatal: the registry was already updated, and a browser restart still
 * picks the new settings up.
 */
async function refreshWinInet(): Promise<void> {
  try {
    await runCommand('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', WININET_REFRESH_SCRIPT]);
  } catch (err) {
    console.warn(
      '[SystemProxyManager] Could not notify WinINet of the proxy change; browsers that are already running ' +
        'may keep the old settings until they are restarted:',
      (err as Error).message
    );
  }
}

/* ------------------------------------------------------------------------ *
 * SystemProxyManager
 * ------------------------------------------------------------------------ */

export class SystemProxyManager {
  private static isWindows = process.platform === 'win32';

  /**
   * Point the Windows system proxy at our local proxy port.
   *
   * The current `ProxyEnable`/`ProxyServer`/`ProxyOverride` values are
   * snapshotted and persisted before anything is written, so `disableProxy()`
   * and {@link SystemProxyManager.restoreOnStartup} can restore the user's own
   * proxy configuration exactly. Returns false (and rolls the registry back)
   * when anything fails — the caller treats that as a connection failure.
   */
  public static async enableProxy(port: number, host: string = '127.0.0.1'): Promise<boolean> {
    // Sanitize input to prevent injection
    const cleanPort = Math.floor(Number(port));
    if (isNaN(cleanPort) || cleanPort < 1 || cleanPort > 65535) {
      console.error('[SystemProxyManager] Invalid port:', port);
      return false;
    }

    const cleanHost = host.replace(/[^a-zA-Z0-9\.\-_]/g, '') || '127.0.0.1';

    if (!this.isWindows) {
      process.env.HTTP_PROXY = `http://${cleanHost}:${cleanPort}`;
      process.env.HTTPS_PROXY = `http://${cleanHost}:${cleanPort}`;
      return true;
    }

    const proxyServer = `${cleanHost}:${cleanPort}`;
    let snapshot: SystemProxySnapshot | undefined;

    try {
      snapshot = {
        proxyEnable: await queryRegValue('ProxyEnable'),
        proxyServer: await queryRegValue('ProxyServer'),
        proxyOverride: await queryRegValue('ProxyOverride'),
        activeProxyServer: proxyServer,
        snapshotAt: new Date().toISOString()
      };

      // Persist BEFORE overwriting: if the process dies between here and
      // disableProxy(), restoreOnStartup() can still put the user's own proxy
      // settings back instead of leaving the machine pointing at a dead port.
      mutateAppState((state) => {
        state.systemProxy = snapshot!;
      });

      // Execute directly via reg.exe with sanitized parameter array (zero shell injection risk)
      await writeRegValue('ProxyEnable', 'REG_DWORD', '1');
      await writeRegValue('ProxyServer', 'REG_SZ', proxyServer);
      await writeRegValue('ProxyOverride', 'REG_SZ', DEFAULT_PROXY_OVERRIDE);

      await refreshWinInet();
      return true;
    } catch (err) {
      console.error('[SystemProxyManager] Failed to set Windows proxy:', err);

      if (snapshot) {
        // Never leave a half-applied proxy configuration behind.
        try {
          await this.restoreSnapshot(snapshot);
          clearProxySection();
        } catch (restoreErr) {
          console.error('[SystemProxyManager] Failed to roll the proxy registry values back:', restoreErr);
        }
      }
      return false;
    }
  }

  /**
   * Restore the proxy configuration captured by {@link enableProxy}.
   *
   * This is a strict NO-OP when no snapshot was persisted, i.e. when this
   * process never successfully applied the proxy: teardown paths call it
   * unconditionally, and an unconditional write would otherwise stamp
   * `ProxyEnable=0` over a configuration we never touched. Crash cleanup for a
   * proxy we did apply is handled by {@link SystemProxyManager.restoreOnStartup}.
   */
  public static async disableProxy(): Promise<void> {
    if (!this.isWindows) {
      delete process.env.HTTP_PROXY;
      delete process.env.HTTPS_PROXY;
      return;
    }

    if (!readAppState()?.systemProxy) return;

    try {
      await this.restoreSnapshot(readAppState()!.systemProxy!);
      await refreshWinInet();
      clearProxySection();
    } catch (err) {
      // Keep the snapshot so startup recovery (or a later teardown) can retry.
      console.error('[SystemProxyManager] Failed to disable Windows proxy:', err);
    }
  }

  /**
   * Crash recovery, safe (and idempotent) to call on every startup.
   *
   * It only acts when the live `ProxyServer` still points at one of our own
   * loopback ports, so a proxy the user configured after us is never clobbered.
   *
   * @returns true when the proxy configuration was restored/cleaned up.
   */
  public static async restoreOnStartup(): Promise<boolean> {
    if (!this.isWindows) {
      delete process.env.HTTP_PROXY;
      delete process.env.HTTPS_PROXY;
      return false;
    }

    try {
      const snapshot = readAppState()?.systemProxy;
      const live = await queryRegValue('ProxyServer');

      const ports = [...KNOWN_LOOPBACK_PORTS];
      if (snapshot?.activeProxyServer) {
        const match = /:(\d+)$/.exec(snapshot.activeProxyServer);
        if (match) ports.push(Number(match[1]));
      }

      if (!live || !isOurLoopbackProxy(live.data, ports)) return false;

      if (snapshot) {
        await this.restoreSnapshot(snapshot);
      } else {
        // Our value is live but the snapshot is gone: drop the dead proxy
        // instead of leaving every browser pointed at a closed port.
        await deleteRegValueIfPresent('ProxyServer');
        await deleteRegValueIfPresent('ProxyOverride');
        await writeRegValue('ProxyEnable', 'REG_DWORD', '0');
      }

      await refreshWinInet();
      clearProxySection();
      return true;
    } catch (err) {
      console.error('[SystemProxyManager] Startup proxy cleanup failed:', err);
      return false;
    }
  }

  /** Restore the three values verbatim (`ProxyEnable` last, so it ends coherent). */
  private static async restoreSnapshot(snapshot: SystemProxySnapshot): Promise<void> {
    await restoreRegValue('ProxyServer', snapshot.proxyServer);
    await restoreRegValue('ProxyOverride', snapshot.proxyOverride);
    await restoreRegValue('ProxyEnable', snapshot.proxyEnable);
  }
}
