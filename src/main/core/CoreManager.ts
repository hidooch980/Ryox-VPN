import { spawn, execFile, ChildProcess } from 'child_process';
import * as net from 'net';
import * as path from 'path';
import * as fs from 'fs';
import { SupportedCore, VpnServerConfig, AppSettings, CoreMetadata } from '../../shared/types';
import { XrayAdapter } from './adapters/XrayAdapter';
import { SingBoxAdapter } from './adapters/SingBoxAdapter';
import { MihomoAdapter } from './adapters/MihomoAdapter';

/**
 * The binary file name a core id maps to. `SupportedCore` ids are used by the
 * settings/UI, but upstream ships those cores under different names
 * (`shadowsocks` → `sslocal`, `hysteria2` → `hysteria`), and looking up
 * `shadowsocks.exe` made the app fall back to "virtual bridge mode" forever.
 */
const CORE_BINARY_NAMES: Record<string, string> = {
  'sing-box': 'sing-box',
  xray: 'xray',
  mihomo: 'mihomo',
  hysteria2: 'hysteria',
  tuic: 'tuic',
  wireguard: 'wireguard',
  openvpn: 'openvpn',
  shadowsocks: 'sslocal'
};

const READINESS_TIMEOUT_MS = 8000;
const READINESS_POLL_MS = 200;
const STOP_GRACE_MS = 2000;

export interface CoreManagerOptions {
  /**
   * TEST-ONLY escape hatch. When the core binary is missing, report a
   * successful start instead of failing.
   *
   * The real app must never use this: the connection manager treats a
   * successful start as "the tunnel is up", points the Windows system proxy at
   * `127.0.0.1:10808` and shows CONNECTED, while nothing is listening.
   */
  allowVirtualBridge?: boolean;
  /** Extra directories to search for core binaries, searched first. */
  binDirs?: string[];
}

function isTestEnvironment(): boolean {
  return process.env.VITEST === 'true' || process.env.NODE_ENV === 'test';
}

