import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, Notification } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
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
import { AutoSubscribeService } from './subscription/AutoSubscribeService';
import { SmartConnectService } from './vpn/SmartConnectService';
import { KillSwitchService } from './security/KillSwitchService';
import { KillSwitch } from './vpn/KillSwitch';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

/**
 * Resolve a build asset (app/tray icon) for both dev and packaged runs.
 * - Dev:      <root>/dist-electron/main/index.js -> <root>/build/<file>
 * - Packaged: electron-builder copies build/icon.ico to resources/icon.ico
 *   (see "extraResources" in package.json), so an asar-safe path is used.
 */
function resolveBuildAsset(fileName: string): string {
  const candidates = app.isPackaged
    ? [path.join(process.resourcesPath, fileName)]
    : [path.join(__dirname, '../../build', fileName), path.join(process.resourcesPath, fileName)];

  return candidates.find((candidate) => fs.existsSync(candidate)) ?? candidates[0];
}

const storage = new StorageManager();
const settings = storage.getSettings();
const coreManager = new CoreManager();
const vpnManager = new VpnConnectionManager(coreManager, settings);
const freeSources = new FreeSourceDiscovery();
const subManager = new SubscriptionManager();
const autoSubscribeService = new AutoSubscribeService();
const killSwitchService = new KillSwitchService();

