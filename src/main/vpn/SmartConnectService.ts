import * as net from 'net';
import { VpnServerConfig } from '../../shared/types';
import { VpnConnectionManager } from './VpnConnectionManager';

const PING_TIMEOUT_MS = 2_000;

/**
 * Measures TCP connection latency to a server in milliseconds.
 * Returns -1 if the connection fails or times out.
 */
function measureLatency(server: string, port: number): Promise<number> {
  return new Promise((resolve) => {
    const start = Date.now();
    const socket = net.createConnection({ host: server, port });

    const done = (latency: number) => {
      socket.destroy();
      resolve(latency);
    };

    const timeout = setTimeout(() => done(-1), PING_TIMEOUT_MS);

    socket.once('connect', () => {
      clearTimeout(timeout);
      done(Date.now() - start);
    });

    socket.once('error', () => {
      clearTimeout(timeout);
      done(-1);
    });
  });
}

export class SmartConnectService {
  private readonly vpnManager: VpnConnectionManager;

  constructor(_servers: VpnServerConfig[], vpnManager: VpnConnectionManager) {
    this.vpnManager = vpnManager;
  }

  /**
   * Pings all provided servers in parallel and returns the one with the
   * lowest positive latency, or null if none respond.
   */
  public async findBestServer(servers: VpnServerConfig[]): Promise<VpnServerConfig | null> {
    if (servers.length === 0) return null;

    const results = await Promise.all(
      servers.map(async (srv) => {
        const latency = await measureLatency(srv.server, srv.port);
        return { srv, latency };
      }),
    );

    // Keep only reachable servers (latency > 0)
    const reachable = results.filter((r) => r.latency > 0);
    if (reachable.length === 0) return null;

    // Sort ascending by latency and return the fastest
    reachable.sort((a, b) => a.latency - b.latency);
    const best = reachable[0];
    return { ...best.srv, latency: best.latency };
  }

  /**
   * Finds the best reachable server and connects to it via vpnManager.
   * Returns the connected server config, or null on failure.
   */
  public async smartConnect(servers: VpnServerConfig[]): Promise<VpnServerConfig | null> {
    const best = await this.findBestServer(servers);
    if (!best) {
      console.warn('[SmartConnectService] No reachable server found.');
      return null;
    }

    try {
      const connected = await this.vpnManager.connect(best);
      if (connected) {
        return best;
      }
    } catch (err) {
      console.error('[SmartConnectService] vpnManager.connect failed:', err);
    }

    return null;
  }
}
