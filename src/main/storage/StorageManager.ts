import * as fs from 'fs';
import * as path from 'path';
import { AppSettings, VpnServerConfig, Subscription } from '../../shared/types';

export class StorageManager {
  private baseDir: string;
  private settingsFile: string;
  private serversFile: string;
  private subscriptionsFile: string;

  constructor(customPath?: string) {
    this.baseDir = customPath || path.join(process.env.APPDATA || process.env.HOME || '.', '.ryox-vpn');
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }

    this.settingsFile = path.join(this.baseDir, 'settings.json');
    this.serversFile = path.join(this.baseDir, 'servers.json');
    this.subscriptionsFile = path.join(this.baseDir, 'subscriptions.json');
  }

  public getSettings(): AppSettings {
    const defaults: AppSettings = {
      tunnelMode: 'TUN',
      routingMode: 'Rule',
      autoConnectOnLaunch: false,
      startMinimized: false,
      killSwitch: true,
      dnsServers: ['1.1.1.1', '8.8.8.8'],
      customDnsEnabled: true,
      dnsOverHttps: true,
      dohUrl: 'https://1.1.1.1/dns-query',
      activeCore: 'sing-box',
      inboundHttpPort: 10809,
      inboundSocksPort: 10808,
      allowLan: false,
      bypassChinaAndIranLan: true,
      bypassPrivateIps: true,
      theme: 'cyberpunk',
      accentColor: '#00e5ff',
      language: 'fa',
      enableTlsFragment: false,
      fragmentLength: '100-200',
      fragmentInterval: '10-20'
    };

    try {
      if (fs.existsSync(this.settingsFile)) {
        const raw = fs.readFileSync(this.settingsFile, 'utf-8');
        return { ...defaults, ...JSON.parse(raw) };
      }
    } catch (e) {
      console.warn('[StorageManager] Error reading settings:', e);
    }
    return defaults;
  }

  public saveSettings(settings: AppSettings): void {
    this.writeAtomic(this.settingsFile, JSON.stringify(settings, null, 2));
  }

  /**
   * Return stored servers, dropping any entry the adapters could not consume
   * (missing host or an out-of-range port). A previously-corrupted file must never
   * silently wipe the user's list — see readJsonArray.
   */
  public getServers(): VpnServerConfig[] {
    return this.readJsonArray<VpnServerConfig>(this.serversFile, '[StorageManager] servers')
      .filter((server) => this.isUsableServer(server));
  }

  public saveServers(servers: VpnServerConfig[]): void {
    this.writeAtomic(this.serversFile, JSON.stringify(servers, null, 2));
  }

  public getSubscriptions(): Subscription[] {
    return this.readJsonArray<Subscription>(this.subscriptionsFile, '[StorageManager] subscriptions');
  }

  public saveSubscriptions(subs: Subscription[]): void {
    this.writeAtomic(this.subscriptionsFile, JSON.stringify(subs, null, 2));
  }

  /** A node the adapters can actually consume: non-empty host and a real port. */
  private isUsableServer(server: VpnServerConfig): boolean {
    if (!server || typeof server !== 'object') return false;
    if (typeof server.server !== 'string' || !server.server.trim()) return false;
    return Number.isInteger(server.port) && server.port > 0 && server.port < 65536;
  }

  /**
   * Atomically replace `file` with `data`: write a sibling `.tmp` first and rename it
   * over the target (atomic on the same volume), so a crash mid-write cannot truncate
   * the live file. The previous good contents are kept as `<file>.bak`.
   */
  private writeAtomic(file: string, data: string): void {
    const tmp = `${file}.tmp`;
    const backup = `${file}.bak`;
    try {
      fs.writeFileSync(tmp, data, 'utf-8');
      if (fs.existsSync(file)) {
        try {
          fs.copyFileSync(file, backup);
        } catch {
          // Best effort — a missing backup must not block the write.
        }
      }
      fs.renameSync(tmp, file);
    } catch (e) {
      console.error(`[StorageManager] Failed to write ${file}:`, e);
      try {
        if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
      } catch {
        // Ignore cleanup failures.
      }
    }
  }

  /**
   * Read a JSON array, recovering from a corrupt file instead of silently wiping the
   * user's data: the bad file is renamed to `<file>.corrupt-<timestamp>` and the last
   * good `.bak` snapshot is restored when it exists.
   */
  private readJsonArray<T>(file: string, label: string): T[] {
    if (!fs.existsSync(file)) return [];

    try {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf-8'));
      if (Array.isArray(parsed)) return parsed as T[];
      console.error(`${label}: ${file} did not contain a JSON array`);
    } catch (e) {
      console.error(`${label}: ${file} is corrupt:`, e);
    }

    // Quarantine the unreadable file so it is preserved rather than silently dropped.
    const quarantined = `${file}.corrupt-${Date.now()}`;
    try {
      fs.renameSync(file, quarantined);
      console.warn(`${label}: moved unreadable file to ${quarantined}`);
    } catch (e) {
      console.warn(`${label}: could not quarantine ${file}`, e);
    }

    const backup = `${file}.bak`;
    if (fs.existsSync(backup)) {
      try {
        const parsedBackup = JSON.parse(fs.readFileSync(backup, 'utf-8'));
        if (Array.isArray(parsedBackup)) {
          // Restore the main file so later reads stay consistent.
          this.writeAtomic(file, JSON.stringify(parsedBackup, null, 2));
          console.warn(`${label}: recovered ${parsedBackup.length} entries from ${backup}`);
          return parsedBackup as T[];
        }
      } catch (e) {
        console.warn(`${label}: backup ${backup} is unusable:`, e);
      }
    }

    console.error(`${label}: no usable backup for ${file}; returning an empty list`);
    return [];
  }
}
