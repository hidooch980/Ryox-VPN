import React, { useState, useEffect } from 'react';
import { TitleBar } from './components/TitleBar';
import { Sidebar, PageId } from './components/Sidebar';
import { DashboardPage } from './pages/DashboardPage';
import { ServersPage } from './pages/ServersPage';
import { SubscriptionsPage } from './pages/SubscriptionsPage';
import { FreeSourcesPage } from './pages/FreeSourcesPage';
import { WorldMapPage } from './pages/WorldMapPage';
import { CoreManagerPage } from './pages/CoreManagerPage';
import { ProtocolManagerPage } from './pages/ProtocolManagerPage';
import { ConfigEditorPage } from './pages/ConfigEditorPage';
import { RoutingPage } from './pages/RoutingPage';
import { DnsPage } from './pages/DnsPage';
import { SplitTunnelingPage } from './pages/SplitTunnelingPage';
import { DiagnosticsPage } from './pages/DiagnosticsPage';
import { LogsPage } from './pages/LogsPage';
import { AppUpdatesPage } from './pages/AppUpdatesPage';
import { CoreUpdatesPage } from './pages/CoreUpdatesPage';
import { AppearancePage } from './pages/AppearancePage';
import { SettingsPage } from './pages/SettingsPage';
import { AboutPage } from './pages/AboutPage';

import { 
  VpnServerConfig, 
  AppSettings, 
  LiveStats, 
  Subscription, 
  FreeConfigSource, 
  CoreMetadata, 
  LogEntry 
} from '../../shared/types';
import { api } from './api/client';

