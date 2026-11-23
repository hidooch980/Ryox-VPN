import { VpnServerConfig, SupportedProtocol, SupportedCore } from '../../shared/types';
import * as yaml from 'yaml';

export class ProtocolParser {
  /**
   * Parse a single URI into a VpnServerConfig
   */
  public static parseUri(rawUri: string): VpnServerConfig | null {
    const trimmed = rawUri.trim();
    if (!trimmed) return null;

    try {
      if (trimmed.startsWith('vless://')) {
        return this.parseVless(trimmed);
      } else if (trimmed.startsWith('vmess://')) {
        return this.parseVmess(trimmed);
      } else if (trimmed.startsWith('trojan://')) {
        return this.parseTrojan(trimmed);
      } else if (trimmed.startsWith('ss://')) {
        return this.parseShadowsocks(trimmed);
      } else if (trimmed.startsWith('hy2://') || trimmed.startsWith('hysteria2://')) {
        return this.parseHysteria2(trimmed);
      } else if (trimmed.startsWith('tuic://')) {
        return this.parseTuic(trimmed);
      } else if (trimmed.startsWith('wireguard://')) {
        return this.parseWireguard(trimmed);
      }
    } catch (err) {
      console.warn(`[ProtocolParser] Error parsing URI: ${trimmed.slice(0, 30)}...`, err);
    }

    return null;
  }

  /**
   * Parse multi-line or Base64 subscription string
   */
  public static parseSubscription(rawContent: string, subscriptionId?: string): VpnServerConfig[] {
    const configs: VpnServerConfig[] = [];
    if (!rawContent) return configs;

    let content = rawContent.trim();

    // Check if content is Base64 encoded (standard or URL-safe, padded or unpadded)
    if (!content.includes('://') && !content.includes('proxies:') && !content.includes('{')) {
      content = ProtocolParser.decodeBase64Payload(content);
    }

    // Check if YAML (Clash / Mihomo)
    if (content.includes('proxies:') || content.includes('proxy-providers:')) {
      const clashConfigs = this.parseClashYaml(content, subscriptionId);
      if (clashConfigs.length > 0) return clashConfigs;
    }

    // Check if JSON (sing-box / Xray format)
    if (content.startsWith('{') && content.endsWith('}')) {
      const jsonConfigs = this.parseSingBoxJson(content, subscriptionId);
      if (jsonConfigs.length > 0) return jsonConfigs;
    }

    // Process line-by-line URIs
    const lines = content.split(/[\r\n]+/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const config = this.parseUri(trimmed);
      if (config) {
        if (subscriptionId) config.subscriptionId = subscriptionId;
        configs.push(config);
      }
    }

    return configs;
  }

