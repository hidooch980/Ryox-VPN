import { VpnServerConfig, AppSettings } from '../../../shared/types';

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

    const routingRules: any[] = [
      {
        type: 'field',
        outboundTag: 'block',
        domain: ['geosite:category-ads-all']
      }
    ];

    if (settings.bypassChinaAndIranLan) {
      routingRules.push({
        type: 'field',
        outboundTag: 'direct',
        ip: ['geoip:private', 'geoip:ir', 'geoip:cn'],
        domain: ['geosite:cn', 'geosite:category-ir']
      });
    }

    if (settings.bypassPrivateIps) {
      routingRules.push({
        type: 'field',
        outboundTag: 'direct',
        ip: ['geoip:private']
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
        servers: settings.customDnsEnabled && settings.dnsServers.length > 0 
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
    const outbound: any = {
      tag: 'proxy',
      protocol: server.protocol,
      settings: {},
      streamSettings: {}
    };

    if (server.protocol === 'vless') {
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
    } else if (server.protocol === 'vmess') {
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
    } else if (server.protocol === 'trojan') {
      outbound.settings = {
        servers: [
          {
            address: server.server,
            port: server.port,
            password: server.password
          }
        ]
      };
    } else if (server.protocol === 'shadowsocks') {
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
    }

    // Stream settings
    const stream: any = {
      network: server.network || 'tcp'
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
    } else if (server.tls === 'tls') {
      stream.security = 'tls';
      stream.tlsSettings = {
        serverName: server.sni || server.server,
        allowInsecure: false,
        alpn: server.alpn || ['h2', 'http/1.1'],
        fingerprint: server.fingerprint || 'chrome'
      };
    }

    if (server.network === 'ws') {
      stream.wsSettings = {
        path: server.path || '/',
        headers: {
          Host: server.host || server.sni || server.server
        }
      };
    } else if (server.network === 'grpc') {
      stream.grpcSettings = {
        serviceName: server.path || ''
      };
    }

    outbound.streamSettings = stream;
    return outbound;
  }
}
