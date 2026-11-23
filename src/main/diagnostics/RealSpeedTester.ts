export interface SpeedTestResult {
  downloadMbps: number;
  downloadMBps: number;
  durationMs: number;
  bytesReceived: number;
  /**
   * `false` when the download could not be measured at all (offline, blocked by
   * a captive portal, DNS failure, ...). In that case every numeric field is 0
   * and `reason` explains why.
   *
   * The previous version silently returned a fabricated "18.5 Mbps / 2.31 MB/s"
   * on any error, so the UI showed a believable number even with no connectivity.
   */
  measured: boolean;
  reason?: string;
}

/** Payload size of the CDN probe. */
const TEST_BYTES = 500_000;
const TEST_TIMEOUT_MS = 8_000;
const TEST_URL = `https://speed.cloudflare.com/__down?bytes=${TEST_BYTES}`;

export class RealSpeedTester {
  /**
   * Executes a genuine HTTP/HTTPS download speed test using a neutral CDN edge.
   */
  public static async testDownloadSpeed(): Promise<SpeedTestResult> {
    const start = Date.now();

    try {
      const response = await fetch(TEST_URL, {
        signal: AbortSignal.timeout(TEST_TIMEOUT_MS),
        headers: {
          'Cache-Control': 'no-cache'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const buffer = await response.arrayBuffer();
      const bytesReceived = buffer.byteLength;
      if (bytesReceived === 0) {
        throw new Error('the test endpoint returned an empty body');
      }

      const durationMs = Math.max(1, Date.now() - start);
      const bytesPerSecond = (bytesReceived / durationMs) * 1000;

      return {
        downloadMbps: Number(((bytesPerSecond * 8) / 1_000_000).toFixed(2)),
        downloadMBps: Number((bytesPerSecond / (1024 * 1024)).toFixed(2)),
        durationMs,
        bytesReceived,
        measured: true
      };
    } catch (err) {
      return {
        downloadMbps: 0,
        downloadMBps: 0,
        durationMs: Math.max(0, Date.now() - start),
        bytesReceived: 0,
        measured: false,
        reason: err instanceof Error ? err.message : String(err)
      };
    }
  }
}
