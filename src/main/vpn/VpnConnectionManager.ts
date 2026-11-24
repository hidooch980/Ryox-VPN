import { execFile } from 'child_process';
import { join } from 'path';
import { EventEmitter } from 'events';
import { ConnectionState, VpnServerConfig, AppSettings, LiveStats } from '../../shared/types';
import { CoreManager } from '../core/CoreManager';
import { SystemProxyManager } from './SystemProxyManager';
import { KillSwitch } from './KillSwitch';
import { TrafficMeter, TrafficSample } from './TrafficMeter';
import { ClashApiClient } from './ClashApiClient';
import { DiagnosticsService } from '../diagnostics/DiagnosticsService';
import { HealthMonitor } from './HealthMonitor';

const PING_INTERVAL_TICKS = 5;
const PING_TIMEOUT_MS = 2000;
const LOCAL_ENDPOINT_TIMEOUT_MS = 5000;
/** How often the core controller is polled for throughput. */
const CLASH_POLL_MS = 1000;
/** Consecutive controller failures tolerated before falling back. */
const CLASH_MAX_FAILURES = 3;

// Ask an HTTPS endpoint through the core's SOCKS listener. curl verifies TLS,
// resolves the remote hostname inside the proxy and enforces a total deadline.
export function verifyTunnel(port: number): Promise<boolean> {
  const curl = process.platform === 'win32' ? join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'curl.exe') : 'curl';
  return new Promise(resolve => {
    execFile(curl, ['--disable', '--silent', '--output', process.platform === 'win32' ? 'NUL' : '/dev/null',
      '--write-out', '%{http_code}', '--max-time', '8', '--noproxy', '', '--proxy',
      `socks5h://127.0.0.1:${port}`, 'https://connectivitycheck.gstatic.com/generate_204'],
      { windowsHide: true, timeout: 9500 }, (error, status) => resolve(!error && status === '204'));
  });
}

export class VpnConnectionManager extends EventEmitter {
  private state: ConnectionState = 'DISCONNECTED';
  private activeServer?: VpnServerConfig;
  private coreManager: CoreManager;
  private settings: AppSettings;
  private sessionStartTime: number = 0;
  private statsTimer?: NodeJS.Timeout;

  // Real-time telemetry counters
  private totalUploadBytes: number = 0;
  private totalDownloadBytes: number = 0;
  private currentUploadSpeed: number = 0;
  private currentDownloadSpeed: number = 0;
  private currentPing: number = 0;
  private publicIp?: string;
  private country?: string;

  // Real traffic metering (Clash controller API, or the Windows perf counters
  // of the core process when the controller is not enabled)
  private meter?: TrafficMeter;
  private clashClient?: ClashApiClient;
  private clashTimer?: NodeJS.Timeout;
  private clashFailures = 0;
  private lastMeterAt = 0;
  private tickCount = 0;
  private pingInFlight = false;
  private killSwitchArmed = false;

  // Health tracking and automatic node switching
  private health = new HealthMonitor();
  private autoSwitchCount = 0;
  private switchInFlight = false;
  private telemetrySource: 'clash-api' | 'process-counters' = 'process-counters';

  /**
   * Picks a replacement node when the active one has been unhealthy for several
   * consecutive samples. Supplied by the main process because the connection
   * manager deliberately knows nothing about the server catalogue; returning
   * null means "no better node", which leaves the current session untouched.
   */
  private autoSwitchHandler?: (current: VpnServerConfig) => Promise<VpnServerConfig | null>;

  /**
   * Monotonic token identifying the current connection attempt. Every `await`
   * in `connect()` re-checks it, so a disconnect (or a second, faster connect)
   * during the handshake aborts the stale attempt instead of letting it finish
   * with a phantom CONNECTED state and an armed system proxy.
   */
  private attempt = 0;
  private userIntent = 0;

  constructor(coreManager: CoreManager, settings: AppSettings, private readonly probeTunnel = verifyTunnel) {
    super();
    this.coreManager = coreManager;
    this.settings = settings;
    // A core that dies on its own must not leave the UI reporting CONNECTED.
    this.coreManager.setExitCallback((code, signal) => this.handleCoreExit(code, signal));
  }

