import { Subscription, VpnServerConfig } from '../../shared/types';
import { ProtocolParser } from '../protocol/parser';

export class SubscriptionManager {
  private subscriptions: Subscription[] = [];
  private servers: VpnServerConfig[] = [];

  constructor() {
    this.loadSampleData();
  }

  private loadSampleData(): void {
    // Provide a clean starter subscription
    this.subscriptions = [
      {
        id: 'sub-default-sample',
        name: 'Open Community Reality Nodes',
        url: 'https://raw.githubusercontent.com/barry-far/V2ray-Configs/main/Sub1.txt',
        enabled: true,
        updateIntervalHours: 12,
        serverCount: 0,
        userAgent: 'v2rayN/6.39'
      }
    ];
  }

  public getSubscriptions(): Subscription[] {
    return this.subscriptions;
  }

  public addSubscription(name: string, url: string, updateIntervalHours: number = 12): Subscription {
    const sub: Subscription = {
      id: `sub-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      name: name.trim() || 'New Subscription',
      url: url.trim(),
      enabled: true,
      updateIntervalHours,
      serverCount: 0
    };
    this.subscriptions.push(sub);
    return sub;
  }

  public removeSubscription(id: string): void {
    this.subscriptions = this.subscriptions.filter(s => s.id !== id);
    this.servers = this.servers.filter(srv => srv.subscriptionId !== id);
  }

  public async updateSubscription(id: string): Promise<VpnServerConfig[]> {
    const sub = this.subscriptions.find(s => s.id === id);
    if (!sub) return [];

    try {
      const res = await fetch(sub.url, {
        headers: {
          'User-Agent': sub.userAgent || 'RYOX-VPN/1.0.0'
        },
        signal: AbortSignal.timeout(15000)
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      const body = await res.text();
      const parsed = ProtocolParser.parseSubscription(body, sub.id);

      sub.lastUpdated = Date.now();
      sub.serverCount = parsed.length;
      sub.error = undefined;

      // Replace servers for this subscription
      this.servers = this.servers.filter(s => s.subscriptionId !== id).concat(parsed);
      return parsed;

    } catch (err: any) {
      sub.error = err.message;
      return [];
    }
  }

  public getAllServers(): VpnServerConfig[] {
    return this.servers;
  }

  public addManualServer(server: VpnServerConfig): void {
    this.servers.push(server);
  }

  public removeServer(id: string): void {
    this.servers = this.servers.filter(s => s.id !== id);
  }

  public toggleFavorite(id: string): void {
    const s = this.servers.find(srv => srv.id === id);
    if (s) {
      s.isFavorite = !s.isFavorite;
    }
  }
}
