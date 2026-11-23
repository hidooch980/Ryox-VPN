import { VpnServerConfig, AppSettings } from '../../../shared/types';
import * as yaml from 'yaml';

export class MihomoAdapter {
  public static generateConfig(server: VpnServerConfig, settings: AppSettings): string {
    const isTun = settings.tunnelMode === 'TUN';

    const proxy: any = {
      name: server.name || 'RYOX-NODE',
      type: server.protocol,
      server: server.server,
      port: server.port,
      udp: true
    };

    if (server.protocol === 'vless') {
      proxy.uuid = server.uuid;
      if (server.flow) proxy.flow = server.flow;
      if (server.tls === 'reality') {
        proxy.tls = true;
        proxy['reality-opts'] = {
          'public-key': server.publicKey,
          'short-id': server.shortId || ''
        };
        proxy['client-fingerprint'] = server.fingerprint || 'chrome';
      } else if (server.tls === 'tls') {
        proxy.tls = true;
        proxy.servername = server.sni || server.server;
      }
    } else if (server.protocol === 'vmess') {
      proxy.uuid = server.uuid;
      proxy.alterId = 0;
      proxy.cipher = 'auto';
      if (server.tls === 'tls') {
        proxy.tls = true;
        proxy.servername = server.sni || server.server;
      }
    } else if (server.protocol === 'trojan') {
      proxy.password = server.password;
      proxy.sni = server.sni || server.server;
    } else if (server.protocol === 'shadowsocks') {
      proxy.cipher = server.method || 'aes-128-gcm';
      proxy.password = server.password;
    } else if (server.protocol === 'hysteria2') {
      proxy.type = 'hysteria2';
      proxy.password = server.password;
      proxy.sni = server.sni || server.server;
    } else if (server.protocol === 'tuic') {
      proxy.type = 'tuic';
      proxy.uuid = server.uuid;
      proxy.password = server.password;
      proxy.sni = server.sni || server.server;
    } else if (server.protocol === 'wireguard') {
      proxy.type = 'wireguard';
      proxy['private-key'] = server.privateKey;
      proxy['public-key'] = server.peerPublicKey;
      proxy.ip = server.address ? server.address[0].replace(/\/.*$/, '') : '10.0.0.2';
    }

    if (server.network === 'ws') {
      proxy.network = 'ws';
      proxy['ws-opts'] = {
        path: server.path || '/',
        headers: {
          Host: server.host || server.sni || server.server
        }
      };
    } else if (server.network === 'grpc') {
      proxy.network = 'grpc';
      proxy['grpc-opts'] = {
        'grpc-service-name': server.path || ''
      };
    }

    const clashConfig: any = {
      'mixed-port': settings.inboundSocksPort || 10808,
      'allow-lan': settings.allowLan,
      'mode': settings.routingMode === 'Direct' ? 'direct' : (settings.routingMode === 'Global' ? 'global' : 'rule'),
      'log-level': 'warning',
      'ipv6': false,
      'dns': {
        enable: true,
        listen: '0.0.0.0:1053',
        nameserver: settings.customDnsEnabled && settings.dnsServers.length > 0 ? settings.dnsServers : ['1.1.1.1', '8.8.8.8']
      },
      'tun': {
        enable: isTun,
        stack: 'system',
        'auto-route': true,
        'auto-detect-interface': true
      },
      'proxies': [proxy],
      'proxy-groups': [
        {
          name: 'PROXY',
          type: 'select',
          proxies: [proxy.name]
        }
      ],
      'rules': [
        'GEOIP,private,DIRECT',
        'MATCH,PROXY'
      ]
    };

    return yaml.stringify(clashConfig);
  }
}