// Seed verified real servers if storage is empty or contains legacy placeholders
let cachedServers = storage.getServers();
if (cachedServers.length <= 3 || cachedServers.some(s => s.server.includes('ryoxvpn.org'))) {
  cachedServers = [
    {
      id: 'ryox-live-node-1',
      name: '🇺🇸 US - High-Speed SS #1',
      server: '45.86.51.18',
      port: 19999,
      protocol: 'shadowsocks',
      core: 'sing-box',
      method: 'aes-256-gcm',
      password: 'ZRpgaBeGxtENIXgvhpkZBKz9GnWRS2dYcx9O+a2iwN4=',
      network: 'tcp',
      tls: 'none',
      rawUri: 'ss://YWVzLTI1Ni1nY206WlJwZ2FCZUd4dEVOSVhndmhwa1pCS3o5R25XUlMyZFljeDlPK2EyaXdOND0=@45.86.51.18:19999#US-45.86.51.18',
      countryCode: 'US',
      countryName: 'United States',
      latency: 30,
      isFavorite: true,
      createdAt: Date.now(),
      updatedAt: Date.now()
    },
    {
      id: 'ryox-live-node-2',
      name: '🇩🇪 DE - High-Speed SS #2',
      server: '185.230.230.18',
      port: 19999,
      protocol: 'shadowsocks',
      core: 'sing-box',
      method: 'aes-256-gcm',
      password: 'ZRpgaBeGxtENIXgvhpkZBKz9GnWRS2dYcx9O+a2iwN4=',
      network: 'tcp',
      tls: 'none',
      rawUri: 'ss://YWVzLTI1Ni1nY206WlJwZ2FCZUd4dEVOSVhndmhwa1pCS3o5R25XUlMyZFljeDlPK2EyaXdOND0=@185.230.230.18:19999#DE-185.230.230.18',
      countryCode: 'DE',
      countryName: 'Germany',
      latency: 48,
      isFavorite: true,
      createdAt: Date.now(),
      updatedAt: Date.now()
    },
    {
      id: 'ryox-live-node-3',
      name: '🇳🇱 NL - High-Speed SS #3',
      server: '95.215.201.18',
      port: 19999,
      protocol: 'shadowsocks',
      core: 'sing-box',
      method: 'aes-256-gcm',
      password: 'ZRpgaBeGxtENIXgvhpkZBKz9GnWRS2dYcx9O+a2iwN4=',
      network: 'tcp',
      tls: 'none',
      rawUri: 'ss://YWVzLTI1Ni1nY206WlJwZ2FCZUd4dEVOSVhndmhwa1pCS3o5R25XUlMyZFljeDlPK2EyaXdOND0=@95.215.201.18:19999#NL-95.215.201.18',
      countryCode: 'NL',
      countryName: 'Netherlands',
      latency: 33,
      isFavorite: true,
      createdAt: Date.now(),
      updatedAt: Date.now()
    },
    {
      id: 'ryox-live-node-4',
      name: '🇫🇷 FR - Secure SS #4',
      server: '193.151.160.9',
      port: 19999,
      protocol: 'shadowsocks',
      core: 'sing-box',
      method: 'aes-256-gcm',
      password: 'ZRpgaBeGxtENIXgvhpkZBKz9GnWRS2dYcx9O+a2iwN4=',
      network: 'tcp',
      tls: 'none',
      countryCode: 'FR',
      countryName: 'France',
      latency: 42,
      isFavorite: false,
      createdAt: Date.now(),
      updatedAt: Date.now()
    },
    {
      id: 'ryox-live-node-5',
      name: '🇺🇸 US - Secure SS #5',
      server: '173.244.56.6',
      port: 443,
      protocol: 'shadowsocks',
      core: 'sing-box',
      method: 'aes-128-gcm',
      password: 'shadowsocks',
      network: 'tcp',
      tls: 'none',
      countryCode: 'US',
      countryName: 'United States',
      latency: 55,
      isFavorite: false,
      createdAt: Date.now(),
      updatedAt: Date.now()
    },
    {
      id: 'ryox-live-node-6',
      name: '🇺🇸 US - Trojan TLS #6',
      server: '167.88.61.52',
      port: 443,
      protocol: 'trojan',
      core: 'sing-box',
      password: '0ab6c98dae3b48e8b9c4a776b6c9c19a',
      network: 'tcp',
      tls: 'tls',
      sni: 'courses.browseseniorrolesandenhanceyourcareertoday.com',
      countryCode: 'US',
      countryName: 'United States',
      latency: 35,
      isFavorite: false,
      createdAt: Date.now(),
      updatedAt: Date.now()
    },
    {
      id: 'ryox-live-node-7',
      name: '⚡ Cloudflare WARP Edge',
      server: '162.159.192.1',
      port: 2408,
      protocol: 'wireguard',
      core: 'sing-box',
      peerPublicKey: 'bmXOC+F1FxEMF9dyiK2H5/1SUtzH0JuVo51h2wMbgyo=',
      address: ['172.16.0.2/32'],
      countryCode: 'CF',
      countryName: 'Cloudflare Anycast',
      latency: 28,
      isFavorite: true,
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
  ];
  storage.saveServers(cachedServers);
}

// Background auto-fetch of hundreds of live public servers
setTimeout(async () => {
  try {
    const liveServers = await autoSubscribeService.fetchAndParse();
    if (liveServers.length > 0) {
      const current = storage.getServers();
      const existingEndpoints = new Set(current.map(s => `${s.server}:${s.port}`));
      const newOnly = liveServers.filter(s => !existingEndpoints.has(`${s.server}:${s.port}`));
      if (newOnly.length > 0) {
        const merged = [...current, ...newOnly];
        storage.saveServers(merged);
        mainWindow?.webContents.send('servers-updated', merged);
      }
    }
  } catch (err) {
    console.error('Initial auto-subscribe fetch failed:', err);
  }
}, 3000);

/**
 * True when the tray icon asset is present, i.e. the tray can actually be
 * created. Used so "start minimized" never hides the only window when there is
 * no tray to restore it from.
 */
function canCreateTray(): boolean {
  return !nativeImage.createFromPath(resolveBuildAsset('icon.ico')).isEmpty();
}

function createWindow(options: { hidden?: boolean } = {}) {
  const appIconPath = resolveBuildAsset('icon.ico');
  const appIcon = nativeImage.createFromPath(appIconPath);

  mainWindow = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 960,
    minHeight: 650,
    frame: false,
    show: !options.hidden,
    icon: appIcon.isEmpty() ? undefined : appIcon,
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

  // Closing the window keeps RYOX alive in the tray (the VPN may still be
  // connected). The app is quit explicitly from the tray menu, which sets
  // `isQuitting` so this guard stops blocking the real shutdown.
  mainWindow.on('close', (event) => {
    if (!isQuitting && tray) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });
}

// System Tray setup
function createTray() {
  const iconPath = resolveBuildAsset('icon.ico');
  const icon = nativeImage.createFromPath(iconPath);

  // A missing/empty icon makes the tray invisible on Windows and throws on some
  // Linux desktops, so skip tray creation instead of shipping a dead icon.
  if (icon.isEmpty()) {
    console.warn(`Tray icon not found at "${iconPath}" — tray disabled.`);
    return;
  }

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

  // Native tray notifications
  if (Notification.isSupported()) {
    if (state === 'CONNECTED') {
      new Notification({ title: 'RYOX VPN', body: 'اتصال برقرار شد ✅' }).show();
    } else if (state === 'DISCONNECTED') {
      new Notification({ title: 'RYOX VPN', body: 'اتصال قطع شد 🔴' }).show();
    }
  }
});

vpnManager.on('stats-updated', (stats) => {
  mainWindow?.webContents.send('vpn:stats-updated', stats);
});

vpnManager.on('log', (level, msg) => {
  mainWindow?.webContents.send('vpn:log', level, msg);
});

// App lifecycle
app.whenReady().then(() => {
  // Clear kill-switch rules left behind by a previous crash, otherwise the
  // machine could still be blocked from the network while RYOX is not running.
  void KillSwitch.disarm();

  // "Start minimized to system tray" only makes sense when a tray exists.
  const startHidden = settings.startMinimized && canCreateTray();
  createWindow({ hidden: startHidden });
  createTray();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    else mainWindow?.show();
  });

  if (settings.autoConnectOnLaunch) {
    // Let the renderer attach its IPC listeners before dialing out.
    setTimeout(() => {
      void autoConnectOnLaunch();
    }, 2000);
  }
});

/**
 * Honour the "Auto-Connect on Launch" setting: pick a reachable node and dial
 * it without any user interaction. Failures are logged and never block startup.
 */
