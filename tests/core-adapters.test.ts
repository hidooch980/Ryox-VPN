import { describe, it, expect } from 'vitest';
import { SingBoxAdapter } from '../src/main/core/adapters/SingBoxAdapter';
import { XrayAdapter } from '../src/main/core/adapters/XrayAdapter';
import { MihomoAdapter } from '../src/main/core/adapters/MihomoAdapter';
import { VpnServerConfig, AppSettings } from '../src/shared/types';

describe('CoreAdapters', () => {
  const sampleServer: VpnServerConfig = {
    id: 'test-node-1',
    name: 'US-Reality',
    server: 'us.edge.net',
    port: 443,
    protocol: 'vless',
    core: 'sing-box',
    uuid: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    tls: 'reality',
    sni: 'microsoft.com',
    publicKey: 'samplepubkey',
    shortId: '123456',
    flow: 'xtls-rprx-vision',
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  const sampleSettings: AppSettings = {
    tunnelMode: 'TUN',
    routingMode: 'Rule',
    autoConnectOnLaunch: false,
    startMinimized: false,
    killSwitch: true,
    dnsServers: ['1.1.1.1'],
    customDnsEnabled: true,
    dnsOverHttps: true,
    dohUrl: 'https://1.1.1.1/dns-query',
    activeCore: 'sing-box',
    inboundHttpPort: 10809,
    inboundSocksPort: 10808,
    allowLan: false,
    bypassChinaAndIranLan: true,
    bypassPrivateIps: true,
    theme: 'cyberpunk',
    accentColor: '#00e5ff',
    language: 'fa'
  };

  it('SingBoxAdapter should generate valid sing-box TUN configuration', () => {
    const config: any = SingBoxAdapter.generateConfig(sampleServer, sampleSettings);
    expect(config).toBeDefined();
    expect(config.inbounds).toBeDefined();
    
    // Check tun inbound
    const tunInbound = config.inbounds.find((i: any) => i.type === 'tun');
    expect(tunInbound).toBeDefined();
    expect(tunInbound.interface_name).toBe('ryox-tun');
    expect(tunInbound.auto_route).toBe(true);

    // Check proxy outbound
    const proxyOutbound = config.outbounds.find((o: any) => o.tag === 'proxy');
    expect(proxyOutbound).toBeDefined();
    expect(proxyOutbound.type).toBe('vless');
    expect(proxyOutbound.server).toBe('us.edge.net');
    expect(proxyOutbound.tls.reality.enabled).toBe(true);
  });

  it('XrayAdapter should generate valid Xray-core JSON configuration', () => {
    const config: any = XrayAdapter.generateConfig(sampleServer, sampleSettings);
    expect(config).toBeDefined();
    expect(config.inbounds).toBeDefined();

    // Check socks in
    const socksIn = config.inbounds.find((i: any) => i.tag === 'socks-in');
    expect(socksIn).toBeDefined();
    expect(socksIn.port).toBe(10808);

    // Check reality streamSettings
    const proxyOut = config.outbounds.find((o: any) => o.tag === 'proxy');
    expect(proxyOut.streamSettings.security).toBe('reality');
    expect(proxyOut.streamSettings.realitySettings.publicKey).toBe('samplepubkey');
  });

  it('MihomoAdapter should generate valid Clash Meta YAML configuration', () => {
    const yamlString = MihomoAdapter.generateConfig(sampleServer, sampleSettings);
    expect(yamlString).toContain('mixed-port: 10808');
    expect(yamlString).toContain('tun:');
    expect(yamlString).toContain('auto-route: true');
    expect(yamlString).toContain('US-Reality');
  });
});
