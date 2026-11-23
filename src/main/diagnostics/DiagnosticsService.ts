import * as net from 'net';
import * as os from 'os';
import { DiagnosticsResult } from '../../shared/types';

export class DiagnosticsService {
  /**
   * Run full network diagnostics suite.
   *
   * Everything reported here is measured. The previous version invented values
   * when a probe failed (`pingLatency: 45`, `tcpHandshakeMs: 52`,
   * `tunAdapterStatus: 'Active'`, the IP `185.199.108.153`/Fastly and
   * `dnsLeakDetected: false`), so a completely broken tunnel still produced a
   * full green report.
   */
  public static async runDiagnostics(serverHost?: string, serverPort: number = 443): Promise<DiagnosticsResult> {
    let tcpHandshakeMs = -1;

    if (serverHost) {
      tcpHandshakeMs = await this.testTcpLatency(serverHost, serverPort);
    }

    const ipInfo = await this.fetchPublicIpInfo();

    return {
      // This service cannot prove that resolver traffic stays inside the tunnel,
      // so it reports "not verified" rather than a reassuring `false`.
      dnsLeakDetected: null,
      currentPublicIp: ipInfo.ip,
      country: ipInfo.country,
      isp: ipInfo.isp,
      // -1 means "not measured" and the UI renders it as unknown; it must never
      // be replaced by a plausible-looking constant.
      pingLatency: tcpHandshakeMs,
      tcpHandshakeMs,
      tunAdapterStatus: this.detectTunAdapter(),
      timestamp: Date.now()
    };
  }

  public static testTcpLatency(host: string, port: number, timeoutMs: number = 3000): Promise<number> {
    return new Promise((resolve) => {
      const start = Date.now();
      const socket = new net.Socket();

      socket.setTimeout(timeoutMs);

      try {
        socket.connect(port, host, () => {
          const ms = Date.now() - start;
          socket.destroy();
          resolve(ms);
        });
      } catch {
        socket.destroy();
        resolve(-1);
        return;
      }

      socket.on('error', () => {
        socket.destroy();
        resolve(-1);
      });

      socket.on('timeout', () => {
        socket.destroy();
        resolve(-1);
      });
    });
  }

  /**
   * Looks for the virtual adapter the cores create (`ryox-tun`), which is the
   * only honest way to tell whether the tunnel interface exists right now.
   */
  private static detectTunAdapter(): 'Active' | 'Inactive' | 'Error' {
    try {
      const names = Object.keys(os.networkInterfaces());
      const tun = names.find((name) => /ryox[-_]?tun|wintun|sing-?box|tun\d*/i.test(name));
      return tun ? 'Active' : 'Inactive';
    } catch {
      return 'Error';
    }
  }

  private static async fetchPublicIpInfo(): Promise<{ ip?: string; country?: string; isp?: string }> {
    try {
      const res = await fetch('https://ipapi.co/json/', {
        signal: AbortSignal.timeout(4000)
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.ip) {
          return {
            ip: data.ip,
            country: data.country_name || data.country,
            isp: data.org
          };
        }
      }
    } catch {
      // Reported as unknown below — never replaced by a hardcoded address.
    }

    return {};
  }
}
