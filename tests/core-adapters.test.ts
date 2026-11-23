import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as yamlLib from 'yaml';
import { SingBoxAdapter } from '../src/main/core/adapters/SingBoxAdapter';
import { XrayAdapter } from '../src/main/core/adapters/XrayAdapter';
import { MihomoAdapter } from '../src/main/core/adapters/MihomoAdapter';
import { VpnServerConfig, AppSettings } from '../src/shared/types';

/**
 * The real cores, when they are dropped into bin/ (`*.exe` is git-ignored, so
 * on a clean checkout these are absent and every binary test skips instead of
 * failing).
 */
const BIN_DIR = path.resolve(process.cwd(), 'bin');

function corePath(name: string): string | null {
  const file = path.join(BIN_DIR, process.platform === 'win32' ? `${name}.exe` : name);
  return fs.existsSync(file) ? file : null;
}

const singBoxBin = corePath('sing-box');
const xrayBin = corePath('xray');
const mihomoBin = corePath('mihomo');

function writeTempConfig(content: string, ext: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ryox-test-'));
  const file = path.join(dir, `config.${ext}`);
  fs.writeFileSync(file, content, 'utf-8');
  return file;
}

function runCore(binary: string, args: string[]): void {
  try {
    execFileSync(binary, args, { stdio: ['ignore', 'pipe', 'pipe'], timeout: 20000, windowsHide: true });
  } catch (err) {
    const failure = err as { stdout?: Buffer; stderr?: Buffer; message?: string };
    const output = `${failure.stdout ? failure.stdout.toString() : ''}${failure.stderr ? failure.stderr.toString() : ''}${failure.message || ''}`;
    throw new Error(`${path.basename(binary)} rejected the generated config:\n${output}`);
  }
}

function singBoxAccepts(binary: string, config: object): void {
  runCore(binary, ['check', '-c', writeTempConfig(JSON.stringify(config, null, 2), 'json')]);
}

function xrayAccepts(binary: string, config: object): void {
  runCore(binary, ['-test', '-config', writeTempConfig(JSON.stringify(config, null, 2), 'json')]);
}

function mihomoAccepts(binary: string, config: string): void {
  runCore(binary, ['-t', '-f', writeTempConfig(config, 'yaml')]);
}

