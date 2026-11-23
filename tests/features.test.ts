import { describe, it, expect } from 'vitest';
import { WarpService } from '../src/main/warp/WarpService';
import { CleanIpScanner } from '../src/main/scanner/CleanIpScanner';
import { RealSpeedTester } from '../src/main/diagnostics/RealSpeedTester';
import { SingBoxAdapter } from '../src/main/core/adapters/SingBoxAdapter';
import { XrayAdapter } from '../src/main/core/adapters/XrayAdapter';
import { VpnServerConfig, AppSettings } from '../src/shared/types';

describe('New Advanced Features Test Suite', () => {
  it('WarpService generates valid Curve25519 WireGuard profile with Clean IP', async () => {
    const warp = await WarpService.generateWarpProfile('188.114.96.1');
    expect(warp).toBeDefined();
    expect(warp.protocol).toBe('wireguard');
    expect(warp.core).toBe('sing-box');
    expect(warp.server).toBe('188.114.96.1');
    expect(warp.privateKey).toBeDefined();
    expect(warp.privateKey?.length).toBeGreaterThan(20);
    expect(warp.peerPublicKey).toBe('bmXOC+F1FxEMF9dyiK2H5/1SUtzH0JuVo51h2wMbgyo=');
    expect(warp.address).toContain('172.16.0.2/32');
  });

  it('CleanIpScanner returns sorted IP latency list', async () => {
    const results = await CleanIpScanner.scan(443, 200); // short timeout for testing
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]).toHaveProperty('ip');
    expect(results[0]).toHaveProperty('latencyMs');
    expect(results[0]).toHaveProperty('status');
  });

  it('RealSpeedTester reports a real measurement or an honest failure — never an invented number', async () => {
    const speed = await RealSpeedTester.testDownloadSpeed();

    expect(speed).toBeDefined();

    if (speed.measured) {
      expect(speed.downloadMbps).toBeGreaterThan(0);
      expect(speed.downloadMBps).toBeGreaterThan(0);
      expect(speed.durationMs).toBeGreaterThan(0);
      expect(speed.bytesReceived).toBeGreaterThan(0);
    } else {
      // A measurement that could not be taken must be reported as zero with a
      // reason, instead of the fabricated "18.5 Mbps" the old code returned.
      expect(speed.downloadMbps).toBe(0);
      expect(speed.downloadMBps).toBe(0);
      expect(speed.bytesReceived).toBe(0);
      expect(speed.reason).toBeTruthy();
    }
  }, 30000);

  it('SingBoxAdapter injects TLS fragment configuration when enabled in settings', () => {
    const server: VpnServerConfig = {
      id: 'test-vless',
      name: 'Test VLESS',
      server: 'example.com',
      port: 443,
      protocol: 'vless',
      core: 'sing-box',
      uuid: '11111111-2222-3333-4444-555555555555',
      tls: 'tls',
      sni: 'example.com',
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    const settings: AppSettings = {
      tunnelMode: 'TUN',
      routingMode: 'Rule',
      autoConnectOnLaunch: false,
      startMinimized: false,
      killSwitch: false,
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
      language: 'fa',
      enableTlsFragment: true,
      fragmentLength: '50-100',
      fragmentInterval: '10-20'
    };

    const config: any = SingBoxAdapter.generateConfig(server, settings);
    const proxyOut = config.outbounds.find((o: any) => o.tag === 'proxy');
    // sing-box 1.12+ replaced the `tls.fragment` object with a boolean
    // `record_fragment` switch; the object is now rejected by `sing-box check`
    // ("cannot unmarshal object into Go struct field
    // OutboundTLSOptions.tls.fragment"). fragmentLength/fragmentInterval are no
    // longer expressible in the sing-box TLS object, so only the switch is
    // asserted here.
    expect(proxyOut.tls.record_fragment).toBe(true);
    expect(proxyOut.tls.fragment).toBeUndefined();
  });

  it('XrayAdapter injects dialerProxy fragment outbound when enabled', () => {
    const server: VpnServerConfig = {
      id: 'test-vless',
      name: 'Test VLESS',
      server: 'example.com',
      port: 443,
      protocol: 'vless',
      core: 'xray',
      uuid: '11111111-2222-3333-4444-555555555555',
      tls: 'tls',
      sni: 'example.com',
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    const settings: AppSettings = {
      tunnelMode: 'TUN',
      routingMode: 'Rule',
      autoConnectOnLaunch: false,
      startMinimized: false,
      killSwitch: false,
      dnsServers: ['1.1.1.1'],
      customDnsEnabled: true,
      dnsOverHttps: true,
      dohUrl: 'https://1.1.1.1/dns-query',
      activeCore: 'xray',
      inboundHttpPort: 10809,
      inboundSocksPort: 10808,
      allowLan: false,
      bypassChinaAndIranLan: true,
      bypassPrivateIps: true,
      theme: 'cyberpunk',
      accentColor: '#00e5ff',
      language: 'fa',
      enableTlsFragment: true,
      fragmentLength: '50-100',
      fragmentInterval: '10-20'
    };

    const config: any = XrayAdapter.generateConfig(server, settings);
    const proxyOut = config.outbounds.find((o: any) => o.tag === 'proxy');
    expect(proxyOut.streamSettings.sockopt.dialerProxy).toBe('fragment');

    const fragmentOut = config.outbounds.find((o: any) => o.tag === 'fragment');
    expect(fragmentOut).toBeDefined();
    expect(fragmentOut.settings.fragment.length).toBe('50-100');
    expect(fragmentOut.settings.fragment.interval).toBe('10-20');
  });
});
