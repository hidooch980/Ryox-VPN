import { TrafficSample } from './TrafficMeter';

/**
 * Reads real throughput from a core's Clash-compatible controller API.
 *
 * This is strictly better than reading the OS counters of the core process:
 * the counters include the core's own disk and IPC traffic and are unavailable
 * as soon as the PID is hidden, while the controller reports exactly the bytes
 * the tunnel moved — and it also works for cores whose traffic never touches
 * the process's own sockets (TUN mode).
 *
 * Every failure mode (no listener, wrong secret, timeout, a non-2xx reply, a
 * body that is not the expected JSON) resolves to `null`: telemetry must never
 * take down the connection it is measuring.
 */
const REQUEST_TIMEOUT_MS = 1500;
/** The counters are cumulative; a delta over less than this is mostly noise. */
const MIN_ELAPSED_SECONDS = 0.2;

interface ConnectionsSnapshot {
  downloadTotal: number;
  uploadTotal: number;
}

export class ClashApiClient {
  private readonly baseUrl: string;
  private readonly secret?: string;

  private lastDownload?: number;
  private lastUpload?: number;
  private lastAt?: number;
  private availableFlag = false;

  constructor(baseUrl: string, secret?: string) {
    // Tolerate a trailing slash so callers can pass either form.
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.secret = secret;
  }

  /** True once a request has succeeded; false after any failure. */
  public get available(): boolean {
    return this.availableFlag;
  }

  public async sampleTraffic(): Promise<TrafficSample | null> {
    const snapshot = await this.fetchTotals();
    if (!snapshot) return null;

    const now = Date.now();
    const download = typeof snapshot.downloadTotal === 'number' ? snapshot.downloadTotal : 0;
    const upload = typeof snapshot.uploadTotal === 'number' ? snapshot.uploadTotal : 0;

    const previous = this.lastAt !== undefined ? { download: this.lastDownload ?? 0, upload: this.lastUpload ?? 0, at: this.lastAt } : undefined;

    this.lastDownload = download;
    this.lastUpload = upload;
    this.lastAt = now;

    // The controller counts from process start, so the first reading has no
    // baseline to subtract: report a zero sample instead of inventing one.
    if (!previous) {
      return { downloadBps: 0, uploadBps: 0 };
    }

    const elapsedSeconds = Math.max((now - previous.at) / 1000, MIN_ELAPSED_SECONDS);
    // A counter that went backwards means the core restarted; clamp at zero
    // rather than reporting a negative speed.
    const downloadDelta = Math.max(download - previous.download, 0);
    const uploadDelta = Math.max(upload - previous.upload, 0);

    return {
      downloadBps: Math.round(downloadDelta / elapsedSeconds),
      uploadBps: Math.round(uploadDelta / elapsedSeconds)
    };
  }

  private async fetchTotals(): Promise<ConnectionsSnapshot | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const headers: Record<string, string> = {};
      if (this.secret) headers.Authorization = `Bearer ${this.secret}`;

      const response = await fetch(`${this.baseUrl}/connections`, { headers, signal: controller.signal });
      if (!response.ok) {
        this.availableFlag = false;
        return null;
      }

      const body = (await response.json()) as ConnectionsSnapshot;
      if (!body || !Number.isSafeInteger(body.downloadTotal) || body.downloadTotal < 0 ||
          !Number.isSafeInteger(body.uploadTotal) || body.uploadTotal < 0) {
        this.availableFlag = false;
        return null;
      }
      this.availableFlag = true;
      return body;
    } catch {
      // Unreachable, aborted, or a body that is not JSON.
      this.availableFlag = false;
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}
