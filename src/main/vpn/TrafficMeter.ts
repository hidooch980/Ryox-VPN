import { execFile } from 'child_process';

export interface TrafficSample {
  /** Bytes per second received by the core process (i.e. download). */
  downloadBps: number;
  /** Bytes per second sent by the core process (i.e. upload). */
  uploadBps: number;
}

const ZERO_SAMPLE: TrafficSample = { downloadBps: 0, uploadBps: 0 };
const SAMPLE_TIMEOUT_MS = 4000;

/**
 * Reads the *real* I/O counters of the running VPN core process from the
 * Windows performance counters (`Win32_PerfFormattedData_PerfProc_Process`).
 *
 * The counters report per-process read/write throughput in bytes per second:
 * for a proxy/TUN engine, bytes read are inbound (download) and bytes written
 * are outbound (upload). Nothing is simulated: if the core is not running, or
 * the counters are unavailable, a zero sample is reported.
 */
export class TrafficMeter {
  private timer?: NodeJS.Timeout;
  private inFlight = false;
  private failures = 0;

  constructor(
    private readonly getPid: () => number | undefined,
    private readonly onSample: (sample: TrafficSample) => void,
    private readonly intervalMs: number = 2000
  ) {}

  public start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.tick();
    }, this.intervalMs);
    void this.tick();
  }

  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    this.inFlight = false;
    this.failures = 0;
    this.onSample(ZERO_SAMPLE);
  }

  private async tick(): Promise<void> {
    if (this.inFlight) return;

    const pid = this.getPid();
    if (!pid) {
      // Virtual bridge mode: no core process to measure.
      this.onSample(ZERO_SAMPLE);
      return;
    }

    this.inFlight = true;
    try {
      const sample = await queryProcessCounters(pid);
      this.failures = 0;
      this.onSample(sample);
    } catch (err) {
      this.failures += 1;
      // One transient failure is normal while the process is starting; report
      // zeros without spamming the log. Repeated failures are worth a warning.
      if (this.failures === 3) {
        console.warn('[TrafficMeter] Perf counters unavailable, reporting zero throughput:', (err as Error).message);
      }
      this.onSample(ZERO_SAMPLE);
    } finally {
      this.inFlight = false;
    }
  }
}

/**
 * Resolves the read/write throughput of a single PID.
 * Resolves to zeros when Windows reports no counters for that process.
 */
export function queryProcessCounters(pid: number): Promise<TrafficSample> {
  if (!Number.isInteger(pid) || pid <= 0) return Promise.resolve(ZERO_SAMPLE);
  if (process.platform !== 'win32') return Promise.resolve(ZERO_SAMPLE);

  const script = [
    '$ErrorActionPreference = "Stop";',
    `$p = Get-CimInstance Win32_PerfFormattedData_PerfProc_Process -Filter "IDProcess=${pid}" -ErrorAction SilentlyContinue`,
    ' | Select-Object -First 1;',
    'if ($null -eq $p) { "0 0" } else { "{0} {1}" -f [double]$p.IOReadBytesPersec, [double]$p.IOWriteBytesPersec }'
  ].join('');

  return new Promise<TrafficSample>((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { timeout: SAMPLE_TIMEOUT_MS, windowsHide: true, maxBuffer: 64 * 1024 },
      (error, stdout) => {
        if (error) {
          reject(error);
          return;
        }

        const [down, up] = String(stdout).trim().split(/\s+/).map((value) => Number.parseFloat(value));
        resolve({
          downloadBps: Number.isFinite(down) && down > 0 ? down : 0,
          uploadBps: Number.isFinite(up) && up > 0 ? up : 0
        });
      }
    );
  });
}
