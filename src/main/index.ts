import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage } from 'electron';
import * as path from 'path';
import { StorageManager } from './storage/StorageManager';
import { CoreManager } from './core/CoreManager';
import { VpnConnectionManager } from './vpn/VpnConnectionManager';
import { FreeSourceDiscovery } from './sources/FreeSourceDiscovery';
import { SubscriptionManager } from './subscription/SubscriptionManager';
import { AppUpdater } from './updater/AppUpdater';
import { DiagnosticsService } from './diagnostics/DiagnosticsService';
import { RealSpeedTester } from './diagnostics/RealSpeedTester';
import { WarpService } from './warp/WarpService';
import { CleanIpScanner } from './scanner/CleanIpScanner';
import { ProtocolParser } from './protocol/parser';
import { VpnServerConfig, AppSettings } from '../shared/types';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

const storage = new StorageManager();
const settings = storage.getSettings();
const coreManager = new CoreManager();
const vpnManager = new VpnConnectionManager(coreManager, settings);
const freeSources = new FreeSourceDiscovery();
const subManager = new SubscriptionManager();

// Seed initial servers if storage is empty
let cachedServers = storage.getServers();
if (cachedServers.length === 0) {
  cachedServers = [
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
    }
  ];
  storage.saveServers(cachedServers);
}

function createWindow() {
  const appIconPath = path.join(__dirname, '../../build/icon.ico');
  const appIcon = nativeImage.createFromPath(appIconPath);

  mainWindow = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 960,
    minHeight: 650,
    frame: false,
    icon: appIcon,
    backgroundColor: '#05070d',
    title: 'RYOX VPN',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false
    }
  });

  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// System Tray setup
function createTray() {
  const iconPath = path.join(__dirname, '../../build/icon.ico');
  const icon = nativeImage.createFromPath(iconPath);
  tray = new Tray(icon);
  tray.setToolTip('RYOX VPN — 100% Free Forever');

  const contextMenu = Menu.buildFromTemplate([
    { label: 'RYOX VPN v1.0.0', enabled: false },
    { type: 'separator' },
    {
      label: 'Open Dashboard',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        } else {
          createWindow();
        }
      }
    },
    {
      label: 'Disconnect',
      click: () => vpnManager.disconnect()
    },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() }
  ]);

  tray.setContextMenu(contextMenu);
}

// Forward core and VPN events to renderer
coreManager.setLogCallback((level, msg) => {
  mainWindow?.webContents.send('vpn:log', level, msg);
});

vpnManager.on('state-changed', (state) => {
  mainWindow?.webContents.send('vpn:state-changed', state);
});

vpnManager.on('stats-updated', (stats) => {
  mainWindow?.webContents.send('vpn:stats-updated', stats);
});

vpnManager.on('log', (level, msg) => {
  mainWindow?.webContents.send('vpn:log', level, msg);
});

// App lifecycle
app.whenReady().then(() => {
  createWindow();
  createTray();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', async () => {
  await vpnManager.disconnect();
});

// Window controls
ipcMain.on('window:minimize', () => mainWindow?.minimize());
ipcMain.on('window:maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize();
  else mainWindow?.maximize();
});
ipcMain.on('window:close', () => mainWindow?.close());

// VPN IPC handlers
ipcMain.handle('vpn:connect', async (_e, server: VpnServerConfig) => {
  return await vpnManager.connect(server);
});

ipcMain.handle('vpn:disconnect', async () => {
  await vpnManager.disconnect();
  return true;
});

ipcMain.handle('vpn:get-state', () => vpnManager.getState());
ipcMain.handle('vpn:get-stats', () => vpnManager.getStats());

// Server IPC handlers
ipcMain.handle('servers:get', () => storage.getServers());
ipcMain.handle('servers:save', (_e, server: VpnServerConfig) => {
  const list = storage.getServers();
  const idx = list.findIndex(s => s.id === server.id);
  if (idx !== -1) list[idx] = server;
  else list.push(server);
  storage.saveServers(list);
  return list;
});
ipcMain.handle('servers:remove', (_e, id: string) => {
  const list = storage.getServers().filter(s => s.id !== id);
  storage.saveServers(list);
  return list;
});
ipcMain.handle('servers:ping', async (_e, server: VpnServerConfig) => {
  return await DiagnosticsService.testTcpLatency(server.server, server.port);
});
ipcMain.handle('servers:parse-uri', (_e, uri: string) => {
  return ProtocolParser.parseUri(uri);
});

// Subscriptions
ipcMain.handle('subscriptions:get', () => subManager.getSubscriptions());
ipcMain.handle('subscriptions:add', (_e, name: string, url: string, interval: number) => {
  return subManager.addSubscription(name, url, interval);
});
ipcMain.handle('subscriptions:update', async (_e, id: string) => {
  const servers = await subManager.updateSubscription(id);
  if (servers.length > 0) {
    const existing = storage.getServers();
    const updated = existing.filter(s => s.subscriptionId !== id).concat(servers);
    storage.saveServers(updated);
  }
  return servers;
});
ipcMain.handle('subscriptions:remove', (_e, id: string) => {
  subManager.removeSubscription(id);
  const servers = storage.getServers().filter(s => s.subscriptionId !== id);
  storage.saveServers(servers);
  return true;
});

// Free Sources Discovery
ipcMain.handle('sources:get', () => freeSources.getSources());
ipcMain.handle('sources:fetch-all', async () => {
  const result = await freeSources.fetchAllEnabled();
  if (result.servers.length > 0) {
    const existing = storage.getServers();
    // Merge without duplicates
    const existingIds = new Set(existing.map(s => `${s.server}:${s.port}`));
    const newOnes = result.servers.filter(s => !existingIds.has(`${s.server}:${s.port}`));
    storage.saveServers([...existing, ...newOnes]);
  }
  return result;
});
ipcMain.handle('sources:toggle', (_e, id: string, enabled: boolean) => {
  freeSources.toggleSource(id, enabled);
  return true;
});

// Cores & Settings
ipcMain.handle('cores:get', () => coreManager.getCoresMetadata());
ipcMain.handle('cores:update', async (_e, _coreId: string) => true);
ipcMain.handle('settings:get', () => storage.getSettings());
ipcMain.handle('settings:save', (_e, newSettings: AppSettings) => {
  storage.saveSettings(newSettings);
  vpnManager.updateSettings(newSettings);
  return true;
});

// Diagnostics, Speed Test, WARP & Scanner
ipcMain.handle('diagnostics:run', async (_e, host?: string) => {
  return await DiagnosticsService.runDiagnostics(host);
});
ipcMain.handle('speedtest:run', async () => {
  return await RealSpeedTester.testDownloadSpeed();
});
ipcMain.handle('warp:generate', async (_e, cleanIp?: string) => {
  const profile = await WarpService.generateWarpProfile(cleanIp);
  const current = storage.getServers();
  storage.saveServers([profile, ...current]);
  return profile;
});
ipcMain.handle('scanner:clean-ips', async () => {
  return await CleanIpScanner.scan();
});
ipcMain.handle('servers:export', async () => {
  const list = storage.getServers();
  const uris = list.map(s => s.rawUri || `${s.protocol}://${s.server}:${s.port}#${encodeURIComponent(s.name)}`).join('\n');
  return Buffer.from(uris).toString('base64');
});
ipcMain.handle('updates:check-app', async () => {
  return await AppUpdater.checkForUpdates();
});
