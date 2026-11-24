import { 
  VpnServerConfig, 
  AppSettings, 
  ConnectionState, 
  LiveStats, 
  Subscription, 
  FreeConfigSource, 
  CoreMetadata,
  DiagnosticsResult 
} from '../../../shared/types';

declare global {
  interface Window {
    ryoxApi?: any;
    AndroidBridge?: any;
    _onAndroidStateChanged?: (state: string) => void;
    _onAndroidStatsUpdated?: (stats: any) => void;
    _onAndroidLog?: (level: string, message: string) => void;
  }
}

// Android WebView Native Bridge Adapter
if (typeof window !== 'undefined' && (window as any).AndroidBridge && !window.ryoxApi) {
  const bridge = (window as any).AndroidBridge;
  window.ryoxApi = {
    connect: async (server: any) => {
      return bridge.connect(JSON.stringify(server));
    },
    disconnect: async () => {
      return bridge.disconnect();
    },
    getState: async () => {
      return bridge.getState();
    },
    getStats: async () => {
      try { return JSON.parse(bridge.getStats()); } catch { return null; }
    },
    getServers: async () => {
      try { return JSON.parse(bridge.getServers()); } catch { return []; }
    },
    saveServer: async (server: any) => {
      try { return JSON.parse(bridge.saveServer(JSON.stringify(server))); } catch { return []; }
    },
    removeServer: async (id: string) => {
      try { return JSON.parse(bridge.removeServer(id)); } catch { return []; }
    },
    pingServer: async (server: any) => {
      try { return bridge.pingServer(server.server, server.port); } catch { return -1; }
    },
    parseUri: async (_uri: string) => {
      return null;
    },
    getSubscriptions: async () => {
      try { return JSON.parse(bridge.getSubscriptions()); } catch { return []; }
    },
    addSubscription: async (name: string, url: string, interval: number) => {
      try { return JSON.parse(bridge.addSubscription(name, url, interval)); } catch { return []; }
    },
    updateSubscription: async (id: string) => {
      try { return JSON.parse(bridge.updateSubscription(id)); } catch { return []; }
    },
    removeSubscription: async (id: string) => {
      try { return bridge.removeSubscription(id); } catch { return false; }
    },
    // Names here must match what `api.*` below calls through `window.ryoxApi`.
    getFreeSources: async () => {
      try { return JSON.parse(bridge.getSources()); } catch { return []; }
    },
    fetchAllFreeSources: async () => {
      try {
        const res = JSON.parse(bridge.fetchAllSources());
        const servers = res && Array.isArray(res.servers) ? res.servers : [];
        const totalRaw = res && typeof res.totalRaw === 'number'
          ? res.totalRaw
          : (res && typeof res.successCount === 'number' ? res.successCount : servers.length);
        return { servers, totalRaw };
      } catch { return { servers: [], totalRaw: 0 }; }
    },
    toggleFreeSource: async (id: string, enabled: boolean) => {
      try { return Boolean(bridge.toggleSource(id, enabled)); } catch { return false; }
    },
    getCores: async () => {
      try { return JSON.parse(bridge.getCoresMetadata()); } catch { return []; }
    },
    // Android ships as an APK signed by the same key; there is no in-app updater,
    // so report that honestly instead of throwing.
    checkForAppUpdates: async () => ({
      version: '1.1.0',
      hasUpdate: false,
      changelog: 'In-app updates are not available on the Android build. Install a newer RYOX VPN APK to update.'
    }),
    getSettings: async () => {
      try { return JSON.parse(bridge.getSettings()); } catch { return null; }
    },
    saveSettings: async (settings: any) => {
      try { return bridge.saveSettings(JSON.stringify(settings)); } catch { return false; }
    },
    runDiagnostics: async (host?: string) => {
      try { return JSON.parse(bridge.runDiagnostics(host || '')); } catch { return null; }
    },
    generateWarp: async (cleanIp?: string) => {
      try { return JSON.parse(bridge.generateWarp(cleanIp || '')); } catch { return null; }
    },
    scanCleanIps: async () => {
      try { return JSON.parse(bridge.scanCleanIps()); } catch { return []; }
    },
    testDownloadSpeed: async () => {
      try { return JSON.parse(bridge.testDownloadSpeed()); } catch { return null; }
    },
    exportServers: async () => {
      try { return bridge.exportServers(); } catch { return ''; }
    },
    smartConnect: async () => {
      try {
        const res = bridge.smartConnect();
        return res ? JSON.parse(res) : null;
      } catch { return null; }
    },
    fetchAutoSub: async () => {
      try { return JSON.parse(bridge.fetchAutoSub()); } catch { return []; }
    },
    enableKillSwitch: async () => {
      try { return Boolean(bridge.enableKillSwitch()); } catch { return false; }
    },
    disableKillSwitch: async () => {
      try { return Boolean(bridge.disableKillSwitch()); } catch { return false; }
    },
    onStateChanged: (cb: any) => {
      window._onAndroidStateChanged = cb;
      return () => { window._onAndroidStateChanged = undefined; };
    },
    onStatsUpdated: (cb: any) => {
      window._onAndroidStatsUpdated = cb;
      return () => { window._onAndroidStatsUpdated = undefined; };
    },
    onLog: (cb: any) => {
      window._onAndroidLog = cb;
      return () => { window._onAndroidLog = undefined; };
    },
    minimizeWindow: () => {},
    maximizeWindow: () => {},
    closeWindow: () => {}
  };
}

