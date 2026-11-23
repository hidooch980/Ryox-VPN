import * as net from 'net';

export interface CleanIpResult {
  ip: string;
  latencyMs: number;
  status: 'FAST' | 'MEDIUM' | 'SLOW' | 'TIMEOUT';
}

export class CleanIpScanner {
  // Curated list of prominent Cloudflare IP candidates commonly tested for unthrottled routing
  private static candidateIps: string[] = [
    '162.159.192.1',
    '162.159.193.1',
    '162.159.192.5',
    '162.159.195.2',
    '188.114.96.1',
    '188.114.97.1',
    '188.114.98.2',
    '188.114.99.3',
    '104.16.132.229',
    '104.17.150.1',
    '104.18.20.1',
    '104.19.100.1',
    '172.67.180.1',
    '172.67.200.1'
  ];

  public static async scan(port: number = 443, timeoutMs: number = 2500): Promise<CleanIpResult[]> {
    const promises = this.candidateIps.map(ip => this.probeIp(ip, port, timeoutMs));
    const results = await Promise.all(promises);

    // Sort by lowest latency, filtering out timed-out nodes
    return results.sort((a, b) => {
      if (a.latencyMs < 0) return 1;
      if (b.latencyMs < 0) return -1;
      return a.latencyMs - b.latencyMs;
    });
  }

  private static probeIp(ip: string, port: number, timeoutMs: number): Promise<CleanIpResult> {
    return new Promise((resolve) => {
      const start = Date.now();
      const socket = new net.Socket();
      socket.setTimeout(timeoutMs);

      socket.connect(port, ip, () => {
        const ms = Date.now() - start;
        socket.destroy();
        resolve({
          ip,
          latencyMs: ms,
          status: ms < 80 ? 'FAST' : ms < 180 ? 'MEDIUM' : 'SLOW'
        });
      });

      socket.on('error', () => {
        socket.destroy();
        resolve({ ip, latencyMs: -1, status: 'TIMEOUT' });
      });

      socket.on('timeout', () => {
        socket.destroy();
        resolve({ ip, latencyMs: -1, status: 'TIMEOUT' });
      });
    });
  }
}
