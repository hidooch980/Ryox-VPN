import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import {
  KillSwitch,
  setAppStateFilePathForTests,
  setCommandRunnerForTests,
  type CommandResult
} from '../src/main/vpn/KillSwitch';
import { SystemProxyManager } from '../src/main/vpn/SystemProxyManager';

/* ------------------------------------------------------------------------ *
 * Fake system — NO real netsh/reg/powershell process is ever spawned.
 * ------------------------------------------------------------------------ */

interface CommandCall {
  command: string;
  args: string[];
}

const POLICY_DISPLAY: Record<string, string> = {
  blockinbound: 'BlockInbound',
  allowinbound: 'AllowInbound',
  blockoutbound: 'BlockOutbound',
  allowoutbound: 'AllowOutbound'
};

function displayPolicy(policy: string): string {
  return policy
    .split(',')
    .map((part) => POLICY_DISPLAY[part] ?? part)
    .join(',');
}

function missingValueError(): Error {
  return Object.assign(new Error('ERROR: The system was unable to find the specified registry key or value.'), {
    exitCode: 1,
    code: 1
  });
}

type Profile = 'domain' | 'private' | 'public';

class FakeSystem {
  public calls: CommandCall[] = [];
  public policy: Record<Profile, string> = {
    domain: 'blockinbound,allowoutbound',
    private: 'blockinbound,allowoutbound',
    public: 'blockinbound,allowoutbound'
  };
  public rules = new Set<string>();
  public registry = new Map<string, { type: string; data: string }>();
  public failure?: (command: string, args: string[]) => string | undefined;
  /** Exit code used when {@link failure} rejects a command (default 1). */
  public failureExitCode = 1;
  /** When set, `netsh advfirewall show ...` returns this raw output. */
  public showRaw?: string;

  public readonly run = async (command: string, args: string[]): Promise<CommandResult> => {
    this.calls.push({ command, args });

    const failure = this.failure?.(command, args);
    if (failure !== undefined) {
      throw Object.assign(new Error(failure), { exitCode: this.failureExitCode, code: this.failureExitCode });
    }

    switch (command.toLowerCase()) {
      case 'fltmc':
        return { stdout: 'Filter Name  Num Instances  Altitude  Frame\r\n', stderr: '' };
      case 'netsh':
        return { stdout: this.handleNetsh(args), stderr: '' };
      case 'reg':
        return this.handleReg(args);
      case 'powershell.exe':
        return { stdout: '', stderr: '' };
      default:
        throw Object.assign(new Error(`unexpected command: ${command} ${args.join(' ')}`), {
          exitCode: 9009,
          code: 9009
        });
    }
  };

  private handleNetsh(args: string[]): string {
    if (args[0] !== 'advfirewall') throw new Error(`unexpected netsh args: ${args.join(' ')}`);

    if (args[1] === 'show') {
      if (this.showRaw !== undefined) return this.showRaw;
      return this.profileOutput();
    }

    if (args[1] === 'set') {
      if (args[3] !== 'firewallpolicy') throw new Error(`unexpected netsh set: ${args.join(' ')}`);
      const target = args[2];
      const policy = args[4];
      if (target === 'allprofiles') {
        (['domain', 'private', 'public'] as Profile[]).forEach((profile) => {
          this.policy[profile] = policy;
        });
      } else {
        this.policy[target.replace('profile', '') as Profile] = policy;
      }
      return 'Ok.\r\n';
    }

    if (args[1] === 'firewall' && (args[2] === 'add' || args[2] === 'delete')) {
      const nameArg = args.find((arg) => arg.startsWith('name=')) ?? '';
      const name = nameArg.slice('name='.length);
      if (args[2] === 'add') this.rules.add(name);
      else this.rules.delete(name);
      return 'Ok.\r\n';
    }

    throw new Error(`unexpected netsh args: ${args.join(' ')}`);
  }