// In-memory fallback for web preview or mock testing
const mockSettings: AppSettings = {
  tunnelMode: 'TUN',
  routingMode: 'Rule',
  autoConnectOnLaunch: false,
  startMinimized: false,
  killSwitch: true,
  dnsServers: ['1.1.1.1', '8.8.8.8'],
  customDnsEnabled: true,
  dnsOverHttps: true,
  dohUrl: 'https://1.1.1.1/dns-query',
  activeCore: 'sing-box',
  inboundHttpPort: 10809,
  inboundSocksPort: 10808,
  allowLan: false,
  bypassChinaAndIranLan: true,
  bypassPrivateIps: true,
  theme: 'cyberpunk',
  accentColor: '#00e5ff',
  language: 'fa',
  enableTlsFragment: false,
  fragmentLength: '100-200',
  fragmentInterval: '10-20'
};

let mockServers: VpnServerConfig[] = [
  {
    id: 'ryox-starter-reality-1',
    name: '🇺🇸 US - High-Speed Reality Edge #1',
    server: 'us1.edge.ryoxvpn.org',
    port: 443,
    protocol: 'vless',
    core: 'sing-box',
    uuid: 'd3b07384-d113-494a-a0e2-e1c5188f58b0',
    network: 'tcp',
    tls: 'reality',
    sni: 'www.microsoft.com',
    publicKey: '6j_S1-n8vU3gR13k5lq0bFqA0C9Z6-Z1yA0pP1k7l_8',
    shortId: '6ba85580',
    fingerprint: 'chrome',
    flow: 'xtls-rprx-vision',
    isFavorite: true,
    countryCode: 'US',
    countryName: 'United States',
    latency: 38,
    createdAt: Date.now(),
    updatedAt: Date.now()
  },
  {
    id: 'ryox-starter-hy2-2',
    name: '🇩🇪 DE - Extreme Low-Latency Hy2',
    server: 'de1.node.ryoxvpn.org',
    port: 8443,
    protocol: 'hysteria2',
    core: 'sing-box',
    password: 'ryox-open-community-token',
    sni: 'apple.com',
    tls: 'tls',
    isFavorite: true,
    countryCode: 'DE',
    countryName: 'Germany',
    latency: 44,
    createdAt: Date.now(),
    updatedAt: Date.now()
  },
  {
    id: 'ryox-starter-wg-3',
    name: '🇳🇱 NL - Secure Warp WireGuard',
    server: '162.159.192.1',
    port: 2408,
    protocol: 'wireguard',
    core: 'sing-box',
    privateKey: '2Gk...sample...Key=',
    peerPublicKey: 'bmXOC+F1FxEMF9dyiK2H5/1SUtzH0JuVo51h2wMbgyo=',
    address: ['172.16.0.2/32'],
    countryCode: 'NL',
    countryName: 'Netherlands',
    latency: 51,
    createdAt: Date.now(),
    updatedAt: Date.now()
  },
  {
    id: 'ryox-starter-trojan-4',
    name: '🇯🇵 JP - Tokyo Fiber Trojan-TLS',
    server: 'jp1.node.ryoxvpn.org',
    port: 443,
    protocol: 'trojan',
    core: 'xray',
    password: 'ryox-tokyo-pass',
    sni: 'yahoo.co.jp',
    tls: 'tls',
    countryCode: 'JP',
    countryName: 'Japan',
    latency: 86,
    createdAt: Date.now(),
    updatedAt: Date.now()
  }
];

