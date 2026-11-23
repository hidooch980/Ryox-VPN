import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as net from 'net';
import * as os from 'os';
import * as path from 'path';
import { VpnConnectionManager } from '../src/main/vpn/VpnConnectionManager';
import { CoreManager } from '../src/main/core/CoreManager';
import { VpnServerConfig, AppSettings, SupportedCore } from '../src/shared/types';

const REPO_BIN = path.resolve(__dirname, '..', 'bin');
const SING_BOX = path.join(REPO_BIN, process.platform === 'win32' ? 'sing-box.exe' : 'sing-box');
const hasRealCore = fs.existsSync(SING_BOX);

/** A TCP listener standing in for the core's local inbound port. */
async function startFakeInbound(): Promise<{ port: number; close: () => Promise<void> }> {
  const server = net.createServer(() => undefined);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address() as net.AddressInfo;
  return {
    port: address.port,
    close: () => new Promise<void>((resolve) => server.close(() => resolve()))
  };
}

function portIsOpen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: '127.0.0.1', port });
    const done = (result: boolean) => {
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(1500);
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
    socket.once('timeout', () => done(false));
  });
}

async function waitFor(predicate: () => boolean, timeoutMs = 3000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return predicate();
}

function baseSettings(overrides: Partial<AppSettings> = {}): AppSettings {
  return {
    // 'Tun' keeps the tests away from the real Windows registry: the system
    // proxy is only applied for the 'SystemProxy' tunnel mode.
    tunnelMode: 'Tun',
    routingMode: 'Rule',
    autoConnectOnLaunch: false,
    startMinimized: false,
    killSwitch: false,
    dnsServers: ['1.1.1.1'],
    customDnsEnabled: true,
    dnsOverHttps: false,
    dohUrl: '',
    activeCore: 'sing-box',
    inboundHttpPort: 0,
    inboundSocksPort: 0,
    allowLan: false,
    bypassChinaAndIranLan: true,
    bypassPrivateIps: true,
    theme: 'cyberpunk',
    accentColor: '#00e5ff',
    language: 'fa',
    ...overrides
  };
}

const sampleServer: VpnServerConfig = {
  id: 'test-conn-1',
  name: 'Test Server',
  server: '127.0.0.1',
  port: 443,
  protocol: 'trojan',
  core: 'sing-box',
  password: 'test-password',
  tls: 'tls',
  sni: 'example.com',
  createdAt: Date.now(),
  updatedAt: Date.now()
};

/** CoreManager double that never spawns anything. */
class StubCoreManager extends CoreManager {
  public started = false;
  public shouldStart = true;
  public startDelayMs = 0;
  private exitCallback?: (code: number | null, signal: NodeJS.Signals | null) => void;

  constructor() {
    super(path.join(os.tmpdir(), `ryox-stub-${Date.now()}-${Math.random().toString(16).slice(2)}`));
  }

  public setExitCallback(cb?: (code: number | null, signal: NodeJS.Signals | null) => void): void {
    this.exitCallback = cb;
  }

  public async startCore(): Promise<boolean> {
    if (this.startDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.startDelayMs));
    }
    this.started = this.shouldStart;
    return this.shouldStart;
  }

  public async stopCore(): Promise<void> {
    this.started = false;
  }

  public isRunning(): boolean {
    return this.started;
  }

  public getRunningCore(): SupportedCore | null {
    return this.started ? 'sing-box' : null;
  }

  public getBinaryPath(): string {
    return path.join(REPO_BIN, 'sing-box.exe');
  }

  public simulateUnexpectedExit(code = 1): void {
    this.started = false;
    this.exitCallback?.(code, null);
  }
}

