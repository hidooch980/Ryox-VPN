import * as net from 'net';
import { VpnServerConfig } from '../../shared/types';
import { VpnConnectionManager } from './VpnConnectionManager';

const PING_TIMEOUT_MS = 2_000;
/** How many of the fastest reachable nodes a single smart-connect run may try. */
const MAX_CONNECT_ATTEMPTS = 5;

function isValidPort(port: unknown): port is number {
  return typeof port === 'number' && Number.isInteger(port) && port > 0 && port < 65536;
}

/**
 * Measures TCP connection latency to a server in milliseconds.
 * Returns -1 if the connection fails, times out, or the address is unusable.
 */
function measureLatency(server: string, port: number): Promise<number> {
  return new Promise((resolve) => {
    if (!server || !isValidPort(port)) {
      resolve(-1);
      return;
    }

    const start = Date.now();
    let socket: net.Socket;
    let settled = false;

    const done = (latency: number) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      socket?.destroy();
      resolve(latency);
    };

    // `net.createConnection` throws synchronously for an invalid host/port
    // (which happens for nodes parsed without a port). Inside a promise
    // executor that rejects the whole promise, and a single malformed node used
    // to abort the entire auto-select run.
    try {
      socket = net.createConnection({ host: server, port });
    } catch {
      resolve(-1);
      return;
    }

    const timeout = setTimeout(() => done(-1), PING_TIMEOUT_MS);

    socket.once('connect', () => done(Date.now() - start));
    socket.once('error', () => done(-1));
    socket.once('timeout', () => done(-1));
  });
}

export class SmartConnectService {
  private readonly vpnManager: VpnConnectionManager;

  constructor(_servers: VpnServerConfig[], vpnManager: VpnConnectionManager) {
    this.vpnManager = vpnManager;
  }

  /**
   * Pings all provided servers in parallel and returns the reachable ones
   * sorted from fastest to slowest.
   */
  public async rankServers(servers: VpnServerConfig[]): Promise<VpnServerConfig[]> {
    const probeable = servers.filter((srv) => Boolean(srv.server) && isValidPort(srv.port));
    if (probeable.length === 0) return [];

    const results = await Promise.all(
      probeable.map(async (srv) => {
        const latency = await measureLatency(srv.server, srv.port);
        return { srv, latency };
      }),
    );

    return results
      .filter((r) => r.latency > 0)
      .sort((a, b) => a.latency - b.latency)
      .map((r) => ({ ...r.srv, latency: r.latency }));
  }

  /**
   * Returns the single fastest reachable server, or null if none respond.
   */
  public async findBestServer(servers: VpnServerConfig[]): Promise<VpnServerConfig | null> {
    const ranked = await this.rankServers(servers);
    return ranked.length > 0 ? ranked[0] : null;
  }

  /**
   * Walks the reachable nodes from fastest to slowest and connects to the first
   * one that actually establishes a tunnel.
   *
   * It used to try exactly one node: the "best" by raw TCP latency, which says
   * nothing about whether the protocol handshake succeeds, so smart connect
   * reported "no reachable server" whenever that single node was a dud.
   */
  public async smartConnect(servers: VpnServerConfig[]): Promise<VpnServerConfig | null> {
    const ranked = await this.rankServers(servers);
    if (ranked.length === 0) {
      console.warn('[SmartConnectService] No reachable server found.');
      return null;
    }

    const candidates = ranked.slice(0, MAX_CONNECT_ATTEMPTS);
    console.log(`[SmartConnectService] ${candidates.length} reachable node(s); trying them in latency order.`);

    for (const candidate of candidates) {
      try {
        const connected = await this.vpnManager.connect(candidate);
        if (connected) return candidate;
        console.warn(`[SmartConnectService] ${candidate.name} did not establish a tunnel; trying the next node.`);
      } catch (err) {
        console.error(`[SmartConnectService] connect(${candidate.name}) threw:`, err);
      }
    }

    // Never leave a half-open attempt behind (proxy applied, core running).
    await this.vpnManager.disconnect();
    return null;
  }
}