  public getState(): ConnectionState {
    return this.state;
  }

  public updateSettings(settings: AppSettings): void {
    this.settings = settings;
  }

  /** Current settings snapshot (updated by `settings:save`). */
  public getSettings(): AppSettings {
    return this.settings;
  }

  /** Registers the node-selection strategy used by the auto-switch loop. */
  public setAutoSwitchHandler(handler: (current: VpnServerConfig) => Promise<VpnServerConfig | null>): void {
    this.autoSwitchHandler = handler;
  }

  /** Reflect an externally applied kill-switch state in the reported stats. */
  public setKillSwitchArmed(armed: boolean): void {
    this.killSwitchArmed = armed;
    this.emitStats();
  }

  private sanitizeLog(msg: string): string {
    return msg
      .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '***-UUID-REDACTED-***')
      .replace(/(password|secret|key|pbk|shortid)=[^&\s]+/gi, '$1=***REDACTED***');
  }

  public emitLog(level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG', msg: string): void {
    this.emit('log', level, this.sanitizeLog(msg));
  }

  private isCurrent(attemptToken: number): boolean {
    return attemptToken === this.attempt;
  }

  public async connect(server: VpnServerConfig): Promise<boolean> {
    return this.connectTo(server, ++this.userIntent);
  }

  private async connectTo(server: VpnServerConfig, intent: number): Promise<boolean> {
    if (this.state === 'CONNECTING' || this.state === 'VERIFYING' || this.state === 'CONNECTED') {
      this.attempt += 1;
      await this.teardown();
      if (intent !== this.userIntent) return false;
    }

    // Snapshot the settings for this attempt: `settings:save` swaps the shared
    // object, and re-reading it after an await used to combine a new active core
    // with a config generated from the previous one.
    const settings: AppSettings = { ...this.settings };
    const myAttempt = ++this.attempt;

    this.setState('CONNECTING');
    this.activeServer = server;
    this.totalUploadBytes = 0;
    this.totalDownloadBytes = 0;
    this.currentPing = 0;
    this.emitLog('INFO', `Initiating connection to ${server.name} via ${server.protocol.toUpperCase()}...`);

    const localPort = settings.inboundSocksPort || 10808;

    try {
      // Step 1: Start the Core process
      const started = await this.coreManager.startCore(server, settings);
      if (!this.isCurrent(myAttempt)) return false;
      if (!started) {
        this.emitLog(
          'ERROR',
          `Failed to start the ${server.core || settings.activeCore} VPN engine. ` +
            'See the log above for the engine\'s own error.'
        );
        this.setState('ERROR');
        return false;
      }

      // Step 2: Configure System Proxy if in SystemProxy mode
      if (settings.tunnelMode === 'SystemProxy') {
        this.emitLog('INFO', `Applying Windows system proxy on port ${localPort}...`);
        const applied = await SystemProxyManager.enableProxy((server.core || settings.activeCore) === 'xray' ? settings.inboundHttpPort || 10809 : localPort);
        if (!this.isCurrent(myAttempt)) return false;
        if (!applied) {
          this.emitLog('ERROR', 'Could not apply the Windows system proxy; refusing to report a connected tunnel.');
          await this.teardown();
          this.setState('ERROR');
          return false;
        }
      }

      // Step 3: Arm KillSwitch if enabled
      if (settings.killSwitch) {
        this.emitLog('INFO', 'Arming traffic leak protection (Kill Switch)...');
        const armed = await KillSwitch.arm(this.coreManager.getBinaryPath(server.core || settings.activeCore));
        if (!this.isCurrent(myAttempt)) return false;
        this.killSwitchArmed = armed;
        if (armed) {
          this.emitLog('INFO', 'Kill Switch armed: outbound traffic is restricted to the VPN core.');
        } else {
          throw new Error('Kill Switch could not be armed. Check administrator rights and firewall settings.');
        }
      }

      // Step 4: VERIFYING — the tunnel is only real if the local inbound accepts
      // connections. Probing the remote node proved nothing: it works even when
      // the core never started.
      this.setState('VERIFYING');
      this.emitLog('INFO', `Verifying the local tunnel endpoint on 127.0.0.1:${localPort}...`);

      const verified = await this.verifyLocalEndpoint(localPort, LOCAL_ENDPOINT_TIMEOUT_MS);
      if (!this.isCurrent(myAttempt)) return false;
      if (!verified || !(await this.probeTunnel(localPort))) {
        if (!this.isCurrent(myAttempt)) return false;
        this.emitLog('ERROR', `Nothing accepts connections on 127.0.0.1:${localPort} — the tunnel is not usable.`);
        await this.teardown();
        this.setState('ERROR');
        return false;
      }

      if (!this.isCurrent(myAttempt)) return false;

      // Step 5: Transition to CONNECTED
      this.sessionStartTime = Date.now();
      this.setState('CONNECTED');
      this.emitLog('INFO', `Connected successfully to [${server.name}]. Tunnel established.`);

      this.startTelemetryLoop();
      return true;
    } catch (err: any) {
      if (!this.isCurrent(myAttempt)) return false;
      this.emitLog('ERROR', `Connection failed: ${err.message}`);
      await this.teardown();
      this.setState('ERROR');
      return false;
    }
  }

  public async disconnect(): Promise<void> {
    this.userIntent += 1;
    if (this.state === 'DISCONNECTED') return;

    // Invalidate any in-flight connect before tearing anything down.
    this.attempt += 1;
    await this.teardown();
  }

  /**
   * Restores the machine to a clean, unprotected networking state. Deliberately
   * does not bump the attempt token, so it can also run from inside `connect()`
   * on its own failure paths.
   */
  private async teardown(): Promise<void> {
    this.setState('DISCONNECTING');
    this.emitLog('INFO', 'Tearing down tunnel and restoring networking defaults...');

    this.stopTelemetryLoop();

    // Disable System Proxy
    await SystemProxyManager.disableProxy();

    // Disarm Kill Switch
    if (this.killSwitchArmed) {
      this.killSwitchArmed = !(await KillSwitch.disarm());
    }

    // Stop Core Engine
    await this.coreManager.stopCore();

    this.activeServer = undefined;
    this.sessionStartTime = 0;
    if (this.killSwitchArmed) {
      this.setState('ERROR');
      this.emitLog('ERROR', 'Could not restore the firewall policy. Retry disconnect with administrator rights.');
      return;
    }
    this.setState('DISCONNECTED');
    this.emitLog('INFO', 'VPN disconnected. Network returned to normal.');
  }

  private setState(newState: ConnectionState): void {
    this.state = newState;
    this.emit('state-changed', this.state);
    this.emitStats();
  }

  /**
   * The core process died on its own (crash, or Task Manager). Before this the
   * UI kept showing CONNECTED, the Windows proxy kept pointing at a dead port
   * and the kill switch stayed armed.
   */
  private handleCoreExit(code: number | null, signal: NodeJS.Signals | null): void {
    if (this.state !== 'CONNECTED' && this.state !== 'VERIFYING') return;

    this.emitLog('ERROR', `VPN core exited unexpectedly (code ${code}, signal ${signal}). The tunnel is down.`);
    void this.handleUnexpectedLoss();
  }

  private async handleUnexpectedLoss(): Promise<void> {
    this.attempt += 1;
    this.stopTelemetryLoop();

    await SystemProxyManager.disableProxy();
    this.activeServer = undefined;
    this.sessionStartTime = 0;
    this.setState('ERROR');
    this.emitLog('WARN', 'Tunnel lost. Reconnect or disconnect to restore your network settings.');
  }

  /**
   * Called when Windows resumes from sleep/hibernate: the tunnel may not
   * survive it, and the UI used to keep reporting CONNECTED with ping 0.
   */
  public async handleResume(): Promise<void> {
    if (this.state !== 'CONNECTED') return;

    const port = this.settings.inboundSocksPort || 10808;
    const attempt = this.attempt;
    const stillUp = this.coreManager.isRunning() && (await this.probeTunnel(port));
    if (attempt !== this.attempt) return;

    if (stillUp) {
      this.emitLog('INFO', 'Resumed from sleep: the tunnel is still reachable.');
      return;
    }

    this.emitLog('WARN', 'Resumed from sleep and the tunnel is no longer reachable; tearing it down.');
    this.attempt += 1;
    await this.coreManager.stopCore();
    await this.handleUnexpectedLoss();
  }

  /**
   * Waits until the local inbound actually accepts a TCP connection.
   */
  private async verifyLocalEndpoint(port: number, timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;

    for (;;) {
      const latency = await DiagnosticsService.testTcpLatency('127.0.0.1', port, 1000);
      if (latency >= 0) {
        this.currentPing = latency;
        return true;
      }
      if (Date.now() >= deadline) return false;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  /** Falls back to OS process counters when the controller stays unreachable. */
  private startProcessMeter(): void {
    if (this.meter) return;
    this.telemetrySource = 'process-counters';
    this.meter = new TrafficMeter(
      () => this.coreManager.getActivePid(),
      (sample) => this.handleTrafficSample(sample)
    );
    this.meter.start();
  }

  private stopTrafficSource(): void {
    if (this.clashTimer) {
      clearInterval(this.clashTimer);
      this.clashTimer = undefined;
    }
    this.clashClient = undefined;
    this.clashFailures = 0;
    this.meter?.stop();
    this.meter = undefined;
  }

  /**
   * One controller poll. Consecutive failures switch the session to the
   * process-counter meter: an enabled-but-blocked controller port must not
   * leave the UI showing a permanent 0 B/s.
   */
  private async pollClashApi(client: ClashApiClient): Promise<void> {
    const sample = await client.sampleTraffic();
    if (this.clashClient !== client || this.state !== 'CONNECTED') return;

    if (!sample) {
      this.clashFailures += 1;
      if (this.clashFailures >= CLASH_MAX_FAILURES) {
        this.emitLog('WARN', 'Core controller API is unreachable — falling back to process counters.');
        this.stopTrafficSource();
        this.startProcessMeter();
        this.emitStats();
      }
      return;
    }

    this.clashFailures = 0;
    this.handleTrafficSample(sample);
  }

  private startTelemetryLoop(): void {
    if (this.statsTimer) clearInterval(this.statsTimer);

    this.lastMeterAt = 0;
    this.tickCount = 0;
    this.health.reset();

    // The previous source must be stopped first: overwriting the field left the
    // old interval running forever, spawning a PowerShell every 2 seconds and
    // double-counting the traffic.
    this.stopTrafficSource();

    // Prefer the core's own controller API when the user enabled it: it reports
    // exactly the bytes the tunnel moved, works for TUN traffic that never
    // touches the process's sockets, and needs no elevated process query.
    const endpoint = this.coreManager.getClashApiEndpoint();
    if (endpoint) {
      const client = new ClashApiClient(endpoint.baseUrl, endpoint.secret);
      this.clashClient = client;
      this.clashFailures = 0;
      this.telemetrySource = 'clash-api';
      this.clashTimer = setInterval(() => {
        void this.pollClashApi(client);
      }, CLASH_POLL_MS);
      void this.pollClashApi(client);
    } else {
      this.startProcessMeter();
    }

    this.statsTimer = setInterval(() => {
      if (this.state !== 'CONNECTED') return;

      this.tickCount += 1;
      if (this.tickCount % PING_INTERVAL_TICKS === 0) {
        void this.refreshPing();
      }

      this.emitStats();
    }, 1000);
  }

  /** Integrates measured throughput into the session totals. */
  private handleTrafficSample(sample: TrafficSample): void {
    const now = Date.now();
    const elapsedSeconds = this.lastMeterAt > 0 ? Math.min((now - this.lastMeterAt) / 1000, 10) : 0;
    this.lastMeterAt = now;

    this.currentDownloadSpeed = Math.round(sample.downloadBps);
    this.currentUploadSpeed = Math.round(sample.uploadBps);

    if (elapsedSeconds > 0) {
      this.totalDownloadBytes += Math.round(sample.downloadBps * elapsedSeconds);
      this.totalUploadBytes += Math.round(sample.uploadBps * elapsedSeconds);
    }

    if (this.state === 'CONNECTED') this.emitStats();
  }

  private async refreshPing(): Promise<void> {
    if (this.pingInFlight || !this.activeServer || this.state !== 'CONNECTED') return;

    const myAttempt = this.attempt;
    const server = this.activeServer;

    this.pingInFlight = true;
    try {
      const latency = await DiagnosticsService.testTcpLatency(server.server, server.port, PING_TIMEOUT_MS);
      // A stale probe must not repopulate the ping of a session that ended
      // while the probe was in flight.
      if (myAttempt !== this.attempt || this.state !== 'CONNECTED') return;

      // -1 means the probe timed out or was rejected: report it as unknown (0).
      this.currentPing = latency >= 0 ? latency : 0;

      // A rejected probe is a real signal (the node stopped answering), so it is
      // fed to the health monitor as-is instead of being skipped.
      if (this.health.record({ pingMs: latency })) {
        void this.maybeAutoSwitch(server, myAttempt);
      }
      this.emitStats();
    } finally {
      this.pingInFlight = false;
    }
  }

  /**
   * Replaces a persistently unhealthy node with a better one.
   *
   * Guarded three ways: the feature must be enabled, only one switch may run at
   * a time, and the attempt token must still be current after the async node
   * search — otherwise a user-initiated reconnect would be fought by the loop.
   */
  private async maybeAutoSwitch(current: VpnServerConfig, myAttempt: number): Promise<void> {
    if (!this.settings.autoSwitchEnabled) return;
    if (this.switchInFlight || !this.autoSwitchHandler) return;
    if (myAttempt !== this.attempt || this.state !== 'CONNECTED') return;

    this.switchInFlight = true;
    try {
      const replacement = await this.autoSwitchHandler(current);
      if (!replacement || replacement.id === current.id) return;
      if (myAttempt !== this.attempt || this.state !== 'CONNECTED') return;

      this.autoSwitchCount += 1;
      this.emitLog('WARN', `Health dropped below threshold — switching to "${replacement.name}".`);
      // connect() bumps the attempt token itself, which cancels this loop.
      const intent = this.userIntent;
        if (await this.connectTo(replacement, intent)) {
          this.autoSwitchCount += 1;
          this.emitStats();
        } else if (this.userIntent === intent && this.getState() === 'ERROR') {
          this.emitLog('WARN', 'Replacement failed. Reconnecting to the previous server.');
          await this.connectTo(current, intent);
        }
    } catch (err) {
      this.emitLog('WARN', `Automatic node switch failed: ${(err as Error).message}`);
    } finally {
      this.switchInFlight = false;
    }
  }

  private stopTelemetryLoop(): void {
    if (this.statsTimer) {
      clearInterval(this.statsTimer);
      this.statsTimer = undefined;
    }
    this.stopTrafficSource();
    this.lastMeterAt = 0;
    this.tickCount = 0;
    this.health.reset();
    this.currentDownloadSpeed = 0;
    this.currentUploadSpeed = 0;
    this.currentPing = 0;
    this.emitStats();
  }

  public getStats(): LiveStats {
    const elapsedSeconds = this.sessionStartTime > 0 ? Math.floor((Date.now() - this.sessionStartTime) / 1000) : 0;
    return {
      connectionState: this.state,
      activeServer: this.activeServer,
      activeCore: this.coreManager.getRunningCore() || this.settings.activeCore,
      uploadSpeed: this.currentUploadSpeed,
      downloadSpeed: this.currentDownloadSpeed,
      totalUpload: this.totalUploadBytes,
      totalDownload: this.totalDownloadBytes,
      sessionDuration: elapsedSeconds,
      pingMs: this.currentPing,
      clientIp: this.publicIp,
      clientCountry: this.country,
      killSwitchArmed: this.killSwitchArmed,
      healthScore: this.health.getScore(),
      telemetrySource: this.telemetrySource,
      autoSwitchCount: this.autoSwitchCount
    };
  }

  private emitStats(): void {
    this.emit('stats-updated', this.getStats());
  }
}
