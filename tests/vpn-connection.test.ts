import { describe, it, expect } from 'vitest';
import { VpnConnectionManager } from '../src/main/vpn/VpnConnectionManager';
import { CoreManager } from '../src/main/core/CoreManager';
import { VpnServerConfig, AppSettings } from '../src/shared/types';
import * as os from 'os';
import * as path from 'path';

describe('VpnConnectionManager', () => {
  const tmpDir = path.join(os.tmpdir(), `ryox-test-${Date.now()}`);
  const coreManager = new CoreManager(tmpDir);

  const testSettings: AppSettings = {
    tunnelMode: 'SystemProxy',
    routingMode: 'Rule',
    autoConnectOnLaunch: false,
    startMinimized: false,
    killSwitch: false,
    dnsServers: ['1.1.1.1'],
    customDnsEnabled: true,
    dnsOverHttps: false,
    dohUrl: '',
    activeCore: 'sing-box',
    inboundHttpPort: 10809,
    inboundSocksPort: 10808,
    allowLan: false,
    bypassChinaAndIranLan: true,
    bypassPrivateIps: true,
    theme: 'cyberpunk',
    accentColor: '#00e5ff'
  };

  const sampleServer: VpnServerConfig = {
    id: 'test-conn-1',
    name: 'Test Server',
    server: '127.0.0.1',
    port: 443,
    protocol: 'vless',
    core: 'sing-box',
    uuid: '11111111-2222-3333-4444-555555555555',
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  it('should transition through state machine properly: DISCONNECTED -> CONNECTED -> DISCONNECTED', async () => {
    const vpn = new VpnConnectionManager(coreManager, testSettings);
    expect(vpn.getState()).toBe('DISCONNECTED');

    const statesRecorded: string[] = [];
    vpn.on('state-changed', (s) => statesRecorded.push(s));

    const connected = await vpn.connect(sampleServer);
    expect(connected).toBe(true);
    expect(vpn.getState()).toBe('CONNECTED');

    const stats = vpn.getStats();
    expect(stats.connectionState).toBe('CONNECTED');
    expect(stats.activeServer?.id).toBe(sampleServer.id);

    await vpn.disconnect();
    expect(vpn.getState()).toBe('DISCONNECTED');

    expect(statesRecorded).toContain('CONNECTING');
    expect(statesRecorded).toContain('VERIFYING');
    expect(statesRecorded).toContain('CONNECTED');
    expect(statesRecorded).toContain('DISCONNECTED');
  });
});
