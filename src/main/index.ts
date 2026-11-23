import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, Notification, powerMonitor } from 'electron';
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
import { ProtocolParser, dedupeServers } from './protocol/parser';
import { VpnServerConfig, AppSettings, SupportedCore } from '../shared/types';
import { CoreUpdater } from './updater/CoreUpdater';
import { AutoSubscribeService } from './subscription/AutoSubscribeService';
import { SmartConnectService } from './vpn/SmartConnectService';
import { KillSwitchService } from './security/KillSwitchService';
import { SystemProxyManager } from './vpn/SystemProxyManager';
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

/**
 * Launch-time snapshot ONLY. It is captured before the window exists and is
 * read for values that genuinely must be frozen at startup
 * (`settings.startMinimized`, `settings.autoConnectOnLaunch`) and to seed the
 * VPN manager. Every IPC handler must read `storage.getSettings()` instead:
 * values such as `activeCore`/`killSwitch` change at runtime, and using this
 * snapshot there would, for example, whitelist the wrong core binary in the
 * kill-switch firewall rule after the user switches cores.
 */
const settings = storage.getSettings();
const coreManager = new CoreManager();
const vpnManager = new VpnConnectionManager(coreManager, settings);
const freeSources = new FreeSourceDiscovery();
// Shares the app's StorageManager; its constructor hydrates the persisted
// subscription list (falling back to a starter sample only on first run).
const subManager = new SubscriptionManager(storage);
const autoSubscribeService = new AutoSubscribeService();
const killSwitchService = new KillSwitchService();

/**
 * Structured result of the `cores:update` IPC call. `installed` is only ever
 * true when this process actually downloaded and installed a binary — the
 * handler currently only queries the upstream release, so it stays false and
 * `message` says so instead of pretending an update happened.
 */
export interface CoreUpdateResult {
  coreId: string;
  status: 'up-to-date' | 'update-available' | 'unknown-core' | 'network-error';
  currentVersion?: string;
  latestVersion?: string;
  downloadUrl?: string;
  installed: boolean;
  message: string;
}

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

  // Crash recovery for the system proxy: if the app was killed while the proxy
  // was set, the OS keeps pointing at our loopback port and the user has no
  // internet until the next connect. Idempotent, and it only touches a proxy
  // that is one of our own loopback ports.
  void SystemProxyManager.restoreOnStartup();

  // Waking from sleep can leave a dead tunnel behind while the UI still says
  // CONNECTED. Re-verify the local endpoint and tear the session down honestly
  // when it no longer answers, instead of showing a green badge over nothing.
  powerMonitor.on('resume', () => {
    void vpnManager.handleResume();
  });

  // Intentionally the launch-time snapshot: whether the window opens hidden is
  // decided once, before the user can change any setting.
  // "Start minimized to system tray" only makes sense when a tray exists.
  const startHidden = settings.startMinimized && canCreateTray();
  createWindow({ hidden: startHidden });
  createTray();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    else mainWindow?.show();
  });

  // Also the launch-time snapshot on purpose: auto-connect is a startup
  // decision and must not flip mid-session.
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

// Subscriptions — every mutation is persisted through StorageManager (they
// used to live only in SubscriptionManager's memory and vanished on restart),
// and each handler returns the persisted subscriptions list.
ipcMain.handle('subscriptions:get', () => subManager.getSubscriptions());
ipcMain.handle('subscriptions:add', (_e, name: string, url: string, interval: number) => {
  subManager.addSubscription(name, url, interval);
  const persisted = subManager.getSubscriptions();
  storage.saveSubscriptions(persisted);
  return persisted;
});
ipcMain.handle('subscriptions:update', async (_e, id: string) => {
  const fresh = dedupeServers(await subManager.updateSubscription(id));

  // Replace (not merely append) this subscription's stored nodes with the fresh,
  // deduplicated set. `replaceSubscriptionServers` prunes the old ones first, so a
  // refresh that yields nothing no longer leaves stale endpoints behind.
  subManager.replaceSubscriptionServers(id, fresh);

  const persisted = subManager.getSubscriptions();
  storage.saveSubscriptions(persisted);
  return persisted;
});
ipcMain.handle('subscriptions:remove', (_e, id: string) => {
  // removeSubscription already prunes this subscription's servers internally;
  // the explicit calls below keep the IPC layer's persistence contract obvious.
  subManager.removeSubscription(id);
  subManager.pruneSubscriptionServers(id);

  const persisted = subManager.getSubscriptions();
  storage.saveSubscriptions(persisted);
  return persisted;
});

