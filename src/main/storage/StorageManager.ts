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
      accentColor: '#00e5ff'
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
    try {
      fs.writeFileSync(this.settingsFile, JSON.stringify(settings, null, 2), 'utf-8');
    } catch (e) {
      console.error('[StorageManager] Failed to save settings:', e);
    }
  }

  public getServers(): VpnServerConfig[] {
    try {
      if (fs.existsSync(this.serversFile)) {
        const raw = fs.readFileSync(this.serversFile, 'utf-8');
        return JSON.parse(raw);
      }
    } catch (e) {
      console.warn('[StorageManager] Error reading servers:', e);
    }
    return [];
  }

  public saveServers(servers: VpnServerConfig[]): void {
    try {
      fs.writeFileSync(this.serversFile, JSON.stringify(servers, null, 2), 'utf-8');
    } catch (e) {
      console.error('[StorageManager] Failed to save servers:', e);
    }
  }

  public getSubscriptions(): Subscription[] {
    try {
      if (fs.existsSync(this.subscriptionsFile)) {
        const raw = fs.readFileSync(this.subscriptionsFile, 'utf-8');
        return JSON.parse(raw);
      }
    } catch (e) {
      console.warn('[StorageManager] Error reading subscriptions:', e);
    }
    return [];
  }

  public saveSubscriptions(subs: Subscription[]): void {
    try {
      fs.writeFileSync(this.subscriptionsFile, JSON.stringify(subs, null, 2), 'utf-8');
    } catch (e) {
      console.error('[StorageManager] Failed to save subscriptions:', e);
    }
  }
}
