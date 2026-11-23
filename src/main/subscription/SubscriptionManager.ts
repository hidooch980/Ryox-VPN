import { Subscription, VpnServerConfig } from '../../shared/types';
import { ProtocolParser } from '../protocol/parser';
import { StorageManager } from '../storage/StorageManager';

export class SubscriptionManager {
  private subscriptions: Subscription[] = [];
  private servers: VpnServerConfig[] = [];
  private storage: StorageManager;

  constructor(storage?: StorageManager) {
    this.storage = storage ?? new StorageManager();
    const persisted = this.storage.getSubscriptions();
    if (persisted.length > 0) {
      this.subscriptions = persisted;
    } else {
      this.loadSampleData();
    }
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

  /** Persist the current subscription list so it survives a restart. */
  private persistSubscriptions(): void {
    this.storage.saveSubscriptions(this.subscriptions);
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
    this.persistSubscriptions();
    return sub;
  }

  public removeSubscription(id: string): void {
    this.subscriptions = this.subscriptions.filter(s => s.id !== id);
    this.servers = this.servers.filter(srv => srv.subscriptionId !== id);
    this.persistSubscriptions();
    this.pruneSubscriptionServers(id);
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

      // Replace servers for this subscription, pruning dead nodes even when the
      // refresh returned nothing (an empty fresh set must clear the stale ones).
      this.servers = this.servers.filter(s => s.subscriptionId !== id).concat(parsed);
      this.replaceSubscriptionServers(id, parsed);
      this.persistSubscriptions();
      return parsed;

    } catch (err: any) {
      sub.error = err.message;
      this.persistSubscriptions();
      return [];
    }
  }

  /**
   * Remove every stored server belonging to `id`, then merge the fresh set for that
   * subscription. Passing an empty `fresh` list prunes the subscription's dead nodes.
   * Exposed so the IPC layer can keep storage in sync after a refresh.
   */
  public replaceSubscriptionServers(id: string, fresh: VpnServerConfig[]): void {
    const others = this.storage.getServers().filter(s => s.subscriptionId !== id);
    const tagged = fresh.map(s => (s.subscriptionId === id ? s : { ...s, subscriptionId: id }));
    this.storage.saveServers(others.concat(tagged));
  }

  /** Remove every stored server that belongs to `id` without adding new ones. */
  public pruneSubscriptionServers(id: string): void {
    const remaining = this.storage.getServers().filter(s => s.subscriptionId !== id);
    this.storage.saveServers(remaining);
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
