import { VpnServerConfig, AppSettings } from '../../../shared/types';

/**
 * Small shared vocabulary for the three config adapters.
 *
 * The adapters directory has no shared module (this change is scoped to the
 * adapter files themselves), so the error type and the rule constants every
 * adapter needs live here, next to the core that owns the widest protocol set.
 */

export type UnsupportedKind = 'protocol' | 'transport';

/**
 * Raised when a node asks for something the selected core cannot serve.
 *
 * It exists so a config that would be rejected — or worse, silently mis-loaded
 * — by the core is refused up front, at config-build time, with a message that
 * names the core and the feature. `CoreManager.startCore()` catches it, logs
 * `Cannot build a <core> configuration: …` and fails the connection instead of
 * spawning a core that will never carry traffic.
 */
export class UnsupportedCoreFeatureError extends Error {
  public readonly code: string;
  public readonly core: string;
  public readonly kind: UnsupportedKind;
  public readonly value: string;

  constructor(core: string, kind: UnsupportedKind, value: string) {
    super(`${core} core cannot serve ${kind} "${value}"`);
    this.name = 'UnsupportedCoreFeatureError';
    this.code = kind === 'protocol' ? 'UNSUPPORTED_PROTOCOL' : 'UNSUPPORTED_TRANSPORT';
    this.core = core;
    this.kind = kind;
    this.value = value;
  }
}

/**
 * Ad domains that are rejected. An inline list, not `geosite:category-ads-all`:
 * the app ships no geosite.dat/geoip.dat, and Xray refuses to start at all when
 * it is told to load geodata that is not there.
 */
export const BLOCKED_DOMAINS = ['doubleclick.net', 'googleadservices.com'];

/** RFC1918 + loopback + link-local, as plain CIDRs (no geodata needed). */
export const PRIVATE_IPV4_CIDRS = [
  '10.0.0.0/8',
  '172.16.0.0/12',
  '192.168.0.0/16',
  '127.0.0.0/8',
  '169.254.0.0/16'
];

export const PRIVATE_IPV6_CIDRS = ['::1/128', 'fc00::/7', 'fe80::/10'];

/** Xray takes both families in one `ip` list. */
export const PRIVATE_IP_CIDRS = [...PRIVATE_IPV4_CIDRS, ...PRIVATE_IPV6_CIDRS];

/**
 * Shadowsocks 2022 ciphers take a base64 *key*, not a passphrase, and the key
 * length is fixed by the cipher. A wrong-length key makes sing-box/Xray fail at
 * startup with a bare "bad key" message, so reject it here instead.
 */
export function assertShadowsocksKey(server: VpnServerConfig): void {
  const method = server.method || '';
  if (!method.startsWith('2022-')) return;

  const expected = method.includes('aes-256') || method.includes('chacha20') ? 32 : 16;
  const password = server.password || '';
  const base64 = /^[A-Za-z0-9+/]+={0,2}$/.test(password) && password.length % 4 === 0;
  const decoded = base64 ? Buffer.from(password, 'base64') : Buffer.alloc(0);

  if (!base64 || decoded.length !== expected) {
    throw new Error(
      `shadowsocks method "${method}" needs a base64 key of ${expected} bytes, got ` +
        `${base64 ? `${decoded.length} bytes` : JSON.stringify(password)}`
    );
  }
}

/** sing-box outbound type for each protocol it can serve; wireguard is an endpoint. */
const SING_BOX_OUTBOUND_TYPES: Partial<Record<string, string>> = {
  vless: 'vless',
  vmess: 'vmess',
  trojan: 'trojan',
  shadowsocks: 'shadowsocks',
  hysteria2: 'hysteria2',
  tuic: 'tuic',
  socks5: 'socks',
  http: 'http'
};