export class CoreManager {
  private activeProcess: ChildProcess | null = null;
  private currentCore: SupportedCore | null = null;
  private baseBinDir: string;
  private configDir: string;
  private options: CoreManagerOptions;
  private logCallback?: (level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG', msg: string) => void;
  private exitCallback?: (code: number | null, signal: NodeJS.Signals | null) => void;
  private virtualActive = false;

  constructor(baseDir?: string, options: CoreManagerOptions = {}) {
    const root = baseDir || path.join(process.env.APPDATA || process.env.HOME || '.', '.ryox-vpn');
    this.baseBinDir = path.join(root, 'bin');
    this.configDir = path.join(root, 'configs');
    this.options = options;

    if (!fs.existsSync(this.baseBinDir)) {
      fs.mkdirSync(this.baseBinDir, { recursive: true });
    }
    if (!fs.existsSync(this.configDir)) {
      fs.mkdirSync(this.configDir, { recursive: true });
    }
  }

  public setLogCallback(cb: (level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG', msg: string) => void): void {
    this.logCallback = cb;
  }

  /**
   * Called when an already-started core process exits on its own (crash, or the
   * user killing it in Task Manager). Without this the UI kept reporting
   * CONNECTED while the system proxy pointed at a dead port.
   */
  public setExitCallback(cb?: (code: number | null, signal: NodeJS.Signals | null) => void): void {
    this.exitCallback = cb;
  }

  private log(level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG', msg: string): void {
    if (this.logCallback) {
      this.logCallback(level, msg);
    } else {
      console.log(`[CoreManager] [${level}] ${msg}`);
    }
  }

  public getCoresMetadata(): CoreMetadata[] {
    return [
      {
        id: 'sing-box',
        name: 'sing-box Core',
        version: '1.14.4',
        installed: this.isBinaryPresent('sing-box'),
        status: this.isBinaryPresent('sing-box') ? 'Ready' : 'Missing',
        license: 'GPL-3.0',
        licenseUrl: 'https://github.com/SagerNet/sing-box/blob/dev/LICENSE',
        upstreamUrl: 'https://github.com/SagerNet/sing-box/releases',
        description: 'Universal proxy platform with native high-performance TUN and multi-protocol routing',
        category: 'Proxy Core'
      },
      {
        id: 'xray',
        name: 'Xray Core (Project X)',
        version: '26.11.9',
        installed: this.isBinaryPresent('xray'),
        status: this.isBinaryPresent('xray') ? 'Ready' : 'Missing',
        license: 'MPL-2.0',
        licenseUrl: 'https://github.com/XTLS/Xray-core/blob/main/LICENSE',
        upstreamUrl: 'https://github.com/XTLS/Xray-core/releases',
        description: 'Pioneering proxy engine with native VLESS Reality, XTLS Vision, and advanced anti-censorship',
        category: 'Proxy Core'
      },
      {
        id: 'mihomo',
        name: 'Mihomo (Clash Meta)',
        version: '1.19.0',
        installed: this.isBinaryPresent('mihomo'),
        status: this.isBinaryPresent('mihomo') ? 'Ready' : 'Missing',
        license: 'GPL-3.0',
        licenseUrl: 'https://github.com/MetaCubeX/mihomo/blob/Alpha/LICENSE',
        upstreamUrl: 'https://github.com/MetaCubeX/mihomo/releases',
        description: 'A rule-based tunnel in Go with full rule sets, providers, and outbound groups',
        category: 'Proxy Core'
      },
      {
        id: 'hysteria2',
        name: 'Hysteria 2 Standalone',
        version: '2.5.2',
        installed: this.isBinaryPresent('hysteria'),
        status: this.isBinaryPresent('hysteria') ? 'Ready' : 'Missing',
        license: 'MIT',
        licenseUrl: 'https://github.com/apernet/hysteria/blob/master/LICENSE.md',
        upstreamUrl: 'https://github.com/apernet/hysteria/releases',
        description: 'Extreme speed UDP protocol designed for lossy and harsh network conditions',
        category: 'Protocol Transport'
      },
      {
        id: 'wireguard',
        name: 'WireGuard Engine',
        version: '0.5.3',
        installed: this.isBinaryPresent('wireguard'),
        status: this.isBinaryPresent('wireguard') ? 'Ready' : 'Missing',
        license: 'GPL-2.0',
        licenseUrl: 'https://git.zx2c4.com/wireguard-tools/about/COPYING',
        upstreamUrl: 'https://www.wireguard.com/',
        description: 'Fast, modern, secure kernel-level & user-space VPN protocol with state-of-the-art cryptography',
        category: 'VPN Engine'
      },
      {
        id: 'tuic',
        name: 'TUIC Protocol Core',
        version: '1.0.0',
        installed: this.isBinaryPresent('tuic'),
        status: this.isBinaryPresent('tuic') ? 'Ready' : 'Missing',
        license: 'GPL-3.0',
        licenseUrl: 'https://github.com/EAimTY/tuic/blob/master/LICENSE',
        upstreamUrl: 'https://github.com/EAimTY/tuic/releases',
        description: 'Delicately-designed proxy protocol based on QUIC for high throughput',
        category: 'Protocol Transport'
      },
      {
        id: 'shadowsocks',
        name: 'Shadowsocks-Rust',
        version: '1.21.0',
        installed: this.isBinaryPresent('sslocal'),
        status: this.isBinaryPresent('sslocal') ? 'Ready' : 'Missing',
        license: 'MIT',
        licenseUrl: 'https://github.com/shadowsocks/shadowsocks-rust/blob/master/LICENSE',
        upstreamUrl: 'https://github.com/shadowsocks/shadowsocks-rust/releases',
        description: 'High performance Rust implementation of Shadowsocks AEAD 2022',
        category: 'Proxy Core'
      },
      {
        id: 'openvpn',
        name: 'OpenVPN 3 Core',
        version: '3.8.3',
        installed: this.isBinaryPresent('openvpn'),
        status: this.isBinaryPresent('openvpn') ? 'Ready' : 'Missing',
        license: 'AGPL-3.0',
        licenseUrl: 'https://github.com/OpenVPN/openvpn3/blob/master/COPYRIGHT.AGPLv3',
        upstreamUrl: 'https://openvpn.net/',
        description: 'Industry-standard open source enterprise VPN protocol',
        category: 'VPN Engine'
      }
    ];
  }

  public isBinaryPresent(coreName: string): boolean {
    const binPath = this.getBinaryPath(coreName);
    return fs.existsSync(binPath);
  }

  public getBinaryPath(coreName: string): string {
    const ext = process.platform === 'win32' ? '.exe' : '';
    const fileName = `${CORE_BINARY_NAMES[coreName] || coreName}${ext}`;

    for (const dir of this.binSearchDirs()) {
      const candidate = path.join(dir, fileName);
      if (fs.existsSync(candidate)) return candidate;
    }

    return path.join(this.baseBinDir, fileName);
  }

  /**
   * Where a core binary may live, in priority order:
   *  1. explicit overrides (tests),
   *  2. `%APPDATA%\.ryox-vpn\bin` — what `scripts/setup-cores.ps1` installs,
   *  3. `<install>\resources\bin` — what electron-builder ships via extraResources,
   *  4. `<repo>\bin` — development only.
   *
   * The packaged location used to be derived from `process.cwd()`, which is
   * arbitrary when the app is started from a shortcut, so an installed copy
   * never found its own bundled cores.
   */
  private binSearchDirs(): string[] {
    const dirs: string[] = [];
    if (this.options.binDirs) dirs.push(...this.options.binDirs);
    dirs.push(this.baseBinDir);
    dirs.push(this.resourcesBinDir());
    if (!isTestEnvironment()) {
      dirs.push(path.join(__dirname, '..', '..', '..', 'bin'));
      dirs.push(path.join(process.cwd(), 'bin'));
    }
    return dirs;
  }

  private resourcesBinDir(): string {
    const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
    if (typeof resourcesPath === 'string' && resourcesPath.length > 0) {
      return path.join(resourcesPath, 'bin');
    }
    if (process.execPath) {
      return path.join(path.dirname(process.execPath), 'resources', 'bin');
    }
    return path.join(__dirname, '..', '..', '..', 'bin');
  }

  private describeMissingBinary(binaryPath: string): string {
    return (
      `Core binary "${path.basename(binaryPath)}" is not installed (looked in ${this.binSearchDirs().join(', ')}). ` +
      'Install the cores first: powershell -ExecutionPolicy Bypass -File scripts/setup-cores.ps1'
    );
  }

  /**
   * Starts a VPN core with the given server configuration and app settings.
   *
   * Returns false — and logs exactly why — when the core cannot be started.
   * It used to return true with no process at all when the binary was missing,
   * so the connection manager reported CONNECTED while the system proxy pointed
   * at a port nothing was listening on.
   */
  public async startCore(server: VpnServerConfig, settings: AppSettings): Promise<boolean> {
    if (this.activeProcess) {
      await this.stopCore();
    }

    const preferredCore = server.core || settings.activeCore || 'sing-box';
    const binaryPath = this.getBinaryPath(preferredCore);

    if (!fs.existsSync(binaryPath)) {
      if (this.options.allowVirtualBridge) {
        this.log('WARN', `Core binary ${binaryPath} not installed. Running in virtual bridge mode (test-only).`);
        this.currentCore = preferredCore;
        this.virtualActive = true;
        return true;
      }
      this.log('ERROR', this.describeMissingBinary(binaryPath));
      this.currentCore = null;
      this.virtualActive = false;
      return false;
    }

    // Build the config before spawning: an unsupported protocol/core pair now
    // throws instead of producing a config the core will refuse to load.
    let args: string[];
    try {
      args = this.writeCoreConfig(preferredCore, server, settings);
    } catch (err) {
      this.log('ERROR', `Cannot build a ${preferredCore} configuration: ${(err as Error).message}`);
      this.currentCore = null;
      return false;
    }

    this.currentCore = preferredCore;
    this.log('INFO', `Starting ${preferredCore} with target node: ${server.name} (${server.server}:${server.port})`);

    const localPort = settings.inboundSocksPort || 10808;

    return new Promise<boolean>((resolve) => {
      let settled = false;
      let reportedReady = false;
      const finish = (ok: boolean): void => {
        if (settled) return;
        settled = true;
        resolve(ok);
      };

      let proc: ChildProcess;
      try {
        proc = spawn(binaryPath, args, {
          cwd: this.configDir,
          stdio: ['ignore', 'pipe', 'pipe'],
          windowsHide: true
        });
      } catch (err) {
        this.log('ERROR', `Failed to spawn ${preferredCore}: ${(err as Error).message}`);
        this.currentCore = null;
        resolve(false);
        return;
      }

      this.activeProcess = proc;
      this.virtualActive = false;

      proc.stdout?.on('data', (data) => {
        this.log('DEBUG', data.toString().trim());
      });

      proc.stderr?.on('data', (data) => {
        this.log('WARN', data.toString().trim());
      });

      proc.on('error', (err) => {
        this.log('ERROR', `Process execution error: ${err.message}`);
        if (this.activeProcess === proc) {
          this.activeProcess = null;
          this.currentCore = null;
        }
        finish(false);
      });

      proc.on('exit', (code, signal) => {
        this.log('INFO', `Process exited with code ${code}, signal: ${signal}`);
        const wasActive = this.activeProcess === proc;
        if (wasActive) {
          this.activeProcess = null;
          this.currentCore = null;
        }
        finish(false);
        // A core that dies after a successful start must not leave the UI
        // reporting CONNECTED while the tunnel is gone.
        if (reportedReady && wasActive) {
          this.exitCallback?.(code, signal);
        }
      });

      void this.waitForListeningPort(localPort, READINESS_TIMEOUT_MS).then((listening) => {
        if (settled) return;
        if (!listening) {
          this.log('ERROR', `${preferredCore} never started listening on 127.0.0.1:${localPort} — shutting it down.`);
          void this.stopCore();
          finish(false);
          return;
        }
        if (proc.exitCode !== null) {
          finish(false);
          return;
        }
        reportedReady = true;
        this.log('INFO', `Core ${preferredCore} is listening on 127.0.0.1:${localPort} — tunnel engine ready.`);
        finish(true);
      });
    });
  }

  /** Writes the core's config file and returns the CLI arguments for it. */
  private writeCoreConfig(core: SupportedCore, server: VpnServerConfig, settings: AppSettings): string[] {
    const configFile = path.join(this.configDir, `active_${core}.json`);

    if (core === 'xray') {
      fs.writeFileSync(configFile, JSON.stringify(XrayAdapter.generateConfig(server, settings), null, 2), 'utf-8');
      return ['run', '-c', configFile];
    }

    if (core === 'mihomo') {
      const yamlFile = path.join(this.configDir, 'active_mihomo.yaml');
      fs.writeFileSync(yamlFile, MihomoAdapter.generateConfig(server, settings), 'utf-8');
      return ['-d', this.configDir, '-f', yamlFile];
    }

    // Default: sing-box (handles VLESS, Hysteria2, TUIC, Shadowsocks, Wireguard, Trojan, ...)
    fs.writeFileSync(configFile, JSON.stringify(SingBoxAdapter.generateConfig(server, settings), null, 2), 'utf-8');
    return ['run', '-c', configFile];
  }

  /**
   * Waits until something accepts a TCP connection on the local inbound port.
   *
   * "the process is still alive after 500 ms" was never a readiness signal: a
   * core with a rejected config, or one that cannot bind its port, was reported
   * as a successful start, and the user got a green UI and no internet.
   */
  private waitForListeningPort(port: number, timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;

    return new Promise<boolean>((resolve) => {
      const attempt = (): void => {
        const socket = net.createConnection({ host: '127.0.0.1', port });

        const retry = (): void => {
          socket.destroy();
          if (Date.now() >= deadline) resolve(false);
          else setTimeout(attempt, READINESS_POLL_MS);
        };

        socket.setTimeout(1000);
        socket.once('connect', () => {
          socket.destroy();
          resolve(true);
        });
        socket.once('error', retry);
        socket.once('timeout', retry);
      };

      attempt();
    });
  }

  /**
   * Gracefully terminate the running core.
   *
   * On Windows `kill()` is `TerminateProcess`, which leaves no chance for a
   * graceful TUN teardown, so the process tree is force-killed as a fallback:
   * `proc.killed` is set to true by `kill()` itself, which made the old
   * SIGKILL escalation unreachable and could leave a child core behind holding
   * the inbound ports the next core needs.
   */
  public async stopCore(): Promise<void> {
    const proc = this.activeProcess;
    this.activeProcess = null;
    this.currentCore = null;
    this.virtualActive = false;

    if (!proc || proc.exitCode !== null) return;

    this.log('INFO', 'Stopping active core...');

    await new Promise<void>((resolve) => {
      let done = false;
      const finish = (): void => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve();
      };

      const timer = setTimeout(() => {
        if (proc.exitCode === null) {
          void this.forceKillTree(proc);
        }
        // Give the force-kill a moment, then stop waiting no matter what:
        // a wedged process must not block the disconnect path.
        setTimeout(finish, 1000);
      }, STOP_GRACE_MS);

      proc.once('exit', finish);

      try {
        proc.kill();
      } catch {
        finish();
      }
    });
  }

  /** Last resort: `taskkill /T /F` so no orphan child keeps the ports open. */
  private async forceKillTree(proc: ChildProcess): Promise<void> {
    const pid = proc.pid;
    if (!pid) return;

    this.log('WARN', `Core process ${pid} did not exit — force-killing its process tree.`);

    await new Promise<void>((resolve) => {
      if (process.platform === 'win32') {
        execFile('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true }, () => resolve());
        return;
      }
      try {
        proc.kill('SIGKILL');
      } catch {
        // already gone
      }
      resolve();
    });
  }

  public isRunning(): boolean {
    return this.activeProcess !== null || this.virtualActive;
  }

  public getRunningCore(): SupportedCore | null {
    return this.currentCore;
  }

  /**
   * PID of the spawned core process, used for real traffic metering.
   * Undefined in "virtual bridge mode" (no binary installed).
   */
  public getActivePid(): number | undefined {
    return this.activeProcess?.pid;
  }
}
