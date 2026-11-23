import * as https from 'https';
import * as http from 'http';
import { VpnServerConfig } from '../../shared/types';
import { ProtocolParser, dedupeServers } from '../protocol/parser';

const KNOWN_FREE_SOURCES: readonly string[] = [
  'https://raw.githubusercontent.com/mahdibland/V2RayAggregator/master/Eternity.txt',
  'https://raw.githubusercontent.com/ermaozi/get_subscribe/main/subscribe/v2ray.txt',
  'https://raw.githubusercontent.com/Pawdroid/Free-servers/main/sub',
  'https://raw.githubusercontent.com/freefq/free/master/v2'
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
  // Delegate to the shared lenient helper so unpadded / URL-safe payloads decode too.
  return ProtocolParser.decodeBase64Payload(raw);
}

export class AutoSubscribeService {
  private refreshTimer?: NodeJS.Timeout;

  /**
   * Fetches all known free public GitHub config repos, decodes base64 if needed,
   * parses lines via ProtocolParser and returns a deduplicated list of VpnServerConfig.
   */
  public async fetchAndParse(): Promise<VpnServerConfig[]> {
    const allServers: VpnServerConfig[] = [];

    await Promise.allSettled(
      KNOWN_FREE_SOURCES.map(async (url) => {
        try {
          const raw = await fetchUrl(url);
          const content = tryBase64Decode(raw);
          const parsed = ProtocolParser.parseSubscription(content);
          allServers.push(...parsed);
        } catch (err) {
          console.warn(`[AutoSubscribeService] Failed to fetch/parse ${url}:`, err);
        }
      }),
    );

    // Deduplicate by the stable node id (secret-aware) with a host:port:protocol fallback.
    return dedupeServers(allServers);
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
