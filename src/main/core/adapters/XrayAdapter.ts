import { VpnServerConfig, AppSettings } from '../../../shared/types';
import {
  UnsupportedCoreFeatureError,
  BLOCKED_DOMAINS,
  PRIVATE_IP_CIDRS,
  assertShadowsocksKey
} from './SingBoxAdapter';

/** Xray outbound protocol for each node protocol it can actually serve. */
const XRAY_PROTOCOLS: Partial<Record<string, string>> = {
  vless: 'vless',
  vmess: 'vmess',
  trojan: 'trojan',
  shadowsocks: 'shadowsocks',
  socks5: 'socks',
  http: 'http'
};

/**
 * True only for IPv4 literals that are routable on the public internet.
 *
 * Xray refuses `vless` without TLS towards such an address ("vless without TLS
 * or other encryption is prohibited unless the server address is a private IP
 * or domain"), so the adapter has to make the same distinction. Anything that is
 * not a plain public IPv4 literal — a hostname, IPv6, private/loopback/
 * link-local/CGNAT space — is left to the core.
 */
function isPublicIpLiteral(host: string | undefined): boolean {
  if (!host || !/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return false;

  const [a, b] = host.split('.').map((part) => Number(part));
  if ([a, b].some((part) => part > 255)) return false;

  if (a === 10) return false;
  if (a === 127) return false;
  if (a === 0) return false;
  if (a >= 224) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 169 && b === 254) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;

  return true;
}

export class XrayAdapter {
  public static generateConfig(server: VpnServerConfig, settings: AppSettings): object {
    const inboundSocksPort = settings.inboundSocksPort || 10808;
    const inboundHttpPort = settings.inboundHttpPort || 10809;

    const inbounds = [
      {
        tag: 'socks-in',
        port: inboundSocksPort,
        listen: settings.allowLan ? '0.0.0.0' : '127.0.0.1',
        protocol: 'socks',
        settings: {
          auth: 'noauth',
          udp: true
        },
        sniffing: {
          enabled: true,
          destOverride: ['http', 'tls', 'quic'],
          routeOnly: true
        }
      },
      {
        tag: 'http-in',
        port: inboundHttpPort,
        listen: settings.allowLan ? '0.0.0.0' : '127.0.0.1',
        protocol: 'http',
        settings: {
          allowTransparent: false
        }
      }
    ];

    const proxyOutbound = this.buildOutbound(server);
    if (settings.enableTlsFragment) {
      if (!proxyOutbound.streamSettings) proxyOutbound.streamSettings = {};
      if (!proxyOutbound.streamSettings.sockopt) proxyOutbound.streamSettings.sockopt = {};
      proxyOutbound.streamSettings.sockopt.dialerProxy = 'fragment';
    }

    const outbounds: any[] = [
      proxyOutbound,
      {
        tag: 'direct',
        protocol: 'freedom',
        settings: {},
        streamSettings: {
          sockopt: {
            domainStrategy: 'UseIP'
          }
        }
      },
      {
        tag: 'block',
        protocol: 'blackhole',
        settings: {
          response: {
            type: 'http'
          }
        }
      }
    ];

    if (settings.enableTlsFragment) {
      outbounds.push({
        tag: 'fragment',
        protocol: 'freedom',
        settings: {
          fragment: {
            packets: 'tlshello',
            length: settings.fragmentLength || '100-200',
            interval: settings.fragmentInterval || '10-20'
          }
        },
        streamSettings: {
          sockopt: {
            tcpNoDelay: true
          }
        }
      });
    }

    // An inline domain list, never `geosite:*`/`geoip:*`: the app ships no
    // geosite.dat/geoip.dat, and Xray refuses to start when a rule needs
    // geodata that is missing ("failed to open geosite.dat").
    const routingRules: any[] = [
      {
        type: 'field',
        outboundTag: 'block',
        domain: BLOCKED_DOMAINS
      }
    ];

    if (settings.bypassChinaAndIranLan) {
      // Without geodata only the TLD part of the bypass can be expressed.
      routingRules.push({
        type: 'field',
        outboundTag: 'direct',
        domain: ['.ir', '.cn']
      });
    }

    if (settings.bypassPrivateIps) {
      routingRules.push({
        type: 'field',
        outboundTag: 'direct',
        ip: PRIVATE_IP_CIDRS
      });
    }

    if (settings.routingMode === 'Direct') {
      routingRules.unshift({
        type: 'field',
        outboundTag: 'direct',
        network: 'tcp,udp'
      });
    } else if (settings.routingMode === 'Global') {
      routingRules.unshift({
        type: 'field',
        outboundTag: 'proxy',
        network: 'tcp,udp'
      });
    } else {
      // Rule mode: default route to proxy
      routingRules.push({
        type: 'field',
        outboundTag: 'proxy',
        network: 'tcp,udp'
      });
    }

    return {
      log: {
        loglevel: 'warning'
      },
      dns: {
        servers:
          settings.customDnsEnabled && settings.dnsServers.length > 0
            ? settings.dnsServers
            : ['1.1.1.1', '8.8.8.8', 'localhost']
      },
      inbounds,
      outbounds,
      routing: {
        domainStrategy: 'IPIfNonMatch',
        rules: routingRules
      }
    };
  }