// Free Sources Discovery
ipcMain.handle('sources:get', () => freeSources.getSources());
ipcMain.handle('sources:fetch-all', async () => {
  const result = await freeSources.fetchAllEnabled();
  if (result.servers.length > 0) {
    const existing = storage.getServers();
    // Merge without duplicates: the host:port filter keeps an endpoint from being
    // re-added, and dedupeServers drops duplicate ids inside the fetched batch.
    const existingIds = new Set(existing.map(s => `${s.server}:${s.port}`));
    const newOnes = result.servers.filter(s => !existingIds.has(`${s.server}:${s.port}`));
    storage.saveServers(dedupeServers([...existing, ...newOnes]));
  }
  return result;
});
ipcMain.handle('sources:toggle', (_e, id: string, enabled: boolean) => {
  freeSources.toggleSource(id, enabled);
  return true;
});

// Cores & Settings
ipcMain.handle('cores:get', () => coreManager.getCoresMetadata());
ipcMain.handle('cores:update', async (_e, coreId: string): Promise<CoreUpdateResult> => {
  const core = coreId as SupportedCore;
  const metadata = coreManager.getCoresMetadata().find(c => c.id === core);
  if (!metadata) {
    return {
      coreId,
      status: 'unknown-core',
      installed: false,
      message: `Unknown core "${coreId}".`
    };
  }

  // Only the upstream release lookup is real. Downloading and installing a
  // binary archive is not implemented in this build, so `installed` stays
  // false and the message never claims an update was applied.
  const release = await CoreUpdater.fetchLatestCoreRelease(core);
  if (!release) {
    return {
      coreId,
      status: 'network-error',
      currentVersion: metadata.version,
      installed: false,
      message: `Could not reach the upstream release for ${metadata.name} (offline, rate-limited, or no matching asset).`
    };
  }

  const upToDate = metadata.version === release.version;
  return {
    coreId,
    status: upToDate ? 'up-to-date' : 'update-available',
    currentVersion: metadata.version,
    latestVersion: release.version,
    downloadUrl: release.downloadUrl,
    installed: false,
    message: upToDate
      ? `${metadata.name} is up to date (v${release.version}).`
      : `${metadata.name} has upstream v${release.version} (installed: v${metadata.version}). Download/install is not implemented in this build.`
  };
});
ipcMain.handle('settings:get', () => storage.getSettings());
ipcMain.handle('settings:save', async (_e, newSettings: AppSettings) => {
  const previous = vpnManager.getSettings();
  storage.saveSettings(newSettings);
  vpnManager.updateSettings(newSettings);

  // Apply the kill-switch toggle immediately instead of waiting for the next
  // connection, so "ARMED" in the UI matches the firewall's actual state.
  // `newSettings` is always live (it is the payload being saved); the core-path
  // re-arm below also covers switching the active core while armed, which would
  // otherwise leave the rule whitelisting the previous executable.
  const killSwitchChanged = Boolean(newSettings.killSwitch) !== Boolean(previous.killSwitch);
  const coreChanged = newSettings.activeCore !== previous.activeCore;
  const state = vpnManager.getState();
  const tunnelUp = state === 'CONNECTED' || state === 'VERIFYING';

  if (killSwitchChanged || (coreChanged && newSettings.killSwitch)) {
    if (newSettings.killSwitch) {
      // Arming while disconnected installs a block-all rule with no tunnel to
      // carry traffic, which takes the machine offline. Persist the preference
      // (done above) and let the connect path arm it instead.
      if (tunnelUp) {
        killSwitchService.setCoreBinaryPath(coreManager.getBinaryPath(newSettings.activeCore));
        const armed = await killSwitchService.enable();
        vpnManager.setKillSwitchArmed(armed);
      } else {
        console.log(`[killswitch] Preference enabled but VPN is ${state}; will arm on connect.`);
      }
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
    // Live settings, not the module-load snapshot: the active core (and so the
    // executable the firewall must allow) can change while the app runs.
    const liveSettings = storage.getSettings();
    const state = vpnManager.getState();
    if (state !== 'CONNECTED' && state !== 'VERIFYING') {
      // Blocking all outbound traffic with no tunnel up would disconnect the
      // machine. Defer: the preference is already persisted and the connect
      // path arms the kill switch.
      console.log(`[killswitch] Enable requested while VPN is ${state}; deferring until connected.`);
      return false;
    }

    killSwitchService.setCoreBinaryPath(coreManager.getBinaryPath(liveSettings.activeCore));
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