  private profileOutput(): string {
    const lines: string[] = [];
    for (const profile of ['domain', 'private', 'public'] as Profile[]) {
      const title = profile.charAt(0).toUpperCase() + profile.slice(1);
      lines.push(`${title} Profile Settings: `);
      lines.push('----------------------------------------------------------------------');
      lines.push(`Firewall Policy                       ${displayPolicy(this.policy[profile])}`);
      lines.push('');
    }
    lines.push('Ok.');
    return lines.join('\r\n');
  }

  private handleReg(args: string[]): CommandResult {
    const verb = args[0];
    const nameIndex = args.indexOf('/v');
    const name = nameIndex === -1 ? '' : args[nameIndex + 1];

    if (verb === 'query') {
      const value = this.registry.get(name);
      if (!value) throw missingValueError();
      const displayed =
        value.type === 'REG_DWORD' ? `0x${Number(value.data).toString(16)}` : value.data;
      return {
        stdout:
          '\r\nHKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings\r\n' +
          `    ${name}    ${value.type}    ${displayed}\r\n\r\n`,
        stderr: ''
      };
    }

    if (verb === 'add') {
      this.registry.set(name, { type: args[args.indexOf('/t') + 1], data: args[args.indexOf('/d') + 1] });
      return { stdout: 'The operation completed successfully.\r\n', stderr: '' };
    }

    if (verb === 'delete') {
      if (!this.registry.has(name)) throw missingValueError();
      this.registry.delete(name);
      return { stdout: 'The operation completed successfully.\r\n', stderr: '' };
    }

    throw new Error(`unexpected reg args: ${args.join(' ')}`);
  }
}

/* ------------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------------ */

const netshCommands = (fake: FakeSystem): string[] =>
  fake.calls.filter((call) => call.command === 'netsh').map((call) => call.args.join(' '));

const mutatingRegCommands = (fake: FakeSystem): CommandCall[] =>
  fake.calls.filter((call) => call.command === 'reg' && (call.args[0] === 'add' || call.args[0] === 'delete'));

const readStateFile = (statePath: string): any => JSON.parse(fs.readFileSync(statePath, 'utf8'));

let fake: FakeSystem;
let tmpDir: string;
let statePath: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ryox-ks-proxy-'));
  statePath = path.join(tmpDir, 'killswitch-state.json');
  setAppStateFilePathForTests(statePath);
  fake = new FakeSystem();
  setCommandRunnerForTests(fake.run);
});

