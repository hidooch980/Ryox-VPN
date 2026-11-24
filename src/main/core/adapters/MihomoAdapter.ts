import { VpnServerConfig, AppSettings } from '../../../shared/types';
import * as yaml from 'yaml';
import {
  UnsupportedCoreFeatureError,
  BLOCKED_DOMAINS,
  PRIVATE_IPV4_CIDRS,
  PRIVATE_IPV6_CIDRS,
  assertShadowsocksKey
} from './SingBoxAdapter';

/**
 * Mihomo's proxy type for each node protocol. Shadowsocks is the odd one out:
 * Mihomo spells it `ss`, and rejects the full name with
 * `unsupport proxy type: shadowsocks`.
 */
const MIHOMO_TYPES: Partial<Record<string, string>> = {
  vless: 'vless',
  vmess: 'vmess',
  trojan: 'trojan',
  shadowsocks: 'ss',
  hysteria2: 'hysteria2',
  tuic: 'tuic',
  wireguard: 'wireguard',
  socks5: 'socks5',
  http: 'http'
};

export class MihomoAdapter {
  public static generateConfig(server: VpnServerConfig, settings: AppSettings): string {
    const isTun = settings.tunnelMode === 'TUN';

    const type = MIHOMO_TYPES[server.protocol];
    if (!type) {
      throw new UnsupportedCoreFeatureError('Mihomo', 'protocol', server.protocol);
    }

    const proxy: any = {
      name: server.name || 'RYOX-NODE',
      type,
      server: server.server,
      port: server.port,
      udp: true
    };

    const sni = server.sni || server.server;
    const fingerprint = server.fingerprint || 'chrome';
    const usesTls = server.tls === 'tls' || server.tls === 'reality';

    switch (server.protocol) {
      case 'vless':
        proxy.uuid = server.uuid;
        if (server.flow) proxy.flow = server.flow;
        if (server.tls === 'reality') {
          proxy.tls = true;
          proxy['reality-opts'] = {
            'public-key': server.publicKey,
            'short-id': server.shortId || ''
          };
          proxy['client-fingerprint'] = fingerprint;
        } else if (usesTls) {
          proxy.tls = true;
          proxy.servername = sni;
          proxy['client-fingerprint'] = fingerprint;
        }
        break;

      case 'vmess':
        proxy.uuid = server.uuid;
        proxy.alterId = 0;
        proxy.cipher = 'auto';
        if (server.tls === 'reality') {
          proxy.tls = true;
          proxy['reality-opts'] = {
            'public-key': server.publicKey,
            'short-id': server.shortId || ''
          };
          proxy['client-fingerprint'] = fingerprint;
        } else if (usesTls) {
          proxy.tls = true;
          proxy.servername = sni;
          proxy['client-fingerprint'] = fingerprint;
        }
        break;

      case 'trojan':
        proxy.password = server.password;
        proxy.sni = sni;
        break;

      case 'shadowsocks':
        assertShadowsocksKey(server);
        proxy.cipher = server.method || 'aes-128-gcm';
        proxy.password = server.password;
        break;

      case 'hysteria2':
        proxy.password = server.password;
        proxy.sni = sni;
        break;

      case 'tuic':
        proxy.uuid = server.uuid;
        proxy.password = server.password;
        proxy.sni = sni;
        break;

      case 'wireguard':
        proxy['private-key'] = server.privateKey;
        proxy['public-key'] = server.peerPublicKey;
        proxy.ip = server.address && server.address[0] ? server.address[0].replace(/\/.*$/, '') : '10.0.0.2';
        if (server.presharedKey) proxy['pre-shared-key'] = server.presharedKey;
        if (server.mtu) proxy.mtu = server.mtu;
        break;

      case 'socks5':
      case 'http':
        if (server.password) proxy.password = server.password;
        break;
    }

    // allowInsecure => skip-cert-verify, for every TLS-ish proxy type.
    const alwaysTls = server.protocol === 'trojan' || server.protocol === 'hysteria2' || server.protocol === 'tuic';
    if (server.allowInsecure === true && (usesTls || alwaysTls)) {
      proxy['skip-cert-verify'] = true;
    }

    const host = server.host || sni;

    switch (server.network) {
      case 'ws':
        proxy.network = 'ws';
        proxy['ws-opts'] = {
          path: server.path || '/',
          headers: {
            Host: host
          }
        };
        break;

      case 'grpc':
        proxy.network = 'grpc';
        proxy['grpc-opts'] = {
          'grpc-service-name': server.path || ''
        };
        break;

      case 'http':
        // Xray's "http" transport is HTTP/2; Mihomo calls that `h2`.
        proxy.network = 'h2';
        proxy['h2-opts'] = {
          path: server.path || '/',
          host: [host]
        };
        break;

      case 'quic':
        proxy.network = 'quic';
        break;

      case 'kcp':
        proxy.network = 'kcp';
        proxy['kcp-opts'] = {
          mtu: 1350,
          tti: 20,
          uplink: 5,
          downlink: 20
        };
        break;

      case 'tcp':
      case undefined:
        break;

      default:
        throw new UnsupportedCoreFeatureError('Mihomo', 'transport', String(server.network));
    }

    // Private ranges as plain CIDRs instead of `GEOIP,private`: the listing
    // needs geoip.metadb, which this app never ships.
    const rules: string[] = [];
    for (const domain of BLOCKED_DOMAINS) rules.push(`DOMAIN-SUFFIX,${domain},REJECT`);
    if (settings.bypassPrivateIps !== false) {
      for (const cidr of PRIVATE_IPV4_CIDRS) rules.push(`IP-CIDR,${cidr},DIRECT,no-resolve`);
      for (const cidr of PRIVATE_IPV6_CIDRS) rules.push(`IP-CIDR6,${cidr},DIRECT,no-resolve`);
    }
    if (settings.bypassChinaAndIranLan) {
      rules.push('DOMAIN-SUFFIX,ir,DIRECT');
      rules.push('DOMAIN-SUFFIX,cn,DIRECT');
    }
    rules.push('MATCH,PROXY');

    const clashConfig: any = {
      'mixed-port': settings.inboundSocksPort || 10808,
      'allow-lan': settings.allowLan,
      mode:
        settings.routingMode === 'Direct' ? 'direct' : settings.routingMode === 'Global' ? 'global' : 'rule',
      'log-level': 'warning',
      ipv6: false,
      dns: {
        enable: true,
        listen: '0.0.0.0:1053',
        nameserver:
          settings.customDnsEnabled && settings.dnsServers.length > 0
            ? settings.dnsServers
            : ['1.1.1.1', '8.8.8.8']
      },
      tun: {
        enable: isTun,
        // The kill switch whitelists traffic by adapter name; without an
        // explicit device Mihomo picks its own name and gets blocked by it.
        device: 'ryox-tun',
        stack: 'system',
        'auto-route': true,
        'auto-detect-interface': true
      },
      proxies: [proxy],
      'proxy-groups': [
        {
          name: 'PROXY',
          type: 'select',
          proxies: [proxy.name]
        }
      ],
      rules
    };

    // Same opt-in controller as the sing-box adapter: absent unless a port is set.
    if (typeof settings.clashApiPort === 'number' && settings.clashApiPort > 0) {
      clashConfig['external-controller'] = `127.0.0.1:${settings.clashApiPort}`;
      if (settings.clashApiSecret) clashConfig.secret = settings.clashApiSecret;
    }

    return yaml.stringify(clashConfig);
  }
}
