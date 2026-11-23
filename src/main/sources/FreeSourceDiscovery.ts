import { FreeConfigSource, VpnServerConfig, SupportedProtocol } from '../../shared/types';
import { ProtocolParser, dedupeServers } from '../protocol/parser';

export class FreeSourceDiscovery {
  private sources: FreeConfigSource[] = [];

  constructor() {
    this.initializeDefaultSources();
  }

  private initializeDefaultSources(): void {
    // Curated high-reputation public repositories and aggregations
    this.sources = [
      {
        id: 'src-gh-vless-daily',
        name: 'GitHub Community VLESS & Reality Feed',
        url: 'https://raw.githubusercontent.com/barry-far/V2ray-Configs/main/Sub1.txt',
        maintainer: 'Barry-Far (Open-Source VPN Community)',
        protocols: ['vless', 'vmess', 'trojan'],
        enabled: true,
        description: 'Auto-updated aggregated public VLESS Reality and VMess endpoints',
        trustLevel: 'Community'
      },
      {
        id: 'src-gh-singbox-nodes',
        name: 'sing-box & Hysteria 2 Global Feed',
        url: 'https://raw.githubusercontent.com/yebekhe/TVC/main/subscriptions/xray/normal/vless',
        maintainer: 'TVC Open Community Project',
        protocols: ['vless', 'hysteria2', 'tuic'],
        enabled: true,
        description: 'Curated fast nodes tested for high-censorship environments',
        trustLevel: 'Verified'
      },
      {
        id: 'src-gh-clash-meta',
        name: 'Mihomo / Clash Meta Public Aggregator',
        url: 'https://raw.githubusercontent.com/freefq/free/master/v2',
        maintainer: 'FreeFQ Project',
        protocols: ['vmess', 'shadowsocks', 'trojan'],
        enabled: true,
        description: 'Free public proxies collected from community verified sources',
        trustLevel: 'Community'
      },
      {
        id: 'src-gh-wireguard-public',
        name: 'Public WireGuard & Warp Endpoints',
        url: 'https://raw.githubusercontent.com/ircfspace/warpplus/main/warp.json',
        maintainer: 'IRCF Community',
        protocols: ['wireguard'],
        enabled: true,
        description: 'Authorized public WireGuard / Cloudflare WARP connection endpoints',
        trustLevel: 'Verified'
      }
    ];
  }

  public getSources(): FreeConfigSource[] {
    return this.sources;
  }

  public addSource(source: Omit<FreeConfigSource, 'id'>): FreeConfigSource {
    const newSource: FreeConfigSource = {
      ...source,
      id: `src-custom-${Date.now()}`
    };
    this.sources.push(newSource);
    return newSource;
  }

  public removeSource(id: string): boolean {
    const initialLen = this.sources.length;
    this.sources = this.sources.filter(s => s.id !== id);
    return this.sources.length < initialLen;
  }

  public toggleSource(id: string, enabled: boolean): void {
    const src = this.sources.find(s => s.id === id);
    if (src) src.enabled = enabled;
  }

  /**
   * Fetches configurations from an active source URL, parses them, and returns VpnServerConfig[]
   */
  public async fetchSource(sourceId: string): Promise<VpnServerConfig[]> {
    const source = this.sources.find(s => s.id === sourceId);
    if (!source || !source.enabled) return [];

    try {
      const response = await fetch(source.url, {
        headers: {
          'User-Agent': 'RYOX-VPN-Client/1.0.0 (Windows NT 10.0; Win64; x64)'
        },
        signal: AbortSignal.timeout(12000)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }

      const text = await response.text();
      const parsedConfigs = dedupeServers(ProtocolParser.parseSubscription(text, source.id));

      source.lastSync = Date.now();
      source.serverCount = parsedConfigs.length;

      return parsedConfigs;
    } catch (err) {
      console.warn(`[FreeSourceDiscovery] Failed to fetch source ${source.name}:`, err);
      return [];
    }
  }

  /**
   * Fetch all enabled sources and return unique servers. Deduplication keys on the
   * stable node id (which hashes the endpoint and secret) with a `server:port:protocol`
   * fallback, so nodes sharing a host but differing in secret are both kept.
   */
  public async fetchAllEnabled(): Promise<{ servers: VpnServerConfig[]; totalRaw: number }> {
    const allServers: VpnServerConfig[] = [];
    const enabledSources = this.sources.filter(s => s.enabled);

    for (const source of enabledSources) {
      const fetched = await this.fetchSource(source.id);
      allServers.push(...fetched);
    }

    const totalRaw = allServers.length;

    return {
      servers: dedupeServers(allServers),
      totalRaw
    };
  }
}