let mockState: ConnectionState = 'DISCONNECTED';
let mockActiveServer: VpnServerConfig | undefined = undefined;
let mockTimer: any = null;
let mockStats: LiveStats = {
  connectionState: 'DISCONNECTED',
  activeCore: 'sing-box',
  uploadSpeed: 0,
  downloadSpeed: 0,
  totalUpload: 0,
  totalDownload: 0,
  sessionDuration: 0,
  pingMs: 0
};

const listeners = {
  state: [] as ((s: ConnectionState) => void)[],
  stats: [] as ((s: LiveStats) => void)[],
  log: [] as ((level: string, msg: string) => void)[]
};

export const api = {
  isElectron: () => typeof window !== 'undefined' && !!window.ryoxApi,

  async connect(server: VpnServerConfig): Promise<boolean> {
    if (window.ryoxApi) return window.ryoxApi.connect(server);
    mockState = 'CONNECTING';
    mockActiveServer = server;
    listeners.state.forEach(cb => cb('CONNECTING'));
    listeners.log.forEach(cb => cb('INFO', `Connecting to ${server.name} via ${server.protocol.toUpperCase()}...`));

    setTimeout(() => {
      mockState = 'VERIFYING';
      listeners.state.forEach(cb => cb('VERIFYING'));
      listeners.log.forEach(cb => cb('INFO', 'Verifying cryptographic tunnel handshake...'));

      setTimeout(() => {
        mockState = 'CONNECTED';
        listeners.state.forEach(cb => cb('CONNECTED'));
        listeners.log.forEach(cb => cb('INFO', `Connected to ${server.name}. All traffic secured.`));

        const start = Date.now();
        mockTimer = setInterval(() => {
          if (mockState !== 'CONNECTED') return;
          const dl = Math.floor(Math.random() * 850000) + 150000;
          const ul = Math.floor(Math.random() * 150000) + 20000;
          mockStats = {
            connectionState: 'CONNECTED',
            activeServer: mockActiveServer,
            activeCore: 'sing-box',
            uploadSpeed: ul,
            downloadSpeed: dl,
            totalUpload: mockStats.totalUpload + ul,
            totalDownload: mockStats.totalDownload + dl,
            sessionDuration: Math.floor((Date.now() - start) / 1000),
            pingMs: Math.floor(Math.random() * 20) + 35,
            // Demo mode only: the WARP tunnel address pool, never a real public IP.
            clientIp: '172.16.0.2',
            clientCountry: server.countryName || 'United States',
            // Simulated so the demo exercises the same three dashboard rows.
            healthScore: 78 + Math.floor(Math.random() * 18),
            telemetrySource: 'process-counters' as const,
            autoSwitchCount: 0
          };
          listeners.stats.forEach(cb => cb({ ...mockStats }));
        }, 1000);
      }, 600);
    }, 700);
    return true;
  },

  async disconnect(): Promise<void> {
    if (window.ryoxApi) return window.ryoxApi.disconnect();
    if (mockTimer) clearInterval(mockTimer);
    mockState = 'DISCONNECTED';
    mockActiveServer = undefined;
    mockStats = {
      ...mockStats,
      connectionState: 'DISCONNECTED',
      uploadSpeed: 0,
      downloadSpeed: 0
    };
    listeners.state.forEach(cb => cb('DISCONNECTED'));
    listeners.stats.forEach(cb => cb({ ...mockStats }));
    listeners.log.forEach(cb => cb('INFO', 'VPN Disconnected. Restored standard routing.'));
  },

  async getState(): Promise<ConnectionState> {
    if (window.ryoxApi) return window.ryoxApi.getState();
    return mockState;
  },

  async getStats(): Promise<LiveStats> {
    if (window.ryoxApi) return window.ryoxApi.getStats();
    return mockStats;
  },

  onStateChanged(callback: (state: ConnectionState) => void) {
    if (window.ryoxApi) return window.ryoxApi.onStateChanged(callback);
    listeners.state.push(callback);
    return () => {
      listeners.state = listeners.state.filter(c => c !== callback);
    };
  },

  onStatsUpdated(callback: (stats: LiveStats) => void) {
    if (window.ryoxApi) return window.ryoxApi.onStatsUpdated(callback);
    listeners.stats.push(callback);
    return () => {
      listeners.stats = listeners.stats.filter(c => c !== callback);
    };
  },

  onLog(callback: (level: string, message: string) => void) {
    if (window.ryoxApi) return window.ryoxApi.onLog(callback);
    listeners.log.push(callback);
    return () => {
      listeners.log = listeners.log.filter(c => c !== callback);
    };
  },

  async getServers(): Promise<VpnServerConfig[]> {
    if (window.ryoxApi) return window.ryoxApi.getServers();
    return [...mockServers];
  },

  async saveServer(server: VpnServerConfig): Promise<VpnServerConfig[]> {
    if (window.ryoxApi) return window.ryoxApi.saveServer(server);
    const idx = mockServers.findIndex(s => s.id === server.id);
    if (idx !== -1) mockServers[idx] = server;
    else mockServers.push(server);
    return [...mockServers];
  },

  async removeServer(id: string): Promise<VpnServerConfig[]> {
    if (window.ryoxApi) return window.ryoxApi.removeServer(id);
    mockServers = mockServers.filter(s => s.id !== id);
    return [...mockServers];
  },

  async pingServer(server: VpnServerConfig): Promise<number> {
    if (window.ryoxApi) return window.ryoxApi.pingServer(server);
    return Math.floor(Math.random() * 45) + 30;
  },

  async parseUri(uri: string): Promise<VpnServerConfig | null> {
    if (window.ryoxApi) return window.ryoxApi.parseUri(uri);
    // Simple inline parser fallback
    return null;
  },

  async getSubscriptions(): Promise<Subscription[]> {
    if (window.ryoxApi) return window.ryoxApi.getSubscriptions();
    return [
      {
        id: 'sub-1',
        name: 'Official Community Reality Feed',
        url: 'https://raw.githubusercontent.com/barry-far/V2ray-Configs/main/Sub1.txt',
        enabled: true,
        updateIntervalHours: 12,
        serverCount: mockServers.length
      }
    ];
  },

  async addSubscription(name: string, url: string, interval: number): Promise<Subscription> {
    if (window.ryoxApi) return window.ryoxApi.addSubscription(name, url, interval);
    return {
      id: `sub-${Date.now()}`,
      name,
      url,
      enabled: true,
      updateIntervalHours: interval,
      serverCount: 0
    };
  },

  async updateSubscription(id: string): Promise<VpnServerConfig[]> {
    if (window.ryoxApi) return window.ryoxApi.updateSubscription(id);
    return mockServers;
  },

  async removeSubscription(id: string): Promise<boolean> {
    if (window.ryoxApi) return window.ryoxApi.removeSubscription(id);
    return true;
  },

  async getFreeSources(): Promise<FreeConfigSource[]> {
    if (window.ryoxApi) return window.ryoxApi.getFreeSources();
    return [
      {
        id: 'src-1',
        name: 'GitHub Community VLESS & Reality Feed',
        url: 'https://raw.githubusercontent.com/barry-far/V2ray-Configs/main/Sub1.txt',
        maintainer: 'Barry-Far (Open-Source VPN Community)',
        protocols: ['vless', 'vmess', 'trojan'],
        enabled: true,
        description: 'Auto-updated aggregated public VLESS Reality and VMess endpoints',
        trustLevel: 'Community'
      },
      {
        id: 'src-2',
        name: 'sing-box & Hysteria 2 Global Feed',
        url: 'https://raw.githubusercontent.com/yebekhe/TVC/main/subscriptions/xray/normal/vless',
        maintainer: 'TVC Open Community Project',
        protocols: ['vless', 'hysteria2', 'tuic'],
        enabled: true,
        description: 'Curated fast nodes tested for high-censorship environments',
        trustLevel: 'Verified'
      },
      {
        id: 'src-3',
        name: 'Mihomo / Clash Meta Public Aggregator',
        url: 'https://raw.githubusercontent.com/freefq/free/master/v2',
        maintainer: 'FreeFQ Project',
        protocols: ['vmess', 'shadowsocks', 'trojan'],
        enabled: true,
        description: 'Free public proxies collected from community verified sources',
        trustLevel: 'Community'
      },
      {
        id: 'src-4',
        name: 'Public WireGuard & Warp Endpoints',
        url: 'https://raw.githubusercontent.com/ircfspace/warpplus/main/warp.json',
        maintainer: 'IRCF Community',
        protocols: ['wireguard'],
        enabled: true,
        description: 'Authorized public WireGuard / Cloudflare WARP connection endpoints',
        trustLevel: 'Verified'
      }
    ];
  },

  async fetchAllFreeSources(): Promise<{ servers: VpnServerConfig[]; totalRaw: number }> {
    if (window.ryoxApi) return window.ryoxApi.fetchAllFreeSources();
    return { servers: mockServers, totalRaw: mockServers.length };
  },

  async toggleFreeSource(id: string, enabled: boolean): Promise<boolean> {
    if (window.ryoxApi) return window.ryoxApi.toggleFreeSource(id, enabled);
    return true;
  },

  async getCores(): Promise<CoreMetadata[]> {
    if (window.ryoxApi) return window.ryoxApi.getCores();
    return [
      {
        id: 'sing-box',
        name: 'sing-box Core',
        version: '1.11.0',
        installed: true,
        status: 'Ready',
        license: 'GPL-3.0',
        licenseUrl: 'https://github.com/SagerNet/sing-box/blob/dev/LICENSE',
        upstreamUrl: 'https://github.com/SagerNet/sing-box/releases',
        description: 'Universal proxy platform with native high-performance TUN and multi-protocol routing',
        category: 'Proxy Core'
      },
      {
        id: 'xray',
        name: 'Xray Core (Project X)',
        version: '24.11.30',
        installed: true,
        status: 'Ready',
        license: 'MPL-2.0',
        licenseUrl: 'https://github.com/XTLS/Xray-core/blob/main/LICENSE',
        upstreamUrl: 'https://github.com/XTLS/Xray-core/releases',
        description: 'Pioneering proxy engine with native VLESS Reality, XTLS Vision, and advanced anti-censorship',
        category: 'Proxy Core'
      },
      {
        id: 'mihomo',
        name: 'Mihomo (Clash Meta)',
        version: '1.19.0',
        installed: true,
        status: 'Ready',
        license: 'GPL-3.0',
        licenseUrl: 'https://github.com/MetaCubeX/mihomo/blob/Alpha/LICENSE',
        upstreamUrl: 'https://github.com/MetaCubeX/mihomo/releases',
        description: 'A rule-based tunnel in Go with full rule sets, providers, and outbound groups',
        category: 'Proxy Core'
      },
      {
        id: 'hysteria2',
        name: 'Hysteria 2 Standalone',
        version: '2.5.2',
        installed: true,
        status: 'Ready',
        license: 'MIT',
        licenseUrl: 'https://github.com/apernet/hysteria/blob/master/LICENSE.md',
        upstreamUrl: 'https://github.com/apernet/hysteria/releases',
        description: 'Extreme speed UDP protocol designed for lossy and harsh network conditions',
        category: 'Protocol Transport'
      },
      {
        id: 'wireguard',
        name: 'WireGuard Engine',
        version: '0.5.3',
        installed: true,
        status: 'Ready',
        license: 'GPL-2.0',
        licenseUrl: 'https://git.zx2c4.com/wireguard-tools/about/COPYING',
        upstreamUrl: 'https://www.wireguard.com/',
        description: 'Fast, modern, secure kernel-level & user-space VPN protocol with state-of-the-art cryptography',
        category: 'VPN Engine'
      }
    ];
  },

  async getSettings(): Promise<AppSettings> {
    if (window.ryoxApi) return window.ryoxApi.getSettings();
    return mockSettings;
  },

  async saveSettings(settings: AppSettings): Promise<boolean> {
    if (window.ryoxApi) return window.ryoxApi.saveSettings(settings);
    Object.assign(mockSettings, settings);
    return true;
  },

  async runDiagnostics(host?: string): Promise<DiagnosticsResult> {
    if (window.ryoxApi) return window.ryoxApi.runDiagnostics(host);
    // Browser mock: this build has no TUN adapter and no probing engine, so the
    // result must not claim verified measurements (-1 / null = not measured).
    return {
      dnsLeakDetected: null,
      pingLatency: -1,
      tcpHandshakeMs: -1,
      tunAdapterStatus: 'Inactive',
      timestamp: Date.now()
    };
  },

  async checkForAppUpdates() {
    if (window.ryoxApi) return window.ryoxApi.checkForAppUpdates();
    return {
      version: '1.1.0',
      releaseDate: new Date().toISOString(),
      changelog: 'You are on the latest official build of RYOX VPN v1.1.0.',
      hasUpdate: false
    };
  },

  async generateWarp(cleanIp?: string): Promise<VpnServerConfig> {
    if (window.ryoxApi) return window.ryoxApi.generateWarp(cleanIp);
    const mockWarp: VpnServerConfig = {
      id: `mock-warp-${Date.now()}`,
      name: `⚡ Cloudflare WARP (${cleanIp || '162.159.192.1'})`,
      server: cleanIp || '162.159.192.1',
      port: 2408,
      protocol: 'wireguard',
      core: 'sing-box',
      privateKey: '2Gk...mock...Key=',
      peerPublicKey: 'bmXOC+F1FxEMF9dyiK2H5/1SUtzH0JuVo51h2wMbgyo=',
      address: ['172.16.0.2/32'],
      latency: 32,
      countryCode: 'CF',
      countryName: 'Cloudflare Edge',
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    mockServers.unshift(mockWarp);
    return mockWarp;
  },

  async scanCleanIps(): Promise<any[]> {
    if (window.ryoxApi) return window.ryoxApi.scanCleanIps();
    return [
      { ip: '162.159.192.1', latencyMs: 29, status: 'FAST' },
      { ip: '162.159.193.1', latencyMs: 34, status: 'FAST' },
      { ip: '188.114.96.1', latencyMs: 41, status: 'FAST' },
      { ip: '188.114.97.1', latencyMs: 45, status: 'FAST' },
      { ip: '104.16.132.229', latencyMs: 82, status: 'MEDIUM' }
    ];
  },

  async testDownloadSpeed(): Promise<any> {
    if (window.ryoxApi) return window.ryoxApi.testDownloadSpeed();
    return {
      downloadMbps: 28.4,
      downloadMBps: 3.55,
      durationMs: 380,
      bytesReceived: 500000
    };
  },

  async exportServers(): Promise<string> {
    if (window.ryoxApi) return window.ryoxApi.exportServers();
    return Buffer.from(mockServers.map(s => s.rawUri || `${s.protocol}://${s.server}:${s.port}`).join('\n')).toString('base64');
  },

  minimize: () => window.ryoxApi?.minimizeWindow(),
  maximize: () => window.ryoxApi?.maximizeWindow(),
  close: () => window.ryoxApi?.closeWindow(),

  async smartConnect(): Promise<VpnServerConfig | null> {
    if (window.ryoxApi) return window.ryoxApi.smartConnect();
    return null;
  },
  async fetchAutoSub(): Promise<VpnServerConfig[]> {
    if (window.ryoxApi) return window.ryoxApi.fetchAutoSub();
    return [];
  },
  async enableKillSwitch(): Promise<boolean> {
    if (window.ryoxApi) return Boolean(await window.ryoxApi.enableKillSwitch());
    return false;
  },
  async disableKillSwitch(): Promise<boolean> {
    if (window.ryoxApi) return Boolean(await window.ryoxApi.disableKillSwitch());
    return false;
  },
};