afterEach(() => {
  setCommandRunnerForTests(undefined);
  setAppStateFilePathForTests(undefined);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

/* ------------------------------------------------------------------------ *
 * DEFECT 1 — kill switch must not block the core's own outbound traffic.
 * ------------------------------------------------------------------------ */

describe.skipIf(process.platform !== 'win32')('KillSwitch — default-policy arming (defect 1)', () => {
  it('switches the profile default policy and adds allow rules, never an explicit block rule', async () => {
    const armed = await KillSwitch.arm(process.execPath);

    expect(armed).toBe(true);
    expect(KillSwitch.isArmed()).toBe(true);

    const commands = netshCommands(fake);
    expect(commands).toContain('advfirewall set allprofiles firewallpolicy blockinbound,blockoutbound');
    expect(commands.some((command) => command.includes('action=block'))).toBe(false);
    expect(fake.rules).toEqual(
      new Set(['RYOX-KillSwitch-AllowCore', 'RYOX-KillSwitch-AllowTun', 'RYOX-KillSwitch-AllowLoopback'])
    );
    expect(commands).toContain(
      'advfirewall firewall add rule name=RYOX-KillSwitch-AllowCore dir=out action=allow enable=yes ' +
        `profile=any program=${process.execPath}`
    );
    expect(commands).toContain(
      'advfirewall firewall add rule name=RYOX-KillSwitch-AllowTun dir=out action=allow enable=yes profile=any interface=ryox-tun'
    );
    expect(commands).toContain(
      'advfirewall firewall add rule name=RYOX-KillSwitch-AllowLoopback dir=out action=allow enable=yes profile=any remoteip=127.0.0.1'
    );

    // The original policy is captured on disk before anything changes.
    const state = readStateFile(statePath);
    expect(state.armed).toBe(true);
    expect(state.firewallPolicy.entries).toEqual([
      { profile: 'domain', policy: 'blockinbound,allowoutbound' },
      { profile: 'private', policy: 'blockinbound,allowoutbound' },
      { profile: 'public', policy: 'blockinbound,allowoutbound' }
    ]);

    await KillSwitch.disarm();

    expect(KillSwitch.isArmed()).toBe(false);
    expect(fake.rules.size).toBe(0);
    expect(fake.policy).toEqual({
      domain: 'blockinbound,allowoutbound',
      private: 'blockinbound,allowoutbound',
      public: 'blockinbound,allowoutbound'
    });
    expect(fs.existsSync(statePath)).toBe(false);
  });

  it('rolls the policy back and returns false when a firewall step fails', async () => {
    fake.failure = (command, args) =>
      command === 'netsh' && args.join(' ').startsWith('advfirewall firewall add rule name=RYOX-KillSwitch-AllowTun')
        ? 'The requested operation requires elevation.'
        : undefined;

    const armed = await KillSwitch.arm(process.execPath);

    expect(armed).toBe(false);
    expect(KillSwitch.isArmed()).toBe(false);
    expect(fake.rules.size).toBe(0);
    expect(fake.policy).toEqual({
      domain: 'blockinbound,allowoutbound',
      private: 'blockinbound,allowoutbound',
      public: 'blockinbound,allowoutbound'
    });

    const commands = netshCommands(fake);
    expect(commands).toContain('advfirewall set domainprofile firewallpolicy blockinbound,allowoutbound');
    expect(commands).toContain('advfirewall set privateprofile firewallpolicy blockinbound,allowoutbound');
    expect(commands).toContain('advfirewall set publicprofile firewallpolicy blockinbound,allowoutbound');
    expect(fs.existsSync(statePath)).toBe(false);
  });

  it('refuses to arm without administrator rights and never touches the firewall', async () => {
    fake.failure = (command) => (command === 'fltmc' ? 'Access is denied.' : undefined);

    expect(await KillSwitch.arm(process.execPath)).toBe(false);
    expect(KillSwitch.isArmed()).toBe(false);
    expect(netshCommands(fake)).toEqual([]);
    expect(fs.existsSync(statePath)).toBe(false);
  });

  it('fails closed when the current policy cannot be parsed (nothing is changed)', async () => {
    fake.showRaw = 'Firewall Policy                       البادئة\nOk.\n';

    expect(await KillSwitch.arm(process.execPath)).toBe(false);
    expect(netshCommands(fake).some((command) => command.startsWith('advfirewall set'))).toBe(false);
    expect(fake.rules.size).toBe(0);
    expect(fs.existsSync(statePath)).toBe(false);
  });

  it('restores the exact per-profile policy captured before arming (crash recovery)', async () => {
    fake.policy = {
      domain: 'blockinbound,allowoutbound',
      private: 'allowinbound,allowoutbound',
      public: 'blockinbound,allowoutbound'
    };

    expect(await KillSwitch.arm(process.execPath)).toBe(true);
    expect(fake.policy).toEqual({
      domain: 'blockinbound,blockoutbound',
      private: 'blockinbound,blockoutbound',
      public: 'blockinbound,blockoutbound'
    });

    // Simulate a restart: the process died while armed, the state file survived.
    expect(await KillSwitch.restorePreviousPolicy()).toBe(true);
    expect(fake.policy).toEqual({
      domain: 'blockinbound,allowoutbound',
      private: 'allowinbound,allowoutbound',
      public: 'blockinbound,allowoutbound'
    });
    expect(fake.rules.size).toBe(0);
    expect(fs.existsSync(statePath)).toBe(false);
  });

  it('recovers a crashed session before capturing, so the real policy is preserved', async () => {
    fs.writeFileSync(
      statePath,
      JSON.stringify({
        version: 1,
        armed: true,
        armedAt: '2026-01-01T00:00:00.000Z',
        firewallPolicy: {
          entries: [
            { profile: 'domain', policy: 'blockinbound,allowoutbound' },
            { profile: 'private', policy: 'blockinbound,allowoutbound' },
            { profile: 'public', policy: 'blockinbound,allowoutbound' }
          ],
          raw: ''
        }
      }),
      'utf8'
    );
    // What a crashed RYOX session left live:
    fake.policy = {
      domain: 'blockinbound,blockoutbound',
      private: 'blockinbound,blockoutbound',
      public: 'blockinbound,blockoutbound'
    };

    expect(await KillSwitch.arm(process.execPath)).toBe(true);
    expect(readStateFile(statePath).firewallPolicy.entries).toEqual([
      { profile: 'domain', policy: 'blockinbound,allowoutbound' },
      { profile: 'private', policy: 'blockinbound,allowoutbound' },
      { profile: 'public', policy: 'blockinbound,allowoutbound' }
    ]);

    await KillSwitch.disarm();
    expect(fake.policy).toEqual({
      domain: 'blockinbound,allowoutbound',
      private: 'blockinbound,allowoutbound',
      public: 'blockinbound,allowoutbound'
    });
  });

  it('falls back to blockinbound,allowoutbound only for its own all-profiles signature', async () => {
    // A hand-written, partial block policy is none of our business.
    fake.policy = {
      domain: 'blockinbound,allowoutbound',
      private: 'blockinbound,blockoutbound',
      public: 'blockinbound,allowoutbound'
    };
    expect(await KillSwitch.restorePreviousPolicy()).toBe(false);
    expect(netshCommands(fake).some((command) => command.startsWith('advfirewall set'))).toBe(false);

    // Our own block-all signature with no state file left behind: unblock.
    fake.calls.length = 0;
    fake.policy = {
      domain: 'blockinbound,blockoutbound',
      private: 'blockinbound,blockoutbound',
      public: 'blockinbound,blockoutbound'
    };
    expect(await KillSwitch.restorePreviousPolicy()).toBe(true);
    expect(fake.policy).toEqual({
      domain: 'blockinbound,allowoutbound',
      private: 'blockinbound,allowoutbound',
      public: 'blockinbound,allowoutbound'
    });
  });

  it('unblocks when the state file is corrupt and outbound is still blocked', async () => {
    fs.writeFileSync(statePath, '{ not json', 'utf8');
    fake.policy = {
      domain: 'blockinbound,blockoutbound',
      private: 'blockinbound,blockoutbound',
      public: 'blockinbound,blockoutbound'
    };

    expect(await KillSwitch.restorePreviousPolicy()).toBe(true);
    expect(fake.policy.public).toBe('blockinbound,allowoutbound');
    expect(fs.existsSync(statePath)).toBe(false);
  });

  it('never touches a permissive policy when there is nothing to recover', async () => {
    expect(await KillSwitch.restorePreviousPolicy()).toBe(false);
    expect(netshCommands(fake).some((command) => command.startsWith('advfirewall set'))).toBe(false);
    expect(fs.existsSync(statePath)).toBe(false);
  });
});

/* ------------------------------------------------------------------------ *
 * DEFECT 2 — system proxy snapshot / refresh / crash cleanup.
 * ------------------------------------------------------------------------ */

describe.skipIf(process.platform !== 'win32')('SystemProxyManager — snapshot, refresh and startup cleanup (defect 2)', () => {
  it('snapshots the previous proxy configuration and restores it exactly on disableProxy', async () => {
    fake.registry.set('ProxyEnable', { type: 'REG_DWORD', data: '0' });
    fake.registry.set('ProxyServer', { type: 'REG_SZ', data: 'corp.proxy.local:3128' });
    fake.registry.set('ProxyOverride', { type: 'REG_SZ', data: '<local>' });

    await expect(SystemProxyManager.enableProxy(10808)).resolves.toBe(true);

    expect(fake.registry.get('ProxyEnable')).toEqual({ type: 'REG_DWORD', data: '1' });
    expect(fake.registry.get('ProxyServer')).toEqual({ type: 'REG_SZ', data: '127.0.0.1:10808' });
    expect(fake.registry.get('ProxyOverride')?.data).toContain('<local>');

    // The previous values are persisted next to the kill-switch state.
    expect(readStateFile(statePath).systemProxy.proxyServer).toEqual({
      type: 'REG_SZ',
      data: 'corp.proxy.local:3128'
    });
    expect(readStateFile(statePath).systemProxy.proxyEnable).toEqual({ type: 'REG_DWORD', data: '0' });
    // WinINet is notified, so already-running browsers pick the change up.
    expect(fake.calls.some((call) => call.command === 'powershell.exe')).toBe(true);

    await expect(SystemProxyManager.disableProxy()).resolves.toBeUndefined();

    expect(fake.registry.get('ProxyEnable')).toEqual({ type: 'REG_DWORD', data: '0' });
    expect(fake.registry.get('ProxyServer')).toEqual({ type: 'REG_SZ', data: 'corp.proxy.local:3128' });
    expect(fake.registry.get('ProxyOverride')).toEqual({ type: 'REG_SZ', data: '<local>' });
    expect(fs.existsSync(statePath)).toBe(false);
  });

  it('deletes values that did not exist before instead of inventing them', async () => {
    await expect(SystemProxyManager.enableProxy(10808)).resolves.toBe(true);
    expect(fake.registry.get('ProxyServer')).toEqual({ type: 'REG_SZ', data: '127.0.0.1:10808' });

    await expect(SystemProxyManager.disableProxy()).resolves.toBeUndefined();

    expect(fake.registry.size).toBe(0);
    const commands = mutatingRegCommands(fake).map((call) => call.args.join(' '));
    expect(commands).toContain(
      'delete HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings /v ProxyEnable /f'
    );
    expect(commands).toContain(
      'delete HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings /v ProxyServer /f'
    );
  });

  it('returns false and rolls back when a registry write fails', async () => {
    fake.registry.set('ProxyEnable', { type: 'REG_DWORD', data: '0' });
    fake.registry.set('ProxyServer', { type: 'REG_SZ', data: 'corp.proxy.local:3128' });

    let failedOnce = false;
    fake.failure = (command, args) => {
      if (!failedOnce && command === 'reg' && args[0] === 'add' && args[args.indexOf('/v') + 1] === 'ProxyServer') {
        failedOnce = true;
        return 'ERROR: Access is denied.';
      }
      return undefined;
    };

    await expect(SystemProxyManager.enableProxy(10808)).resolves.toBe(false);

    // Whatever the failure point, the user's own values are back.
    expect(fake.registry.get('ProxyEnable')).toEqual({ type: 'REG_DWORD', data: '0' });
    expect(fake.registry.get('ProxyServer')).toEqual({ type: 'REG_SZ', data: 'corp.proxy.local:3128' });
    expect(fs.existsSync(statePath)).toBe(false);
  });

  it('is a strict no-op when this process never applied the proxy', async () => {
    fake.registry.set('ProxyEnable', { type: 'REG_DWORD', data: '1' });
    fake.registry.set('ProxyServer', { type: 'REG_SZ', data: 'corp.proxy.local:3128' });
    fake.registry.set('ProxyOverride', { type: 'REG_SZ', data: '<local>' });

    await expect(SystemProxyManager.disableProxy()).resolves.toBeUndefined();

    // No subprocess is spawned at all, so an unconditional teardown cannot
    // stamp ProxyEnable=0 over a configuration we never touched.
    expect(fake.calls).toEqual([]);
    expect(fake.registry.get('ProxyEnable')).toEqual({ type: 'REG_DWORD', data: '1' });
    expect(fake.registry.get('ProxyServer')).toEqual({ type: 'REG_SZ', data: 'corp.proxy.local:3128' });
  });

  it('returns false without touching the registry when the snapshot cannot be captured', async () => {
    fake.registry.set('ProxyEnable', { type: 'REG_DWORD', data: '0' });
    fake.registry.set('ProxyServer', { type: 'REG_SZ', data: 'corp.proxy.local:3128' });
    fake.failureExitCode = 5;
    fake.failure = (command, args) =>
      command === 'reg' && args[0] === 'query' ? 'ERROR: Access is denied.' : undefined;

    await expect(SystemProxyManager.enableProxy(10808)).resolves.toBe(false);

    expect(mutatingRegCommands(fake)).toEqual([]);
    expect(fake.registry.get('ProxyEnable')).toEqual({ type: 'REG_DWORD', data: '0' });
    expect(fake.registry.get('ProxyServer')).toEqual({ type: 'REG_SZ', data: 'corp.proxy.local:3128' });
    expect(fs.existsSync(statePath)).toBe(false);
  });

  it('restoreOnStartup acts only when the live proxy still points at our own loopback port', async () => {
    fs.writeFileSync(
      statePath,
      JSON.stringify({
        version: 1,
        systemProxy: {
          proxyEnable: { type: 'REG_DWORD', data: '1' },
          proxyServer: { type: 'REG_SZ', data: 'corp.proxy.local:3128' },
          proxyOverride: { type: 'REG_SZ', data: '<local>' },
          activeProxyServer: '127.0.0.1:10808',
          snapshotAt: '2026-01-01T00:00:00.000Z'
        }
      }),
      'utf8'
    );

    // Our dead loopback proxy is still live → restore the user's own settings.
    fake.registry.set('ProxyEnable', { type: 'REG_DWORD', data: '1' });
    fake.registry.set('ProxyServer', { type: 'REG_SZ', data: '127.0.0.1:10808' });
    fake.registry.set('ProxyOverride', { type: 'REG_SZ', data: '<local>;localhost;127.*;10.*;172.16.*;192.168.*' });

    await expect(SystemProxyManager.restoreOnStartup()).resolves.toBe(true);
    expect(fake.registry.get('ProxyServer')).toEqual({ type: 'REG_SZ', data: 'corp.proxy.local:3128' });
    expect(fake.registry.get('ProxyEnable')).toEqual({ type: 'REG_DWORD', data: '1' });
    expect(fake.calls.some((call) => call.command === 'powershell.exe')).toBe(true);
    expect(fs.existsSync(statePath)).toBe(false);

    // A proxy the user configured afterwards must never be clobbered.
    fake.calls.length = 0;
    fake.registry.set('ProxyServer', { type: 'REG_SZ', data: 'user.own.proxy:8080' });

    await expect(SystemProxyManager.restoreOnStartup()).resolves.toBe(false);
    expect(fake.registry.get('ProxyServer')).toEqual({ type: 'REG_SZ', data: 'user.own.proxy:8080' });
    expect(mutatingRegCommands(fake)).toEqual([]);
  });

  it('removes a dead loopback proxy on startup when no snapshot survived', async () => {
    fake.registry.set('ProxyEnable', { type: 'REG_DWORD', data: '1' });
    fake.registry.set('ProxyServer', { type: 'REG_SZ', data: '127.0.0.1:10808' });
    fake.registry.set('ProxyOverride', { type: 'REG_SZ', data: '<local>;localhost;127.*;10.*;172.16.*;192.168.*' });

    await expect(SystemProxyManager.restoreOnStartup()).resolves.toBe(true);

    expect(fake.registry.has('ProxyServer')).toBe(false);
    expect(fake.registry.has('ProxyOverride')).toBe(false);
    expect(fake.registry.get('ProxyEnable')).toEqual({ type: 'REG_DWORD', data: '0' });
  });

  it('is idempotent — a second startup restore is a no-op', async () => {
    fake.registry.set('ProxyEnable', { type: 'REG_DWORD', data: '1' });
    fake.registry.set('ProxyServer', { type: 'REG_SZ', data: '127.0.0.1:10808' });

    await expect(SystemProxyManager.restoreOnStartup()).resolves.toBe(true);
    fake.calls.length = 0;

    await expect(SystemProxyManager.restoreOnStartup()).resolves.toBe(false);
    expect(mutatingRegCommands(fake)).toEqual([]);
    expect(fake.registry.get('ProxyEnable')).toEqual({ type: 'REG_DWORD', data: '0' });
  });
});