export class SingBoxAdapter {
  public static generateConfig(server: VpnServerConfig, settings: AppSettings): object {
    const isTun = settings.tunnelMode === 'TUN';

    const inbounds: any[] = [
      {
        type: 'mixed',
        tag: 'mixed-in',
        listen: settings.allowLan ? '0.0.0.0' : '127.0.0.1',
        listen_port: settings.inboundSocksPort || 10808
      }
    ];

    if (isTun) {
      inbounds.push({
        type: 'tun',
        tag: 'tun-in',
        interface_name: 'ryox-tun',
        // sing-box 1.12 removed inet4_address/inet6_address in favour of
        // `address`. Keeping the legacy keys makes 1.14 abort at startup:
        // "legacy tun address fields are deprecated in sing-box 1.10.0 and
        // removed in sing-box 1.12.0".
        address: ['172.19.0.1/30'],
        auto_route: true,
        strict_route: settings.killSwitch,
        stack: 'system'
      });
    }

    const proxy = this.buildProxy(server, settings);

    const outbounds: any[] = proxy.endpoint ? [] : [proxy.outbound];
    outbounds.push({ type: 'direct', tag: 'direct' });

    const rules: any[] = [{ protocol: 'dns', action: 'hijack-dns' }];
    const routingMode = settings.routingMode || 'Rule';

    // Direct/Global are single-outbound modes: the rule list must not divert
    // anything, so only the catch-all below is emitted for them. Rule mode
    // honours the block/bypass lists.
    if (routingMode === 'Rule') {
      // `action: 'reject'` replaces the pre-1.11 `{type:'block'}` outbound and
      // `outbound: 'block'` rules, both removed in sing-box 1.13.
      rules.push({ domain_suffix: BLOCKED_DOMAINS, action: 'reject' });

      if (settings.bypassChinaAndIranLan) {
        rules.push({ domain_suffix: ['.ir', '.cn'], action: 'route', outbound: 'direct' });
      }

      if (settings.bypassPrivateIps) {
        rules.push({ ip_is_private: true, action: 'route', outbound: 'direct' });
      }
    }

    const wantsDirect = routingMode === 'Direct';
    rules.push({ network: ['tcp', 'udp'], action: 'route', outbound: wantsDirect ? 'direct' : 'proxy' });

    const config: any = {
      log: {
        level: 'warn',
        timestamp: true
      },
      dns: {
        servers: [
          {
            tag: 'remote-dns',
            type: 'udp',
            server: settings.customDnsEnabled && settings.dnsServers[0] ? settings.dnsServers[0] : '1.1.1.1',
            detour: 'proxy'
          },
          {
            tag: 'direct-dns',
            type: 'local',
            detour: 'direct'
          }
        ],
        final: 'remote-dns',
        strategy: 'prefer_ipv4'
      },
      inbounds,
      outbounds,
      route: {
        rules,
        // The tunnel's default outbound. Required when the proxy is a
        // wireguard *endpoint* rather than an outbound.
        final: wantsDirect ? 'direct' : 'proxy',
        auto_detect_interface: true,
        default_domain_resolver: 'direct-dns'
      }
    };

    if (proxy.endpoint) {
      config.endpoints = [proxy.endpoint];
    }

    // Optional telemetry endpoint. Emitted only when a port is configured, so a
    // default install produces byte-identical config to before this feature.
    if (typeof settings.clashApiPort === 'number' && settings.clashApiPort > 0) {
      config.experimental = {
        clash_api: {
          external_controller: `127.0.0.1:${settings.clashApiPort}`,
          secret: settings.clashApiSecret
        }
      };
    }

    return config;
  }

  private static buildProxy(
    server: VpnServerConfig,
    settings: AppSettings
  ): { outbound?: any; endpoint?: any } {
    if (server.protocol === 'wireguard') {
      return { endpoint: this.buildWireGuardEndpoint(server) };
    }

    const type = SING_BOX_OUTBOUND_TYPES[server.protocol];
    if (!type) {
      throw new UnsupportedCoreFeatureError('sing-box', 'protocol', server.protocol);
    }

    const outbound: any = {
      tag: 'proxy',
      type,
      server: server.server,
      server_port: server.port
    };

    switch (server.protocol) {
      case 'vless':
        outbound.uuid = server.uuid;
        if (server.flow) outbound.flow = server.flow;
        this.attachTls(outbound, server, settings);
        this.attachTransport(outbound, server);
        break;

      case 'vmess':
        outbound.uuid = server.uuid;
        outbound.security = 'auto';
        outbound.alter_id = 0;
        this.attachTls(outbound, server, settings);
        this.attachTransport(outbound, server);
        break;

      case 'trojan':
        outbound.password = server.password;
        this.attachTls(outbound, server, settings);
        this.attachTransport(outbound, server);
        break;

      case 'shadowsocks':
        assertShadowsocksKey(server);
        outbound.method = server.method || 'aes-128-gcm';
        outbound.password = server.password;
        break;

      case 'hysteria2':
        outbound.password = server.password;
        this.applyQuicTls(outbound, server);
        break;

      case 'tuic':
        outbound.uuid = server.uuid;
        outbound.password = server.password;
        outbound.congestion_control = 'bbr';
        this.applyQuicTls(outbound, server);
        break;

      case 'socks5':
        outbound.version = '5';
        if (server.password) outbound.password = server.password;
        break;

      case 'http':
        if (server.password) outbound.password = server.password;
        break;
    }

    return { outbound };
  }

