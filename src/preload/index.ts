import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
import { 
  VpnServerConfig, 
  AppSettings, 
  ConnectionState, 
  LiveStats, 
  Subscription, 
  FreeConfigSource, 
  CoreMetadata,
  DiagnosticsResult 
} from '../shared/types';

export const electronApi = {
  // VPN control
  connect: (server: VpnServerConfig) => ipcRenderer.invoke('vpn:connect', server),
  disconnect: () => ipcRenderer.invoke('vpn:disconnect'),
  getState: (): Promise<ConnectionState> => ipcRenderer.invoke('vpn:get-state'),
  getStats: (): Promise<LiveStats> => ipcRenderer.invoke('vpn:get-stats'),

  // Event listeners
  onStateChanged: (callback: (state: ConnectionState) => void) => {
    const handler = (_event: any, state: ConnectionState) => callback(state);
    ipcRenderer.on('vpn:state-changed', handler);
    return () => ipcRenderer.removeListener('vpn:state-changed', handler);
  },
  onStatsUpdated: (callback: (stats: LiveStats) => void) => {
    const handler = (_event: any, stats: LiveStats) => callback(stats);
    ipcRenderer.on('vpn:stats-updated', handler);
    return () => ipcRenderer.removeListener('vpn:stats-updated', handler);
  },
  onLog: (callback: (level: string, message: string) => void) => {
    const handler = (_event: any, level: string, msg: string) => callback(level, msg);
    ipcRenderer.on('vpn:log', handler);
    return () => ipcRenderer.removeListener('vpn:log', handler);
  },

  // Server management
  getServers: (): Promise<VpnServerConfig[]> => ipcRenderer.invoke('servers:get'),
  saveServer: (server: VpnServerConfig) => ipcRenderer.invoke('servers:save', server),
  removeServer: (id: string) => ipcRenderer.invoke('servers:remove', id),
  pingServer: (server: VpnServerConfig): Promise<number> => ipcRenderer.invoke('servers:ping', server),
  parseUri: (uri: string): Promise<VpnServerConfig | null> => ipcRenderer.invoke('servers:parse-uri', uri),

  // Subscription management
  getSubscriptions: (): Promise<Subscription[]> => ipcRenderer.invoke('subscriptions:get'),
  addSubscription: (name: string, url: string, interval: number): Promise<Subscription> => 
    ipcRenderer.invoke('subscriptions:add', name, url, interval),
  updateSubscription: (id: string): Promise<VpnServerConfig[]> => ipcRenderer.invoke('subscriptions:update', id),
  removeSubscription: (id: string) => ipcRenderer.invoke('subscriptions:remove', id),

  // Free Sources Discovery
  getFreeSources: (): Promise<FreeConfigSource[]> => ipcRenderer.invoke('sources:get'),
  fetchAllFreeSources: (): Promise<{ servers: VpnServerConfig[]; totalRaw: number }> => 
    ipcRenderer.invoke('sources:fetch-all'),
  toggleFreeSource: (id: string, enabled: boolean) => ipcRenderer.invoke('sources:toggle', id, enabled),

  // Cores
  getCores: (): Promise<CoreMetadata[]> => ipcRenderer.invoke('cores:get'),
  updateCore: (coreId: string) => ipcRenderer.invoke('cores:update', coreId),

  // Settings
  getSettings: (): Promise<AppSettings> => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings: AppSettings) => ipcRenderer.invoke('settings:save', settings),

  // Diagnostics & Updates
  runDiagnostics: (serverHost?: string): Promise<DiagnosticsResult> => 
    ipcRenderer.invoke('diagnostics:run', serverHost),
  checkForAppUpdates: () => ipcRenderer.invoke('updates:check-app'),
  generateWarp: (cleanIp?: string): Promise<VpnServerConfig> => ipcRenderer.invoke('warp:generate', cleanIp),
  scanCleanIps: (): Promise<any[]> => ipcRenderer.invoke('scanner:clean-ips'),
  testDownloadSpeed: (): Promise<any> => ipcRenderer.invoke('speedtest:run'),
  exportServers: (): Promise<string> => ipcRenderer.invoke('servers:export'),

  // Window Controls
  minimizeWindow: () => ipcRenderer.send('window:minimize'),
  maximizeWindow: () => ipcRenderer.send('window:maximize'),
  closeWindow: () => ipcRenderer.send('window:close'),

  // Smart Connect
  smartConnect: (): Promise<VpnServerConfig | null> => ipcRenderer.invoke('smart-connect'),

  // Auto Subscribe
  startAutoSubscribe: (intervalHours: number): Promise<boolean> =>
    ipcRenderer.invoke('autosub:start', intervalHours),
  fetchAutoSubscribe: (): Promise<VpnServerConfig[]> => ipcRenderer.invoke('autosub:fetch'),
  onAutoSubNewServers: (callback: (count: number) => void) => {
    const handler = (_event: IpcRendererEvent, count: number) => callback(count);
    ipcRenderer.on('autosub:new-servers', handler);
    return () => ipcRenderer.removeListener('autosub:new-servers', handler);
  },

  // Kill Switch
  enableKillSwitch: (): Promise<boolean> => ipcRenderer.invoke('killswitch:enable'),
  disableKillSwitch: (): Promise<boolean> => ipcRenderer.invoke('killswitch:disable'),
};

contextBridge.exposeInMainWorld('ryoxApi', electronApi);