function captureError(fn: () => unknown): any {
  try {
    fn();
  } catch (err) {
    return err;
  }
  throw new Error('expected the adapter to throw, but it returned a config');
}

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

  const withServer = (overrides: Partial<VpnServerConfig>): VpnServerConfig =>
    ({ ...sampleServer, ...overrides }) as VpnServerConfig;

  const withSettings = (overrides: Partial<AppSettings>): AppSettings =>
    ({ ...sampleSettings, ...overrides }) as AppSettings;

  const proxyOf = (config: any): any => config.outbounds.find((o: any) => o.tag === 'proxy');

  const tlsServer = withServer({
    tls: 'tls',
    network: 'ws',
    path: '/ray',
    host: 'cdn.example.com',
    sni: 'cdn.example.com'
  });

  /**
   * `sampleServer` uses a placeholder reality key on purpose (unit assertions
   * only). The real cores parse a reality public key as base64url, so binary
   * tests need a well-formed one.
   */
  const realServer = withServer({
    publicKey: '6j_S1-n8vU3gR13k5lq0bFqA0C9Z6-Z1yA0pP1k7l_8',
    shortId: '6ba85580',
    sni: 'www.microsoft.com'
  });

  const wireGuardServer = withServer({
    protocol: 'wireguard',
    server: 'wg.edge.net',
    port: 51820,
    tls: 'none',
    privateKey: 'yAnz5TF+lXXJte14tji3zlMNq+hd2rYUIgJBgB3fBmk=',
    peerPublicKey: 'xTIBA5rboUvnH4htodjb6e697QjLERt1NAB4mZqp8Dg=',
    address: ['10.7.0.2/32'],
    mtu: 1420
  });

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

  // --- defect 1: sing-box 1.12 removed the legacy TUN address keys ---------

  it('SingBoxAdapter TUN inbound uses `address`, never inet4_address', () => {
    const config: any = SingBoxAdapter.generateConfig(sampleServer, sampleSettings);
    const tun = config.inbounds.find((i: any) => i.type === 'tun');
    expect(tun.address).toEqual(['172.19.0.1/30']);
    expect(tun.inet4_address).toBeUndefined();
    expect(tun.inet6_address).toBeUndefined();
  });

  // --- defect 2: sing-box 1.14 wants a boolean record_fragment ------------

  it('SingBoxAdapter emits a boolean record_fragment instead of the removed fragment object', () => {
    const quiet: any = SingBoxAdapter.generateConfig(sampleServer, sampleSettings);
    expect(proxyOf(quiet).tls.record_fragment).toBeUndefined();

    const config: any = SingBoxAdapter.generateConfig(sampleServer, withSettings({ enableTlsFragment: true }));
    const tls = proxyOf(config).tls;
    expect(tls.record_fragment).toBe(true);
    expect(typeof tls.fragment).not.toBe('object');
  });

  // --- defect 3: wireguard is an endpoint in sing-box 1.11+ --------------

  it('SingBoxAdapter emits wireguard as a modern endpoint, not an outbound', () => {
    const config: any = SingBoxAdapter.generateConfig(wireGuardServer, sampleSettings);

    expect(config.endpoints).toHaveLength(1);
    expect(config.endpoints[0]).toMatchObject({
      type: 'wireguard',
      tag: 'proxy',
      private_key: wireGuardServer.privateKey,
      address: ['10.7.0.2/32'],
      mtu: 1420
    });
    expect(config.endpoints[0].peers[0]).toMatchObject({
      address: 'wg.edge.net',
      port: 51820,
      public_key: wireGuardServer.peerPublicKey,
      allowed_ips: ['0.0.0.0/0', '::/0']
    });
    expect(config.outbounds.some((o: any) => o.type === 'wireguard')).toBe(false);
    // The endpoint tag must be reachable, otherwise nothing is tunnelled.
    expect(config.route.final).toBe('proxy');
    expect(config.route.rules.some((r: any) => r.outbound === 'proxy')).toBe(true);
  });

  // --- defect 4: shadowsocks 2022 keys are raw base64 keys ----------------

  it('adapters reject a shadowsocks 2022 node whose key is not the right size', () => {
    const bad = withServer({
      protocol: 'shadowsocks',
      method: '2022-blake3-aes-128-gcm',
      password: 'not-a-base64-key'
    });

    expect(captureError(() => SingBoxAdapter.generateConfig(bad, sampleSettings)).message).toMatch(
      /needs a base64 key of 16 bytes/
    );
    expect(() => XrayAdapter.generateConfig(bad, sampleSettings)).toThrow(/base64 key of 16 bytes/);
    expect(() => MihomoAdapter.generateConfig(bad, sampleSettings)).toThrow(/base64 key of 16 bytes/);

    const good = withServer({
      protocol: 'shadowsocks',
      method: '2022-blake3-aes-128-gcm',
      password: 'MDEyMzQ1Njc4OWFiY2RlZg=='
    });
    expect((SingBoxAdapter.generateConfig(good, sampleSettings) as any).outbounds[0]).toMatchObject({
      type: 'shadowsocks',
      method: '2022-blake3-aes-128-gcm',
      password: 'MDEyMzQ1Njc4OWFiY2RlZg=='
    });
  });

  // --- defect 5/6: no geodata rules anywhere ------------------------------

  it('XrayAdapter and MihomoAdapter use inline rules, never geosite/geoip data', () => {
    const xray: any = XrayAdapter.generateConfig(sampleServer, sampleSettings);
    expect(JSON.stringify(xray)).not.toMatch(/geosite:|geoip:/);
    const direct = xray.routing.rules.find((r: any) => Array.isArray(r.ip));
    expect(direct.ip).toContain('10.0.0.0/8');
    expect(direct.ip).toContain('fc00::/7');

    const clash: any = yamlLib.parse(MihomoAdapter.generateConfig(sampleServer, sampleSettings));
    expect(clash.rules).not.toContain('GEOIP,private,DIRECT');
    expect(clash.rules).toContain('IP-CIDR,10.0.0.0/8,DIRECT,no-resolve');
    expect(clash.rules).toContain('IP-CIDR6,fc00::/7,DIRECT,no-resolve');
  });

  it('MihomoAdapter maps shadowsocks to `ss` and names the TUN device', () => {
    const ss = withServer({ protocol: 'shadowsocks', method: 'aes-256-gcm', password: 'p@ssw0rd' });
    const clash: any = yamlLib.parse(MihomoAdapter.generateConfig(ss, sampleSettings));

    expect(clash.proxies[0].type).toBe('ss');
    expect(clash.proxies[0].cipher).toBe('aes-256-gcm');
    expect(clash.tun.device).toBe('ryox-tun');
    expect(clash.tun.enable).toBe(true);
  });

  // --- defect 7: allowInsecure plumbing ----------------------------------

  it('allowInsecure reaches all three cores and changes nothing when absent', () => {
    const insecureReality = withServer({ allowInsecure: true });

    const singBox: any = SingBoxAdapter.generateConfig(insecureReality, sampleSettings);
    expect(proxyOf(singBox).tls.insecure).toBe(true);
    expect(proxyOf(SingBoxAdapter.generateConfig(sampleServer, sampleSettings)).tls.insecure).toBeUndefined();

    const xrayReality: any = XrayAdapter.generateConfig(insecureReality, sampleSettings);
    expect(xrayReality.outbounds[0].streamSettings.realitySettings.allowInsecure).toBe(true);

    const xrayTls: any = XrayAdapter.generateConfig(withServer({ ...tlsServer, allowInsecure: true }), sampleSettings);
    expect(xrayTls.outbounds[0].streamSettings.tlsSettings.verifyPeerCertByName).toBe('cdn.example.com');

    // Xray 25+/26 removed tlsSettings.allowInsecure — even `false` is fatal.
    const clean: any = XrayAdapter.generateConfig(tlsServer, sampleSettings);
    expect(clean.outbounds[0].streamSettings.tlsSettings.allowInsecure).toBeUndefined();
    expect(clean.outbounds[0].streamSettings.tlsSettings.verifyPeerCertByName).toBeUndefined();

    const trojan: any = yamlLib.parse(
      MihomoAdapter.generateConfig(withServer({ protocol: 'trojan', password: 'p', allowInsecure: true }), sampleSettings)
    );
    expect(trojan.proxies[0]['skip-cert-verify']).toBe(true);
    const trojanClean: any = yamlLib.parse(
      MihomoAdapter.generateConfig(withServer({ protocol: 'trojan', password: 'p' }), sampleSettings)
    );
    expect(trojanClean.proxies[0]['skip-cert-verify']).toBeUndefined();
  });

  // --- defect 8: refuse protocols the core cannot serve -------------------

  it('XrayAdapter throws instead of emitting a config Xray cannot load', () => {
    for (const protocol of ['hysteria2', 'tuic', 'wireguard', 'openvpn'] as const) {
      const err = captureError(() => XrayAdapter.generateConfig(withServer({ protocol }), sampleSettings));
      expect(err.message).toBe(`Xray core cannot serve protocol "${protocol}"`);
      expect(err.name).toBe('UnsupportedCoreFeatureError');
      expect(err.code).toBe('UNSUPPORTED_PROTOCOL');
    }
  });

  it('SingBoxAdapter and MihomoAdapter throw for openvpn', () => {
    const openvpn = withServer({ protocol: 'openvpn' });
    expect(() => SingBoxAdapter.generateConfig(openvpn, sampleSettings)).toThrow(
      'sing-box core cannot serve protocol "openvpn"'
    );
    expect(() => MihomoAdapter.generateConfig(openvpn, sampleSettings)).toThrow(
      'Mihomo core cannot serve protocol "openvpn"'
    );
  });

  it('SingBoxAdapter throws for vless without TLS towards a public IP, like Xray does', () => {
    const publicVless = withServer({ tls: 'none', server: '203.0.113.10' });
    expect(() => XrayAdapter.generateConfig(publicVless, sampleSettings)).toThrow(/without TLS/);

    // ...but a domain, or a private address, is fine.
    expect(() => XrayAdapter.generateConfig(withServer({ tls: 'none' }), sampleSettings)).not.toThrow();
    expect(() =>
      XrayAdapter.generateConfig(withServer({ tls: 'none', server: '10.7.0.2' }), sampleSettings)
    ).not.toThrow();
  });

  // --- defect 9/10: transports and the removed block outbound -------------

  it('SingBoxAdapter maps every supported transport and refuses the rest', () => {
    const httpServer = withServer({ network: 'http', path: '/h2', host: 'cdn.example.com' });
    expect(proxyOf(SingBoxAdapter.generateConfig(httpServer, sampleSettings)).transport).toEqual({
      type: 'http',
      host: ['cdn.example.com'],
      path: '/h2'
    });

    const quicServer = withServer({ network: 'quic' });
    const quic = proxyOf(SingBoxAdapter.generateConfig(quicServer, sampleSettings));
    expect(quic.transport).toEqual({ type: 'quic' });
    expect(quic.tls.alpn).toEqual(['h3']);

    const noTls = withServer({ network: 'quic', tls: 'none' });
    expect(() => SingBoxAdapter.generateConfig(noTls, sampleSettings)).toThrow(/requires TLS/);

    const kcp = withServer({ network: 'kcp' });
    const err = captureError(() => SingBoxAdapter.generateConfig(kcp, sampleSettings));
    expect(err.message).toBe('sing-box core cannot serve transport "kcp"');
    expect(err.code).toBe('UNSUPPORTED_TRANSPORT');

    // tcp is the absence of a transport, not an error.
    expect(proxyOf(SingBoxAdapter.generateConfig(withServer({ network: 'tcp' }), sampleSettings)).transport).toBeUndefined();
  });

  it('XrayAdapter maps http to XHTTP stream-one and keeps kcp', () => {
    const httpServer = withServer({ ...tlsServer, network: 'http', path: '/h2', host: 'cdn.example.com' });
    const xhttp = XrayAdapter.generateConfig(httpServer, sampleSettings) as any;
    expect(xhttp.outbounds[0].streamSettings.network).toBe('xhttp');
    expect(xhttp.outbounds[0].streamSettings.xhttpSettings).toEqual({
      host: 'cdn.example.com',
      path: '/h2',
      mode: 'stream-one'
    });
    expect(xhttp.outbounds[0].streamSettings.tlsSettings.alpn).toEqual(['h2']);

    const kcp = XrayAdapter.generateConfig(withServer({ ...tlsServer, network: 'kcp' }), sampleSettings) as any;
    expect(kcp.outbounds[0].streamSettings.network).toBe('kcp');
    expect(kcp.outbounds[0].streamSettings.kcpSettings.mtu).toBe(1350);

    const grpc = XrayAdapter.generateConfig(withServer({ ...tlsServer, network: 'grpc', path: 'svc' }), sampleSettings) as any;
    expect(grpc.outbounds[0].streamSettings.grpcSettings).toEqual({ serviceName: 'svc' });
  });

  it('SingBoxAdapter no longer emits the removed block outbound or block rules', () => {
    const config: any = SingBoxAdapter.generateConfig(sampleServer, sampleSettings);
    expect(config.outbounds.some((o: any) => o.type === 'block')).toBe(false);
    expect(config.route.rules.some((r: any) => r.outbound === 'block')).toBe(false);
    expect(config.route.rules.some((r: any) => r.action === 'reject')).toBe(true);
  });

  // --- the real cores have the final say ----------------------------------

  describe('real core binaries', () => {
    it.skipIf(!singBoxBin)('sing-box accepts the TUN + vless + reality config', () => {
      singBoxAccepts(singBoxBin as string, SingBoxAdapter.generateConfig(realServer, sampleSettings));
    });

    it.skipIf(!singBoxBin)('sing-box accepts the wireguard endpoint config', () => {
      singBoxAccepts(singBoxBin as string, SingBoxAdapter.generateConfig(wireGuardServer, sampleSettings));
    });

    it.skipIf(!singBoxBin)('sing-box accepts the TLS fragment config', () => {
      singBoxAccepts(
        singBoxBin as string,
        SingBoxAdapter.generateConfig(realServer, withSettings({ enableTlsFragment: true }))
      );
    });

    it.skipIf(!singBoxBin)('sing-box accepts the http transport config', () => {
      const httpServer = withServer({ ...tlsServer, network: 'http', path: '/h2', host: 'cdn.example.com' });
      singBoxAccepts(singBoxBin as string, SingBoxAdapter.generateConfig(httpServer, sampleSettings));
    });

    it.skipIf(!xrayBin)('Xray accepts vless + reality + vision', () => {
      xrayAccepts(xrayBin as string, XrayAdapter.generateConfig(realServer, sampleSettings));
    });

    it.skipIf(!xrayBin)('Xray accepts vless + ws + tls', () => {
      xrayAccepts(xrayBin as string, XrayAdapter.generateConfig(tlsServer, sampleSettings));
    });

    it.skipIf(!xrayBin)('Xray accepts the XHTTP (http) transport it replaced HTTP/2 with', () => {
      const httpServer = withServer({ ...tlsServer, network: 'http', path: '/h2', host: 'cdn.example.com' });
      xrayAccepts(xrayBin as string, XrayAdapter.generateConfig(httpServer, sampleSettings));
    });

    it.skipIf(!xrayBin)('Xray accepts shadowsocks and socks5 outbounds', () => {
      xrayAccepts(
        xrayBin as string,
        XrayAdapter.generateConfig(
          withServer({ protocol: 'shadowsocks', method: 'aes-256-gcm', password: 'p@ssw0rd', tls: 'none' }),
          sampleSettings
        )
      );
      xrayAccepts(
        xrayBin as string,
        XrayAdapter.generateConfig(withServer({ protocol: 'socks5', password: 'socks-pass', tls: 'none' }), sampleSettings)
      );
    });

    it.skipIf(!mihomoBin)('Mihomo accepts the shadowsocks `ss` proxy', () => {
      const ss = withServer({
        protocol: 'shadowsocks',
        method: '2022-blake3-aes-128-gcm',
        password: 'MDEyMzQ1Njc4OWFiY2RlZg==',
        tls: 'none'
      });
      mihomoAccepts(mihomoBin as string, MihomoAdapter.generateConfig(ss, sampleSettings));
    });

    it.skipIf(!mihomoBin)('Mihomo accepts vless + reality and the h2 transport', () => {
      mihomoAccepts(mihomoBin as string, MihomoAdapter.generateConfig(realServer, sampleSettings));
      const httpServer = withServer({ ...tlsServer, network: 'http', path: '/h2', host: 'cdn.example.com' });
      mihomoAccepts(mihomoBin as string, MihomoAdapter.generateConfig(httpServer, sampleSettings));
    });
  });
});