  /**
   * WireGuard is an *endpoint* in sing-box 1.11+, not an outbound. The legacy
   * outbound form (peer_public_key/local_address on an outbound) is rejected by
   * 1.14 and must never come back.
   */
  private static buildWireGuardEndpoint(server: VpnServerConfig): any {
    if (!server.privateKey || !server.peerPublicKey) {
      throw new Error('wireguard requires both privateKey and peerPublicKey');
    }

    const peer: any = {
      address: server.server,
      port: server.port,
      public_key: server.peerPublicKey,
      allowed_ips: ['0.0.0.0/0', '::/0'],
      persistent_keepalive_interval: 25
    };

    if (server.presharedKey) peer.pre_shared_key = server.presharedKey;

    return {
      type: 'wireguard',
      tag: 'proxy',
      address: server.address && server.address.length > 0 ? server.address : ['10.0.0.2/32'],
      private_key: server.privateKey,
      peers: [peer],
      mtu: server.mtu || 1420
    };
  }

  private static applyQuicTls(outbound: any, server: VpnServerConfig): void {
    outbound.tls = {
      enabled: true,
      server_name: server.sni || server.server,
      alpn: server.alpn || ['h3']
    };

    if (server.allowInsecure === true) {
      outbound.tls.insecure = true;
    }
  }

  private static attachTls(outbound: any, server: VpnServerConfig, settings: AppSettings): void {
    if (server.tls === 'reality') {
      outbound.tls = {
        enabled: true,
        server_name: server.sni || server.server,
        reality: {
          enabled: true,
          public_key: server.publicKey,
          short_id: server.shortId || ''
        },
        utls: {
          enabled: true,
          fingerprint: server.fingerprint || 'chrome'
        }
      };
    } else if (server.tls === 'tls') {
      outbound.tls = {
        enabled: true,
        server_name: server.sni || server.server,
        alpn: server.alpn || ['h2', 'http/1.1'],
        utls: {
          enabled: true,
          fingerprint: server.fingerprint || 'chrome'
        }
      };
    }

    if (!outbound.tls) return;

    // 1.14: `tls.fragment` is a boolean record-fragment switch. The old
    // {enabled,size,sleep} object fails to unmarshal ("cannot unmarshal object
    // into Go struct field OutboundTLSOptions.tls.fragment").
    if (settings.enableTlsFragment) {
      outbound.tls.record_fragment = true;
    }

    if (server.allowInsecure === true) {
      outbound.tls.insecure = true;
    }
  }

  /**
   * Maps the node's `network` onto a real sing-box transport. Anything that
   * cannot be expressed is refused: silently falling back to raw TCP dials the
   * wrong transport and the handshake fails with no useful error.
   */
  private static attachTransport(outbound: any, server: VpnServerConfig): void {
    const host = server.host || server.sni || server.server;

    switch (server.network) {
      case 'ws':
        outbound.transport = {
          type: 'ws',
          path: server.path || '/',
          headers: {
            Host: host
          }
        };
        break;

      case 'grpc':
        outbound.transport = {
          type: 'grpc',
          service_name: server.path || ''
        };
        break;

      case 'http':
        outbound.transport = {
          type: 'http',
          host: [host],
          path: server.path || '/'
        };
        // The HTTP transport speaks HTTP/2, so the TLS ALPN must say so.
        if (outbound.tls) outbound.tls.alpn = ['h2'];
        break;

      case 'quic':
        if (!outbound.tls || outbound.tls.enabled !== true) {
          throw new Error('sing-box "quic" transport requires TLS, but this server has none');
        }
        outbound.transport = { type: 'quic' };
        outbound.tls.alpn = ['h3'];
        break;

      case 'kcp':
        // sing-box has no mKCP transport (it was never ported from v2ray).
        throw new UnsupportedCoreFeatureError('sing-box', 'transport', 'kcp');

      case 'tcp':
      case undefined:
        break;

      default:
        throw new UnsupportedCoreFeatureError('sing-box', 'transport', String(server.network));
    }
  }
}