describe('CoreManager readiness', () => {
  const cleanups: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanups.length > 0) {
      const cleanup = cleanups.pop();
      if (cleanup) await cleanup();
    }
  });

  it('refuses to start (instead of faking a tunnel) when no core binary is installed', async () => {
    const tmpDir = path.join(os.tmpdir(), `ryox-nobin-${Date.now()}`);
    // No binDirs override: nothing is installed in this throwaway profile.
    const manager = new CoreManager(tmpDir);

    const started = await manager.startCore(sampleServer, baseSettings({ inboundSocksPort: 10888 }));

    expect(started).toBe(false);
    expect(manager.isRunning()).toBe(false);
    expect(manager.getRunningCore()).toBeNull();
  });

  it.skipIf(!hasRealCore)('starts the real core, listens on the inbound port, and stops it again', async () => {
    const inbound = await startFakeInbound();
    // The fake listener occupies a port; pick a *different* free one for the core.
    await inbound.close();

    const freePort = inbound.port;
    const manager = new CoreManager(path.join(os.tmpdir(), `ryox-real-${Date.now()}`), {
      binDirs: [REPO_BIN]
    });

    // 'SystemProxy' mode produces a plain (non-TUN) config, which a core can run
    // without administrator rights.
    const settings = baseSettings({ tunnelMode: 'SystemProxy', inboundSocksPort: freePort });

    const started = await manager.startCore(sampleServer, settings);
    expect(started).toBe(true);
    expect(manager.isRunning()).toBe(true);
    expect(await portIsOpen(freePort)).toBe(true);

    await manager.stopCore();
    expect(manager.isRunning()).toBe(false);
    expect(await portIsOpen(freePort)).toBe(false);
  }, 30000);
});

describe('VpnConnectionManager', () => {
  const cleanups: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanups.length > 0) {
      const cleanup = cleanups.pop();
      if (cleanup) await cleanup();
    }
  });

  it('reports an error instead of CONNECTED when the engine cannot start', async () => {
    const tmpDir = path.join(os.tmpdir(), `ryox-nocore-${Date.now()}`);
    const vpn = new VpnConnectionManager(new CoreManager(tmpDir), baseSettings({ inboundSocksPort: 10889 }));

    const connected = await vpn.connect(sampleServer);

    expect(connected).toBe(false);
    expect(vpn.getState()).toBe('ERROR');
  });

  it('aborts an in-flight connect when disconnect() arrives during the handshake', async () => {
    const inbound = await startFakeInbound();
    cleanups.push(inbound.close);

    const core = new StubCoreManager();
    core.startDelayMs = 300;
    const vpn = new VpnConnectionManager(core, baseSettings({ inboundSocksPort: inbound.port }));

    const pending = vpn.connect(sampleServer);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(vpn.getState()).toBe('CONNECTING');

    await vpn.disconnect();
    const connected = await pending;

    expect(connected).toBe(false);
    expect(vpn.getState()).toBe('DISCONNECTED');
  });

  it('tears the session down when the core dies on its own', async () => {
    const inbound = await startFakeInbound();
    cleanups.push(inbound.close);

    const core = new StubCoreManager();
    const vpn = new VpnConnectionManager(core, baseSettings({ inboundSocksPort: inbound.port }));

    expect(await vpn.connect(sampleServer)).toBe(true);
    expect(vpn.getState()).toBe('CONNECTED');

    core.simulateUnexpectedExit(1);
    // Tearing down the session is asynchronous (proxy + kill switch + core).
    expect(await waitFor(() => vpn.getState() === 'ERROR')).toBe(true);

    expect(vpn.getState()).toBe('ERROR');
    expect(vpn.getStats().activeServer).toBeUndefined();
  });

  it('walks to the next node when the fastest one cannot establish a tunnel', async () => {
    const { SmartConnectService } = await import('../src/main/vpn/SmartConnectService');
    const inbound = await startFakeInbound();
    cleanups.push(inbound.close);

    const core = new StubCoreManager();
    const vpn = new VpnConnectionManager(core, baseSettings({ inboundSocksPort: inbound.port }));
    const service = new SmartConnectService([], vpn);

    // Both nodes are 127.0.0.1 with the fake inbound port, so both probe as
    // reachable; the first is made to fail at the handshake.
    const nodes: VpnServerConfig[] = [
      { ...sampleServer, id: 'node-a', name: 'node-a', port: inbound.port },
      { ...sampleServer, id: 'node-b', name: 'node-b', port: inbound.port }
    ];

    let attempts = 0;
    const originalStart = core.startCore.bind(core);
    core.startCore = async () => {
      attempts += 1;
      if (attempts === 1) {
        core.shouldStart = false;
        const result = await originalStart();
        core.shouldStart = true;
        return result;
      }
      return originalStart();
    };

    const connected = await service.smartConnect(nodes);

    // The first node the ranking picks must fail, and smart connect must walk on
    // to the second one instead of giving up (which is what it used to do).
    expect(attempts).toBe(2);
    expect(connected).not.toBeNull();
    expect(['node-a', 'node-b']).toContain(connected?.id);
  }, 20000);
});
