import { EventEmitter } from 'events';
import { ConnectionState, VpnServerConfig, AppSettings, LiveStats } from '../../shared/types';
import { CoreManager } from '../core/CoreManager';
import { SystemProxyManager } from './SystemProxyManager';
import { KillSwitch } from './KillSwitch';
import { TrafficMeter, TrafficSample } from './TrafficMeter';
import { DiagnosticsService } from '../diagnostics/DiagnosticsService';

const PING_INTERVAL_TICKS = 5;
const PING_TIMEOUT_MS = 2000;

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

  // Real traffic metering (Windows perf counters of the core process)
  private meter?: TrafficMeter;
  private lastMeterAt = 0;
  private tickCount = 0;
  private pingInFlight = false;
  private killSwitchArmed = false;

  constructor(coreManager: CoreManager, settings: AppSettings) {
    super();
    this.coreManager = coreManager;
    this.settings = settings;
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

  public async connect(server: VpnServerConfig): Promise<boolean> {
    if (this.state === 'CONNECTING' || this.state === 'CONNECTED') {
      await this.disconnect();
    }

    this.setState('CONNECTING');
    this.activeServer = server;
    this.totalUploadBytes = 0;
    this.totalDownloadBytes = 0;
    this.currentPing = 0;
    this.emitLog('INFO', `Initiating connection to ${server.name} via ${server.protocol.toUpperCase()}...`);

    try {
      // Step 1: Start the Core process
      const started = await this.coreManager.startCore(server, this.settings);
      if (!started) {
        this.emitLog('ERROR', `Failed to start VPN engine for ${server.protocol}`);
        this.setState('ERROR');
        return false;
      }

      // Step 2: Configure System Proxy if in SystemProxy mode
      if (this.settings.tunnelMode === 'SystemProxy') {
        this.emitLog('INFO', `Applying Windows system proxy on port ${this.settings.inboundSocksPort || 10808}...`);
        await SystemProxyManager.enableProxy(this.settings.inboundSocksPort || 10808);
      }

      // Step 3: Arm KillSwitch if enabled
      if (this.settings.killSwitch) {
        this.emitLog('INFO', 'Arming traffic leak protection (Kill Switch)...');
        const armed = await KillSwitch.arm(this.coreManager.getBinaryPath(server.core || this.settings.activeCore));
        this.killSwitchArmed = armed;
        if (armed) {
          this.emitLog('INFO', 'Kill Switch armed: outbound traffic is restricted to the VPN core.');
        } else {
          this.emitLog(
            'WARN',
            'Kill Switch could not be armed (administrator rights are required to modify Windows Firewall). ' +
              'Traffic may leak outside the tunnel.'
          );
        }
      }

      // Step 4: VERIFYING state — probe end-to-end connectivity
      this.setState('VERIFYING');
      this.emitLog('INFO', 'Verifying tunnel connectivity and cryptographic handshake...');
      
      const verified = await this.verifyConnection(server);
      if (!verified) {
        this.emitLog('WARN', 'Initial verification warning; core is active, finalizing connection.');
      }

      // Step 5: Transition to CONNECTED
      this.sessionStartTime = Date.now();
      this.setState('CONNECTED');
      this.emitLog('INFO', `Connected successfully to [${server.name}]. Tunnel established.`);

      this.startTelemetryLoop();
      return true;

    } catch (err: any) {
      this.emitLog('ERROR', `Connection failed: ${err.message}`);
      await this.disconnect();
      this.setState('ERROR');
      return false;
    }
  }

  public async disconnect(): Promise<void> {
    if (this.state === 'DISCONNECTED') return;

    this.setState('DISCONNECTING');
    this.emitLog('INFO', 'Tearing down tunnel and restoring networking defaults...');

    this.stopTelemetryLoop();

    // Disable System Proxy
    await SystemProxyManager.disableProxy();

    // Disarm Kill Switch
    if (this.killSwitchArmed) {
      await KillSwitch.disarm();
      this.killSwitchArmed = false;
    }

    // Stop Core Engine
    await this.coreManager.stopCore();

    this.activeServer = undefined;
    this.sessionStartTime = 0;
    this.setState('DISCONNECTED');
    this.emitLog('INFO', 'VPN disconnected. Network returned to normal.');
  }

  private setState(newState: ConnectionState): void {
    this.state = newState;
    this.emit('state-changed', this.state);
    this.emitStats();
  }

  /**
   * Advisory end-to-end probe: a real TCP handshake to the selected node.
   * A failure is reported as a warning but does not abort the connection,
   * because some transports only accept traffic after the handshake settles.
   */
  private async verifyConnection(server: VpnServerConfig): Promise<boolean> {
    const latency = await DiagnosticsService.testTcpLatency(server.server, server.port, PING_TIMEOUT_MS);
    if (latency < 0) return false;

    this.currentPing = latency;
    return true;
  }

  private startTelemetryLoop(): void {
    if (this.statsTimer) clearInterval(this.statsTimer);

    this.lastMeterAt = 0;
    this.tickCount = 0;

    // Throughput comes from the OS counters of the real core process.
    this.meter = new TrafficMeter(
      () => this.coreManager.getActivePid(),
      (sample) => this.handleTrafficSample(sample)
    );
    this.meter.start();

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

    this.pingInFlight = true;
    try {
      const latency = await DiagnosticsService.testTcpLatency(
        this.activeServer.server,
        this.activeServer.port,
        PING_TIMEOUT_MS
      );
      // -1 means the probe timed out or was rejected: report it as unknown (0).
      this.currentPing = latency >= 0 ? latency : 0;
    } finally {
      this.pingInFlight = false;
    }
  }

  private stopTelemetryLoop(): void {
    if (this.statsTimer) {
      clearInterval(this.statsTimer);
      this.statsTimer = undefined;
    }
    this.meter?.stop();
    this.meter = undefined;
    this.lastMeterAt = 0;
    this.tickCount = 0;
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
      killSwitchArmed: this.killSwitchArmed
    };
  }

  private emitStats(): void {
    this.emit('stats-updated', this.getStats());
  }
}
