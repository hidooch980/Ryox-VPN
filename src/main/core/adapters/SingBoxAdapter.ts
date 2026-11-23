import { VpnServerConfig, AppSettings } from '../../../shared/types';

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
        inet4_address: '172.19.0.1/30',
        auto_route: true,
        strict_route: settings.killSwitch,
        stack: 'system'
      });
    }

    const outbounds: any[] = [
      this.buildOutbound(server, settings),
      {
        type: 'direct',
        tag: 'direct'
      },
      {
        type: 'block',
        tag: 'block'
      }
    ];

    const rules: any[] = [
      {
        protocol: 'dns',
        action: 'hijack-dns'
      },
      {
        domain_suffix: ['doubleclick.net', 'googleadservices.com'],
        outbound: 'block'
      }
    ];

    if (settings.bypassChinaAndIranLan) {
      rules.push({
        domain_suffix: ['.ir', '.cn'],
        outbound: 'direct'
      });
    }

    if (settings.bypassPrivateIps) {
      rules.push({
        ip_is_private: true,
        outbound: 'direct'
      });
    }

    if (settings.routingMode === 'Direct') {
      rules.unshift({
        network: ['tcp', 'udp'],
        outbound: 'direct'
      });
    } else if (settings.routingMode === 'Global') {
      rules.unshift({
        network: ['tcp', 'udp'],
        outbound: 'proxy'
      });
    } else {
      // Default rule mode sends rest to proxy
      rules.push({
        network: ['tcp', 'udp'],
        outbound: 'proxy'
      });
    }

    return {
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
        auto_detect_interface: true,
        default_domain_resolver: 'direct-dns'
      }
    };
  }

  private static buildOutbound(server: VpnServerConfig, settings: AppSettings): any {
    const outbound: any = {
      tag: 'proxy',
      type: server.protocol === 'wireguard' ? 'wireguard' : server.protocol,
      server: server.server,
      server_port: server.port
    };

    if (server.protocol === 'vless') {
      outbound.uuid = server.uuid;
      if (server.flow) outbound.flow = server.flow;
      this.attachTls(outbound, server, settings);
      this.attachTransport(outbound, server);
    } else if (server.protocol === 'vmess') {
      outbound.uuid = server.uuid;
      outbound.security = 'auto';
      outbound.alter_id = 0;
      this.attachTls(outbound, server, settings);
      this.attachTransport(outbound, server);
    } else if (server.protocol === 'trojan') {
      outbound.password = server.password;
      this.attachTls(outbound, server, settings);
      this.attachTransport(outbound, server);
    } else if (server.protocol === 'shadowsocks') {
      outbound.method = server.method || 'aes-128-gcm';
      outbound.password = server.password;
    } else if (server.protocol === 'hysteria2') {
      outbound.type = 'hysteria2';
      outbound.password = server.password;
      outbound.tls = {
        enabled: true,
        server_name: server.sni || server.server,
        alpn: server.alpn || ['h3']
      };
    } else if (server.protocol === 'tuic') {
      outbound.type = 'tuic';
      outbound.uuid = server.uuid;
      outbound.password = server.password;
      outbound.congestion_control = 'bbr';
      outbound.tls = {
        enabled: true,
        server_name: server.sni || server.server,
        alpn: server.alpn || ['h3']
      };
    } else if (server.protocol === 'wireguard') {
      outbound.type = 'wireguard';
      outbound.private_key = server.privateKey;
      outbound.peer_public_key = server.peerPublicKey;
      outbound.pre_shared_key = server.presharedKey;
      outbound.local_address = server.address || ['10.0.0.2/32'];
      outbound.mtu = server.mtu || 1420;
    }

    return outbound;
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

    if (settings.enableTlsFragment && outbound.tls) {
      outbound.tls.fragment = {
        enabled: true,
        size: settings.fragmentLength || '100-200',
        sleep: settings.fragmentInterval || '10-20'
      };
    }
  }

  private static attachTransport(outbound: any, server: VpnServerConfig): void {
    if (server.network === 'ws') {
      outbound.transport = {
        type: 'ws',
        path: server.path || '/',
        headers: {
          Host: server.host || server.sni || server.server
        }
      };
    } else if (server.network === 'grpc') {
      outbound.transport = {
        type: 'grpc',
        service_name: server.path || ''
      };
    }
  }
}