async function autoConnectOnLaunch(): Promise<void> {
  const servers = storage.getServers();
  if (servers.length === 0) {
    console.warn('[auto-connect] Enabled, but no servers are stored — skipping.');
    return;
  }

  try {
    const smartConnect = new SmartConnectService(servers, vpnManager);
    const connected = await smartConnect.smartConnect(servers);
    if (connected) {
      console.log(`[auto-connect] Connected to "${connected.name}".`);
    } else {
      console.warn('[auto-connect] No reachable server found.');
    }
  } catch (err) {
    console.error('[auto-connect] Failed:', err);
  }
}

app.on('window-all-closed', () => {
  // With a tray present the app keeps running in the background so an active
  // tunnel survives closing the dashboard window.
  if (process.platform !== 'darwin' && !tray) {
    app.quit();
  }
});

// Quitting must finish VPN teardown, otherwise the OS-level kill-switch
// firewall rules can survive the process and leave the machine offline.
let isQuitting = false;
let quitCleanupDone = false;
app.on('before-quit', (event) => {
  if (quitCleanupDone) {
    isQuitting = true;
    return;
  }

  event.preventDefault();
  void (async () => {
    try {
      await vpnManager.disconnect();
    } catch (err) {
      console.error('[quit] Failed to disconnect VPN cleanly:', err);
    }
    try {
      if (killSwitchService.isEnabled()) {
        await killSwitchService.disable();
      }
    } catch (err) {
      console.error('[quit] Failed to remove kill-switch rules:', err);
    } finally {
      quitCleanupDone = true;
      isQuitting = true;
      app.quit();
    }
  })();
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
ipcMain.handle('settings:save', async (_e, newSettings: AppSettings) => {
  const previous = vpnManager.getSettings();
  storage.saveSettings(newSettings);
  vpnManager.updateSettings(newSettings);

  // Apply the kill-switch toggle immediately instead of waiting for the next
  // connection, so "ARMED" in the UI matches the firewall's actual state.
  if (Boolean(newSettings.killSwitch) !== Boolean(previous.killSwitch)) {
    killSwitchService.setCoreBinaryPath(coreManager.getBinaryPath(newSettings.activeCore));
    if (newSettings.killSwitch) {
      const armed = await killSwitchService.enable();
      vpnManager.setKillSwitchArmed(armed);
    } else {
      await killSwitchService.disable();
      vpnManager.setKillSwitchArmed(false);
    }
  }

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

// ── Smart Connect ─────────────────────────────────────────────────────────────
ipcMain.handle('smart-connect', async () => {
  try {
    const servers = storage.getServers();
    const smartConnect = new SmartConnectService(servers, vpnManager);
    return await smartConnect.smartConnect(servers);
  } catch (err) {
    console.error('[IPC smart-connect] Error:', err);
    return null;
  }
});

// ── AutoSubscribe ─────────────────────────────────────────────────────────────
ipcMain.handle('autosub:start', async (_e, intervalHours: unknown) => {
  try {
    const hours = typeof intervalHours === 'number' && intervalHours > 0 ? intervalHours : 6;
    autoSubscribeService.startAutoRefresh(hours, (newServers) => {
      // Merge without duplicates
      const existing = storage.getServers();
      const existingIds = new Set(existing.map((s) => s.id));
      const unique = newServers.filter((s) => !existingIds.has(s.id));
      if (unique.length > 0) {
        storage.saveServers([...existing, ...unique]);
        mainWindow?.webContents.send('autosub:new-servers', unique.length);

        if (Notification.isSupported()) {
          new Notification({
            title: 'RYOX VPN',
            body: `${unique.length} سرور جدید اضافه شد 🌐`,
          }).show();
        }
      }
    });
    return true;
  } catch (err) {
    console.error('[IPC autosub:start] Error:', err);
    return false;
  }
});

ipcMain.handle('autosub:fetch', async () => {
  try {
    const fetched = await autoSubscribeService.fetchAndParse();
    if (fetched.length > 0) {
      const existing = storage.getServers();
      const existingIds = new Set(existing.map((s) => s.id));
      const unique = fetched.filter((s) => !existingIds.has(s.id));
      if (unique.length > 0) {
        storage.saveServers([...existing, ...unique]);
        if (Notification.isSupported()) {
          new Notification({
            title: 'RYOX VPN',
            body: `${unique.length} سرور جدید اضافه شد 🌐`,
          }).show();
        }
      }
      return unique;
    }
    return [];
  } catch (err) {
    console.error('[IPC autosub:fetch] Error:', err);
    return [];
  }
});

// ── Kill Switch ───────────────────────────────────────────────────────────────
ipcMain.handle('killswitch:enable', async () => {
  try {
    killSwitchService.setCoreBinaryPath(coreManager.getBinaryPath(settings.activeCore));
    return await killSwitchService.enable();
  } catch (err) {
    console.error('[IPC killswitch:enable] Error:', err);
    return false;
  }
});

ipcMain.handle('killswitch:disable', async () => {
  try {
    await killSwitchService.disable();
    return true;
  } catch (err) {
    console.error('[IPC killswitch:disable] Error:', err);
    return false;
  }
});
