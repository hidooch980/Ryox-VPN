import * as https from 'https';
import * as http from 'http';
import { VpnServerConfig } from '../../shared/types';
import { ProtocolParser } from '../protocol/parser';

const KNOWN_FREE_SOURCES: readonly string[] = [
  'https://raw.githubusercontent.com/yebekhe/TelegramFreeProxy/main/sub/base64',
  'https://raw.githubusercontent.com/barry-far/V2RayAggregator/master/Sub.txt',
  'https://raw.githubusercontent.com/mahdibland/V2RayAggregator/master/Eternity.txt',
  'https://raw.githubusercontent.com/mfuu/v2ray/master/v2ray',
  'https://raw.githubusercontent.com/aiboboxx/v2rayfree/main/v2',
];

function fetchUrl(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, { timeout: 15_000 }, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} from ${url}`));
        res.resume();
        return;
      }
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
      res.on('error', reject);
    });
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Timeout fetching ${url}`));
    });
    req.on('error', reject);
  });
}

function tryBase64Decode(raw: string): string {
  const stripped = raw.replace(/\s+/g, '');
  // A rudimentary base64 check: no protocol-like strings, length is multiple of 4
  if (!stripped.includes('://') && stripped.length > 0 && stripped.length % 4 === 0) {
    try {
      const decoded = Buffer.from(stripped, 'base64').toString('utf-8');
      // If the decoded text contains known protocol prefixes, it was base64
      if (
        decoded.includes('://') ||
        decoded.includes('proxies:') ||
        decoded.includes('vless') ||
        decoded.includes('vmess') ||
        decoded.includes('trojan')
      ) {
        return decoded;
      }
    } catch {
      // fall through — not valid base64
    }
  }
  return raw;
}

export class AutoSubscribeService {
  private refreshTimer?: NodeJS.Timeout;

  /**
   * Fetches all known free public GitHub config repos, decodes base64 if needed,
   * parses lines via ProtocolParser and returns a deduplicated list of VpnServerConfig.
   */
  public async fetchAndParse(): Promise<VpnServerConfig[]> {
    const allServers: VpnServerConfig[] = [];
    const seenIds = new Set<string>();

    await Promise.allSettled(
      KNOWN_FREE_SOURCES.map(async (url) => {
        try {
          const raw = await fetchUrl(url);
          const content = tryBase64Decode(raw);
          const parsed = ProtocolParser.parseSubscription(content);
          for (const srv of parsed) {
            if (!seenIds.has(srv.id)) {
              seenIds.add(srv.id);
              allServers.push(srv);
            }
          }
        } catch (err) {
          console.warn(`[AutoSubscribeService] Failed to fetch/parse ${url}:`, err);
        }
      }),
    );

    return allServers;
  }

  /**
   * Starts a background auto-refresh loop.
   * @param intervalHours  How many hours between refreshes (must be > 0)
   * @param onNewServers   Callback invoked whenever a successful fetch returns servers
   */
  public startAutoRefresh(
    intervalHours: number,
    onNewServers: (servers: VpnServerConfig[]) => void,
  ): void {
    this.stopAutoRefresh();

    const intervalMs = Math.max(1, intervalHours) * 60 * 60 * 1000;

    this.refreshTimer = setInterval(async () => {
      try {
        const servers = await this.fetchAndParse();
        if (servers.length > 0) {
          onNewServers(servers);
        }
      } catch (err) {
        console.error('[AutoSubscribeService] Auto-refresh error:', err);
      }
    }, intervalMs);
  }

  /** Stops the background auto-refresh loop. */
  public stopAutoRefresh(): void {
    if (this.refreshTimer !== undefined) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = undefined;
    }
  }
}
