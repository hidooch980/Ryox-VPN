import React, { useState, useEffect } from 'react';
import { TitleBar } from './components/TitleBar';
import { Sidebar, PageId } from './components/Sidebar';
import { DashboardPage } from './pages/DashboardPage';
import { ServersPage } from './pages/ServersPage';
import { SubscriptionsPage } from './pages/SubscriptionsPage';
import { FreeSourcesPage } from './pages/FreeSourcesPage';
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
    accentColor: '#00e5ff'
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

    return () => {
      unsubState();
      unsubStats();
      unsubLog();
    };
  }, []);

  const loadAllData = async () => {
    const srvs = await api.getServers();
    setServers(srvs);
    if (srvs.length > 0 && !selectedServer) {
      setSelectedServer(srvs[0]);
    }

    const subs = await api.getSubscriptions();
    setSubscriptions(subs);

    const srcs = await api.getFreeSources();
    setFreeSources(srcs);

    const crs = await api.getCores();
    setCores(crs);

    const st = await api.getSettings();
    setSettings(st);

    const liveSt = await api.getStats();
    setStats(liveSt);
  };

  const handleConnectToggle = async () => {
    if (stats.connectionState === 'CONNECTED' || stats.connectionState === 'CONNECTING' || stats.connectionState === 'VERIFYING') {
      await api.disconnect();
    } else if (selectedServer) {
      await api.connect(selectedServer);
    }
  };

  return (
    <div className="h-screen w-screen bg-[#05070d] text-slate-100 flex flex-col overflow-hidden font-sans select-none">
      {/* Top TitleBar */}
      <TitleBar
        state={stats.connectionState}
        activeServerName={selectedServer?.name}
        pingMs={stats.pingMs}
      />

      {/* Main Body with Sidebar + Content */}
      <div className="flex-1 flex overflow-hidden">
        <Sidebar
          activePage={activePage}
          onSelectPage={setActivePage}
          serverCount={servers.length}
        />

        {/* Content Viewport */}
        <main className="flex-1 overflow-y-auto p-6 custom-scrollbar bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900/30 via-slate-950/80 to-[#05070d]">
          {activePage === 'dashboard' && (
            <DashboardPage
              stats={stats}
              servers={servers}
              selectedServer={selectedServer}
              settings={settings}
              onConnectToggle={handleConnectToggle}
              onSelectServer={setSelectedServer}
              onNavigate={setActivePage}
            />
          )}

          {activePage === 'servers' && (
            <ServersPage
              servers={servers}
              selectedServer={selectedServer}
              onSelectServer={setSelectedServer}
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