  private static buildOutbound(server: VpnServerConfig): any {
    const protocol = XRAY_PROTOCOLS[server.protocol];
    if (!protocol) {
      // hysteria2 / tuic / wireguard / openvpn: "infra/conf: unknown config id".
      throw new UnsupportedCoreFeatureError('Xray', 'protocol', server.protocol);
    }

    if (
      server.protocol === 'vless' &&
      server.tls !== 'tls' &&
      server.tls !== 'reality' &&
      isPublicIpLiteral(server.server)
    ) {
      throw new Error(
        `Xray refuses vless without TLS towards the public IP ${server.server} — ` +
          'use sing-box for this node or pick a TLS/reality server'
      );
    }

    const outbound: any = {
      tag: 'proxy',
      protocol,
      settings: {},
      streamSettings: {}
    };

    switch (server.protocol) {
      case 'vless':
        outbound.settings = {
          vnext: [
            {
              address: server.server,
              port: server.port,
              users: [
                {
                  id: server.uuid,
                  encryption: 'none',
                  flow: server.flow || ''
                }
              ]
            }
          ]
        };
        break;

      case 'vmess':
        outbound.settings = {
          vnext: [
            {
              address: server.server,
              port: server.port,
              users: [
                {
                  id: server.uuid,
                  alterId: 0,
                  security: 'auto'
                }
              ]
            }
          ]
        };
        break;

      case 'trojan':
        outbound.settings = {
          servers: [
            {
              address: server.server,
              port: server.port,
              password: server.password
            }
          ]
        };
        break;

      case 'shadowsocks':
        assertShadowsocksKey(server);
        outbound.settings = {
          servers: [
            {
              address: server.server,
              port: server.port,
              method: server.method || 'aes-128-gcm',
              password: server.password
            }
          ]
        };
        break;

      case 'socks5':
        outbound.settings = {
          servers: [this.buildCredentialServer(server)]
        };
        break;

      case 'http':
        outbound.settings = {
          servers: [this.buildCredentialServer(server)]
        };
        break;
    }

    outbound.streamSettings = this.buildStreamSettings(server);
    return outbound;
  }

  private static buildCredentialServer(server: VpnServerConfig): any {
    const entry: any = {
      address: server.server,
      port: server.port
    };

    if (server.password) {
      // VpnServerConfig has no username field: these proxies only ever carry a
      // password, everything else is "no auth".
      entry.user = '';
      entry.pass = server.password;
    }

    return entry;
  }

  private static buildStreamSettings(server: VpnServerConfig): any {
    const stream: any = {
      network: 'tcp'
    };

    if (server.tls === 'reality') {
      stream.security = 'reality';
      stream.realitySettings = {
        show: false,
        fingerprint: server.fingerprint || 'chrome',
        serverName: server.sni || server.server,
        publicKey: server.publicKey,
        shortId: server.shortId || '',
        spiderX: server.spiderX || '/'
      };
      if (server.allowInsecure === true) {
        stream.realitySettings.allowInsecure = true;
      }
    } else if (server.tls === 'tls') {
      stream.security = 'tls';
      stream.tlsSettings = {
        serverName: server.sni || server.server,
        alpn: server.alpn || ['h2', 'http/1.1'],
        fingerprint: server.fingerprint || 'chrome'
      };

      // Xray 25+/26 removed `allowInsecure` outright — emitting it (even as
      // false!) is a hard startup failure: 'The feature "allowInsecure" has
      // been removed and migrated to "pinnedPeerCertSha256"(pcs) and
      // "verifyPeerCertByName"(vcn)'. verifyPeerCertByName is the closest
      // equivalent: the certificate is validated against the name we already
      // trust instead of the system chain, which is what makes self-signed
      // nodes work.
      if (server.allowInsecure === true) {
        stream.tlsSettings.verifyPeerCertByName = server.sni || server.server;
      }
    }

    const host = server.host || server.sni || server.server;

    switch (server.network) {
      case 'ws':
        stream.wsSettings = {
          path: server.path || '/',
          headers: {
            Host: host
          }
        };
        break;

      case 'grpc':
        stream.grpcSettings = {
          serviceName: server.path || ''
        };
        break;

      case 'http':
        // The plain HTTP transport was removed in Xray 26 ("migrated to XHTTP
        // stream-one H2"); XHTTP stream-one is its drop-in replacement.
        stream.network = 'xhttp';
        stream.xhttpSettings = {
          host,
          path: server.path || '/',
          mode: 'stream-one'
        };
        // stream-one/H2 requires the h2 ALPN, whatever the node advertised.
        if (stream.tlsSettings) stream.tlsSettings.alpn = ['h2'];
        break;

      case 'quic':
        if (server.tls !== 'tls' && server.tls !== 'reality') {
          throw new Error('Xray XHTTP/H3 ("quic") transport requires TLS, but this server has none');
        }
        stream.network = 'xhttp';
        stream.xhttpSettings = {
          host,
          path: server.path || '/',
          mode: 'stream-one'
        };
        if (stream.tlsSettings) {
          stream.tlsSettings.alpn = ['h3'];
        }
        break;

      case 'kcp':
        stream.network = 'kcp';
        stream.kcpSettings = {
          mtu: 1350,
          tti: 20,
          uplinkCapacity: 5,
          downlinkCapacity: 20,
          congestion: false,
          readBufferSize: 1,
          writeBufferSize: 1
        };
        break;

      case 'tcp':
      case undefined:
        break;

      default:
        throw new UnsupportedCoreFeatureError('Xray', 'transport', String(server.network));
    }

    return stream;
  }
}
