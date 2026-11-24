import * as fs from 'fs';
import * as path from 'path';
import { AppSettings, VpnServerConfig, Subscription } from '../../shared/types';
import { SecretVault } from './SecretVault';

/**
 * Owns the on-disk JSON stores.
 *
 * Every value written here passes through {@link SecretVault}, so server
 * credentials and subscription tokens are not readable as plaintext. Files
 * written by an older build stay readable: the vault returns legacy plaintext
 * untouched and the next save re-seals it, which migrates an install in place
 * without a separate migration pass.
 */
export class StorageManager {
  private baseDir: string;
  private settingsFile: string;
  private serversFile: string;
  private subscriptionsFile: string;
  private vault: SecretVault;

  constructor(customPath?: string) {
    this.baseDir = customPath || path.join(process.env.APPDATA || process.env.HOME || '.', '.ryox-vpn');
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }

    this.vault = new SecretVault(this.baseDir);

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
        const stored = this.vault.open<Partial<AppSettings>>(JSON.parse(raw));
        if (stored) return { ...defaults, ...stored };
      }
    } catch (e) {
      console.warn('[StorageManager] Error reading settings:', e);
    }
    return defaults;
  }

  public saveSettings(settings: AppSettings): void {
    // The runtime-only clash API token is never persisted, even if a caller
    // hands over a settings object that carries one.
    const { clashApiSecret: _ignored, ...persistable } = settings;
    this.writeAtomic(this.settingsFile, JSON.stringify(this.vault.seal(persistable), null, 2));
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
    this.writeAtomic(this.serversFile, JSON.stringify(this.vault.seal(servers), null, 2));
  }

  public getSubscriptions(): Subscription[] {
    return this.readJsonArray<Subscription>(this.subscriptionsFile, '[StorageManager] subscriptions');
  }

  public saveSubscriptions(subs: Subscription[]): void {
    this.writeAtomic(this.subscriptionsFile, JSON.stringify(this.vault.seal(subs), null, 2));
  }

  /**
   * Parse file contents into an array, unwrapping the vault envelope when
   * present. `value` is null for anything that is not a readable array so the
   * caller can fall through to quarantine + backup recovery; `sealed` records
   * whether the file was an envelope at all, which distinguishes "corrupt" from
   * "sealed with a key this session does not have".
   */
  private decodeArray<T>(contents: string): { value: T[] | null; sealed: boolean } {
    const parsed = JSON.parse(contents) as unknown;
    const sealed = this.vault.isSealed(parsed);
    const value = this.vault.open<unknown>(parsed);
    return { value: Array.isArray(value) ? (value as T[]) : null, sealed };
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
      const decoded = this.decodeArray<T>(fs.readFileSync(file, 'utf-8'));
      if (decoded.value) return decoded.value;
      if (decoded.sealed) {
        // The envelope is intact but this process cannot open it (a locked or
        // missing OS keychain, a different user account). Leave the file where
        // it is: quarantining it would hide data a later run could still read.
        console.error(`${label}: ${file} is sealed with a key this session cannot use; leaving it in place`);
        return [];
      }
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
        const parsedBackup = this.decodeArray<T>(fs.readFileSync(backup, 'utf-8')).value;
        if (parsedBackup) {
          // Restore the main file so later reads stay consistent. The backup is a
          // byte copy of an already-sealed file, so re-sealing is a no-op shape-wise
          // and legacy plaintext backups get sealed here.
          this.writeAtomic(file, JSON.stringify(this.vault.seal(parsedBackup), null, 2));
          console.warn(`${label}: recovered ${parsedBackup.length} entries from ${backup}`);
          return parsedBackup;
        }
      } catch (e) {
        console.warn(`${label}: backup ${backup} is unusable:`, e);
      }
    }

    console.error(`${label}: no usable backup for ${file}; returning an empty list`);
    return [];
  }
}