export const App: React.FC = () => {
  const [activePage, setActivePage] = useState<PageId>('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [servers, setServers] = useState<VpnServerConfig[]>([]);
  const [selectedServer, setSelectedServer] = useState<VpnServerConfig | undefined>(undefined);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [freeSources, setFreeSources] = useState<FreeConfigSource[]>([]);
  const [cores, setCores] = useState<CoreMetadata[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  
  const [settings, setSettings] = useState<AppSettings>({
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
  });

  const [stats, setStats] = useState<LiveStats>({
    connectionState: 'DISCONNECTED',
    activeCore: 'sing-box',
    uploadSpeed: 0,
    downloadSpeed: 0,
    totalUpload: 0,
    totalDownload: 0,
    sessionDuration: 0,
    pingMs: 0
  });

  // Initial load
  useEffect(() => {
    loadAllData();

    // Event listeners
    const unsubState = api.onStateChanged((state) => {
      setStats(prev => ({ ...prev, connectionState: state }));
    });

    const unsubStats = api.onStatsUpdated((newStats) => {
      setStats(newStats);
    });

    const unsubLog = api.onLog((level: any, message: string) => {
      const entry: LogEntry = {
        id: `log-${Date.now()}-${Math.random()}`,
        timestamp: Date.now(),
        level: level as any,
        source: 'Core',
        message
      };
      setLogs(prev => [entry, ...prev].slice(0, 500));
    });

    // B7a: the main process pushes the merged server list after every
    // background free-source fetch. Nothing listened for it before, so the new
    // servers only appeared after a manual refresh.
    const bridge = window.ryoxApi;
    const unsubServers =
      typeof bridge?.onServersUpdated === 'function'
        ? bridge.onServersUpdated((updated: VpnServerConfig[]) => {
            if (!Array.isArray(updated)) return;
            setServers(updated);
            setSelectedServer((prev) =>
              updated.find((s) => s.id === prev?.id) ?? prev ?? updated[0]
            );
          })
        : undefined;

    return () => {
      unsubState();
      unsubStats();
      unsubLog();
      unsubServers?.();
    };
  }, []);

  const loadAllData = async () => {
    const srvs = await api.getServers();
    setServers(srvs);

    const st = await api.getSettings();
    setSettings(st);

    // S5: restore the persisted selection when that server still exists
    // (current choice wins, then settings.selectedServerId, then the first
    // server). Previously this always jumped back to srvs[0].
    setSelectedServer((prev) => {
      const candidates = [prev?.id, st.selectedServerId].filter(Boolean) as string[];
      for (const id of candidates) {
        const match = srvs.find((s) => s.id === id);
        if (match) return match;
      }
      return srvs[0];
    });

    const subs = await api.getSubscriptions();
    setSubscriptions(subs);

    const srcs = await api.getFreeSources();
    setFreeSources(srcs);

    const crs = await api.getCores();
    setCores(crs);

    const liveSt = await api.getStats();
    setStats(liveSt);
  };

  // S5: remember the user's server choice across restarts.
  const handleSelectServer = async (server: VpnServerConfig) => {
    setSelectedServer(server);
    try {
      const latest = await api.getSettings();
      await api.saveSettings({ ...latest, selectedServerId: server.id });
      setSettings((prev) => ({ ...prev, selectedServerId: server.id }));
    } catch {
      // Non-fatal: the choice still applies for this session.
    }
  };

  const handleConnectToggle = async () => {
    if (stats.connectionState === 'CONNECTED' || stats.connectionState === 'CONNECTING' || stats.connectionState === 'VERIFYING') {
      await api.disconnect();
    } else if (selectedServer) {
      await api.connect(selectedServer);
    }
  };

  return (
    <div 
      className="h-screen w-screen bg-[#05070d] text-slate-100 flex flex-col overflow-hidden font-sans select-none"
      dir={settings.language === 'fa' ? 'rtl' : 'ltr'}
    >
      {/* Top TitleBar */}
      <TitleBar
        state={stats.connectionState}
        activeServerName={selectedServer?.name}
        pingMs={stats.pingMs}
        onToggleSidebar={() => setIsSidebarOpen(prev => !prev)}
      />

      {/* Main Body with Sidebar + Content */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Mobile backdrop */}
        {isSidebarOpen && (
          <div
            className="md:hidden fixed inset-0 z-40 bg-black/70 backdrop-blur-sm transition-opacity"
            onClick={() => setIsSidebarOpen(false)}
          />
        )}

        {/* Sidebar: static on md+, sliding drawer on mobile */}
        <div className={`
          fixed md:relative inset-y-0 ${settings.language === 'fa' ? 'right-0' : 'left-0'} z-50
          transform transition-transform duration-300 ease-in-out
          ${isSidebarOpen ? 'translate-x-0' : (settings.language === 'fa' ? 'translate-x-full md:translate-x-0' : '-translate-x-full md:translate-x-0')}
          flex h-full shadow-2xl md:shadow-none
        `}>
          <Sidebar
            activePage={activePage}
            onSelectPage={(page) => {
              setActivePage(page);
              setIsSidebarOpen(false);
            }}
            serverCount={servers.length}
          />
        </div>

        {/* Content Viewport */}
        <main className="flex-1 overflow-y-auto p-6 custom-scrollbar bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900/30 via-slate-950/80 to-[#05070d]">
          {activePage === 'dashboard' && (
            <DashboardPage
              stats={stats}
              servers={servers}
              selectedServer={selectedServer}
              settings={settings}
              onConnectToggle={handleConnectToggle}
              onSelectServer={handleSelectServer}
              onNavigate={setActivePage}
            />
          )}

          {activePage === 'servers' && (
            <ServersPage
              servers={servers}
              selectedServer={selectedServer}
              onSelectServer={handleSelectServer}
              onRefreshServers={loadAllData}
            />
          )}

          {activePage === 'subscriptions' && (
            <SubscriptionsPage
              subscriptions={subscriptions}
              onRefresh={loadAllData}
            />
          )}

          {activePage === 'free-sources' && (
            <FreeSourcesPage
              sources={freeSources}
              onRefreshSources={loadAllData}
              onServersUpdated={loadAllData}
            />
          )}

          {activePage === 'world-map' && (
            <WorldMapPage
              servers={servers}
              selectedServer={selectedServer}
              onSelectServer={handleSelectServer}
            />
          )}

          {activePage === 'core-manager' && (
            <CoreManagerPage
              cores={cores}
              settings={settings}
              onRefreshCores={loadAllData}
              onSettingsUpdated={setSettings}
            />
          )}

          {activePage === 'protocol-manager' && (
            <ProtocolManagerPage />
          )}

          {activePage === 'config-editor' && (
            <ConfigEditorPage
              selectedServer={selectedServer}
              settings={settings}
            />
          )}

          {activePage === 'routing' && (
            <RoutingPage
              settings={settings}
              onSettingsUpdated={setSettings}
            />
          )}

          {activePage === 'dns' && (
            <DnsPage
              settings={settings}
              onSettingsUpdated={setSettings}
            />
          )}

          {activePage === 'split-tunneling' && (
            <SplitTunnelingPage />
          )}

          {activePage === 'diagnostics' && (
            <DiagnosticsPage />
          )}

          {activePage === 'logs' && (
            <LogsPage
              logs={logs}
              onClearLogs={() => setLogs([])}
            />
          )}

          {activePage === 'app-updates' && (
            <AppUpdatesPage />
          )}

          {activePage === 'core-updates' && (
            <CoreUpdatesPage
              cores={cores}
              onRefreshCores={loadAllData}
            />
          )}

          {activePage === 'appearance' && (
            <AppearancePage
              settings={settings}
              onSettingsUpdated={setSettings}
            />
          )}

          {activePage === 'settings' && (
            <SettingsPage
              settings={settings}
              onSettingsUpdated={setSettings}
            />
          )}

          {activePage === 'about' && (
            <AboutPage />
          )}
        </main>
      </div>
    </div>
  );
};