  // --- VLESS Parser ---
  private static parseVless(uri: string): VpnServerConfig | null {
    // Format: vless://uuid@host:port?param=val#name
    const url = new URL(uri);
    const uuid = url.username;
    const server = url.hostname;
    const port = parseInt(url.port, 10);
    if (!this.isValidPort(port)) return null;
    const name = this.safeDecode(url.hash.replace(/^#/, '')) || `VLESS-${server}:${port}`;

    const params = url.searchParams;
    const network = (params.get('type') || 'tcp') as 'tcp' | 'ws' | 'grpc' | 'http';
    const security = params.get('security') || 'none';
    const flow = params.get('flow') || undefined;
    const sni = params.get('sni') || undefined;
    const host = params.get('host') || undefined;
    const path = params.get('path') || undefined;
    const pbk = params.get('pbk') || undefined;
    const sid = params.get('sid') || undefined;
    const spx = params.get('spx') || undefined;
    const fp = params.get('fp') || 'chrome';
    const alpn = params.get('alpn') ? params.get('alpn')!.split(',') : undefined;

    return {
      id: this.generateId('vless', server, port, uuid),
      name,
      server,
      port,
      protocol: 'vless',
      core: 'xray',
      uuid,
      network,
      tls: security === 'reality' ? 'reality' : (security === 'tls' ? 'tls' : 'none'),
      sni,
      host,
      path,
      flow,
      fingerprint: fp,
      publicKey: pbk,
      shortId: sid,
      spiderX: spx,
      alpn,
      rawUri: uri,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
  }

  // --- VMess Parser ---
  private static parseVmess(uri: string): VpnServerConfig | null {
    // Format: vmess://base64(json)
    const b64 = uri.replace(/^vmess:\/\//, '');
    let decodedJson: string;
    try {
      decodedJson = Buffer.from(b64, 'base64').toString('utf-8');
    } catch {
      return null;
    }

    const obj = JSON.parse(decodedJson);
    const server = obj.add;
    const port = parseInt(obj.port, 10);
    if (!this.isValidPort(port)) return null;
    const uuid = obj.id;
    const name = obj.ps || `VMess-${server}:${port}`;
    const network = (obj.net || 'tcp') as 'tcp' | 'ws' | 'grpc' | 'http';
    const tls = obj.tls === 'tls' ? 'tls' : 'none';

    return {
      id: this.generateId('vmess', server, port, uuid),
      name,
      server,
      port,
      protocol: 'vmess',
      core: 'xray',
      uuid,
      network,
      tls,
      sni: obj.sni || obj.host,
      host: obj.host,
      path: obj.path,
      alpn: obj.alpn ? obj.alpn.split(',') : undefined,
      rawUri: uri,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
  }

  // --- Trojan Parser ---
  private static parseTrojan(uri: string): VpnServerConfig | null {
    // Format: trojan://password@host:port?param=val#name
    const url = new URL(uri);
    const password = url.username;
    const server = url.hostname;
    const port = parseInt(url.port, 10);
    if (!this.isValidPort(port)) return null;
    const name = this.safeDecode(url.hash.replace(/^#/, '')) || `Trojan-${server}:${port}`;

    const params = url.searchParams;
    const sni = params.get('sni') || params.get('peer') || server;
    const network = (params.get('type') || 'tcp') as 'tcp' | 'ws' | 'grpc';

    return {
      id: this.generateId('trojan', server, port, password),
      name,
      server,
      port,
      protocol: 'trojan',
      core: 'xray',
      password,
      network,
      tls: 'tls',
      sni,
      path: params.get('path') || undefined,
      host: params.get('host') || undefined,
      alpn: params.get('alpn') ? params.get('alpn')!.split(',') : undefined,
      rawUri: uri,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
  }

  // --- Shadowsocks Parser ---
  private static parseShadowsocks(uri: string): VpnServerConfig | null {
    // Format: ss://base64(method:password@host:port)#name or ss://base64(method:password)@host:port#name
    let clean = uri.replace(/^ss:\/\//, '');
    let name = '';
    const hashIndex = clean.indexOf('#');
    if (hashIndex !== -1) {
      name = this.safeDecode(clean.substring(hashIndex + 1));
      clean = clean.substring(0, hashIndex);
    }

    let method: string | undefined;
    let password: string | undefined;
    let server = '';
    let port = 0;

    if (clean.includes('@')) {
      const atIdx = clean.indexOf('@');
      const userinfo = clean.substring(0, atIdx);
      const hostport = clean.substring(atIdx + 1);

      // The userinfo is usually base64(method:password); accept URL-safe and
      // unpadded variants as well as plain (non-encoded) method:password.
      const decodedUserinfo = this.tryDecodeBase64(userinfo) ?? userinfo;

      // Split on the FIRST colon so passwords may themselves contain ':'.
      const sepIdx = decodedUserinfo.indexOf(':');
      if (sepIdx === -1) return null;
      method = decodedUserinfo.substring(0, sepIdx);
      password = decodedUserinfo.substring(sepIdx + 1);

      const portSepIdx = hostport.lastIndexOf(':');
      if (portSepIdx === -1) return null;
      server = hostport.substring(0, portSepIdx);
      port = parseInt(hostport.substring(portSepIdx + 1), 10);
    } else {
      const decoded = this.tryDecodeBase64(clean);
      if (decoded === null) return null;
      const atIdx = decoded.indexOf('@');
      if (atIdx === -1) return null;

      const userinfo = decoded.substring(0, atIdx);
      const sepIdx = userinfo.indexOf(':');
      if (sepIdx === -1) return null;
      method = userinfo.substring(0, sepIdx);
      password = userinfo.substring(sepIdx + 1);

      const hostport = decoded.substring(atIdx + 1);
      const portSepIdx = hostport.lastIndexOf(':');
      if (portSepIdx === -1) return null;
      server = hostport.substring(0, portSepIdx);
      port = parseInt(hostport.substring(portSepIdx + 1), 10);
    }

    if (!method || password === undefined || !server || !this.isValidPort(port)) return null;
    if (!name) name = `SS-${server}:${port}`;

    return {
      id: this.generateId('shadowsocks', server, port, password),
      name,
      server,
      port,
      protocol: 'shadowsocks',
      core: 'sing-box',
      method,
      password,
      rawUri: uri,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
  }

  // --- Hysteria 2 Parser ---
  private static parseHysteria2(uri: string): VpnServerConfig | null {
    // Format: hysteria2://auth@host:port?sni=...&insecure=0#name
    const cleanUri = uri.replace(/^hy2:\/\//, 'hysteria2://');
    const url = new URL(cleanUri);
    const password = url.username;
    const server = url.hostname;
    const port = parseInt(url.port, 10);
    if (!this.isValidPort(port)) return null;
    const name = this.safeDecode(url.hash.replace(/^#/, '')) || `Hysteria2-${server}:${port}`;
    const params = url.searchParams;

    return {
      id: this.generateId('hysteria2', server, port, password),
      name,
      server,
      port,
      protocol: 'hysteria2',
      core: 'sing-box',
      password,
      sni: params.get('sni') || server,
      alpn: params.get('alpn') ? params.get('alpn')!.split(',') : ['h3'],
      tls: 'tls',
      rawUri: uri,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
  }

  // --- TUIC Parser ---
  private static parseTuic(uri: string): VpnServerConfig | null {
    const url = new URL(uri);
    const uuid = url.username;
    const password = url.password;
    const server = url.hostname;
    const port = parseInt(url.port, 10);
    if (!this.isValidPort(port)) return null;
    const name = this.safeDecode(url.hash.replace(/^#/, '')) || `TUIC-${server}:${port}`;
    const params = url.searchParams;

    return {
      id: this.generateId('tuic', server, port, uuid),
      name,
      server,
      port,
      protocol: 'tuic',
      core: 'sing-box',
      uuid,
      password,
      sni: params.get('sni') || server,
      alpn: params.get('alpn') ? params.get('alpn')!.split(',') : ['h3'],
      tls: 'tls',
      rawUri: uri,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
  }

  // --- WireGuard Parser ---
  private static parseWireguard(uri: string): VpnServerConfig | null {
    const url = new URL(uri);
    const privateKey = url.username;
    const server = url.hostname;
    const port = parseInt(url.port, 10);
    if (!this.isValidPort(port)) return null;
    const name = this.safeDecode(url.hash.replace(/^#/, '')) || `WireGuard-${server}:${port}`;
    const params = url.searchParams;

    return {
      id: this.generateId('wireguard', server, port, privateKey),
      name,
      server,
      port,
      protocol: 'wireguard',
      core: 'sing-box',
      privateKey,
      peerPublicKey: params.get('publickey') || undefined,
      presharedKey: params.get('presharedkey') || undefined,
      address: params.get('ip') ? [params.get('ip')!] : ['10.0.0.2/32'],
      rawUri: uri,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
  }

  // --- Clash YAML Parser ---
  private static parseClashYaml(content: string, subscriptionId?: string): VpnServerConfig[] {
    const results: VpnServerConfig[] = [];
    try {
      const doc = yaml.parse(content);
      if (!doc || !Array.isArray(doc.proxies)) return results;

      for (const p of doc.proxies) {
        if (!p.type || !p.server || !p.port) continue;
        const rawType = String(p.type).toLowerCase();
        // Clash uses short aliases that the adapters do not understand.
        const proto = (rawType === 'ss' ? 'shadowsocks' : rawType === 'socks' ? 'socks5' : rawType) as SupportedProtocol;
        const server = String(p.server);
        const port = Number(p.port);
        if (!this.isValidPort(port)) continue;
        const name = p.name || `${p.type}-${server}:${port}`;

        const config: VpnServerConfig = {
          id: this.generateId(proto, server, port, p.uuid || p.password || p.name),
          name,
          server,
          port,
          protocol: proto,
          core: ['vless', 'vmess', 'trojan', 'shadowsocks'].includes(proto) ? 'xray' : 'sing-box',
          uuid: p.uuid,
          password: p.password,
          method: p.cipher,
          network: p.network || (p['ws-opts'] ? 'ws' : 'tcp'),
          tls: p.tls ? (p['reality-opts'] ? 'reality' : 'tls') : 'none',
          sni: p.sni || p.servername,
          path: p['ws-opts']?.path,
          host: p['ws-opts']?.headers?.Host,
          subscriptionId,
          createdAt: Date.now(),
          updatedAt: Date.now()
        };

        if (p['reality-opts']) {
          config.publicKey = p['reality-opts']['public-key'];
          config.shortId = p['reality-opts']['short-id'];
        }

        results.push(config);
      }
    } catch (e) {
      console.warn('[ProtocolParser] Failed to parse Clash YAML:', e);
    }
    return results;
  }

  // --- sing-box JSON Parser ---
  private static parseSingBoxJson(content: string, subscriptionId?: string): VpnServerConfig[] {
    const results: VpnServerConfig[] = [];
    try {
      const obj = JSON.parse(content);
      const outbounds = obj.outbounds;
      if (!Array.isArray(outbounds)) return results;

      for (const out of outbounds) {
        if (!out.server || !out.server_port || !out.type) continue;
        const proto = out.type.toLowerCase() as SupportedProtocol;
        const server = String(out.server);
        const port = Number(out.server_port);
        const name = out.tag || `${out.type}-${server}:${port}`;

        const config: VpnServerConfig = {
          id: this.generateId(proto, server, port, out.uuid || out.password || out.tag),
          name,
          server,
          port,
          protocol: proto,
          core: 'sing-box',
          uuid: out.uuid,
          password: out.password,
          network: out.transport?.type,
          tls: out.tls?.enabled ? (out.tls?.reality?.enabled ? 'reality' : 'tls') : 'none',
          sni: out.tls?.server_name,
          subscriptionId,
          createdAt: Date.now(),
          updatedAt: Date.now()
        };
        results.push(config);
      }
    } catch (e) {
      console.warn('[ProtocolParser] Failed to parse sing-box JSON:', e);
    }
    return results;
  }

  /** A valid TCP/UDP port: an integer in 1..65535. */
  private static isValidPort(port: number): boolean {
    return Number.isInteger(port) && port > 0 && port < 65536;
  }

  /** decodeURIComponent that never throws on malformed input (e.g. a literal "%"). */
  private static safeDecode(value: string): string {
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }

  /**
   * Strip whitespace, normalise URL-safe characters to the standard alphabet and
   * pad to a multiple of 4, so unpadded / URL-safe payloads decode correctly.
   */
  private static normalizeBase64(value: string): string {
    const stripped = value.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
    const remainder = stripped.length % 4;
    if (remainder === 1) return '';
    return remainder === 0 ? stripped : stripped + '='.repeat(4 - remainder);
  }

  /**
   * Leniently decode base64 (standard or URL-safe, padded or unpadded).
   * Returns null when the input is not canonical base64.
   */
  public static tryDecodeBase64(value: string): string | null {
    if (!value) return null;
    const normalized = ProtocolParser.normalizeBase64(value);
    if (!normalized || !/^[A-Za-z0-9+/]+={0,2}$/.test(normalized)) return null;
    try {
      const decoded = Buffer.from(normalized, 'base64').toString('utf-8');
      if (!decoded) return null;
      const reencoded = Buffer.from(decoded, 'utf-8').toString('base64').replace(/=+$/, '');
      if (reencoded !== normalized.replace(/=+$/, '')) return null;
      return decoded;
    } catch {
      return null;
    }
  }

  /**
   * Decode a whole subscription body when it is base64 encoded, otherwise return
   * it unchanged. Shared with AutoSubscribeService so both paths stay equally lenient.
   */
  public static decodeBase64Payload(raw: string): string {
    const decoded = ProtocolParser.tryDecodeBase64(raw);
    if (decoded && (decoded.includes('://') || decoded.includes('proxies:') || decoded.includes('{'))) {
      return decoded;
    }
    return raw;
  }

  private static generateId(proto: string, server: string, port: number, secret?: string): string {
    const raw = `${proto}://${server}:${port}:${secret || ''}`;
    let hash = 0;
    for (let i = 0; i < raw.length; i++) {
      hash = ((hash << 5) - hash) + raw.charCodeAt(i);
      hash |= 0;
    }
    return `ryox-${proto}-${Math.abs(hash).toString(16)}`;
  }
}

/**
 * Deduplicate servers by their stable `id` (which already hashes the endpoint and
 * secret), falling back to `server:port:protocol` when an id is missing. This keeps
 * distinct nodes that share a host but differ in secret/user instead of collapsing them.
 */
export function dedupeServers(servers: VpnServerConfig[]): VpnServerConfig[] {
  const seen = new Set<string>();
  const unique: VpnServerConfig[] = [];
  for (const server of servers) {
    const key = server.id || `${server.server}:${server.port}:${server.protocol}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(server);
  }
  return unique;
}
