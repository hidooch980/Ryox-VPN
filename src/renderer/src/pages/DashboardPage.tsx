import React from 'react';
import { 
  ArrowDownCircle, 
  ArrowUpCircle, 
  Clock, 
  Wifi, 
  Globe, 
  Server, 
  ChevronRight, 
  Zap,
  Shield,
  Layers
} from 'lucide-react';
import { CircularConnectButton } from '../components/CircularConnectButton';
import { SpeedChart } from '../components/SpeedChart';
import { VpnServerConfig, LiveStats, ConnectionState, AppSettings } from '../../../shared/types';
import { PageId } from '../components/Sidebar';

interface DashboardPageProps {
  stats: LiveStats;
  servers: VpnServerConfig[];
  selectedServer?: VpnServerConfig;
  settings: AppSettings;
  onConnectToggle: () => void;
  onSelectServer: (server: VpnServerConfig) => void;
  onNavigate: (page: PageId) => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  stats,
  servers,
  selectedServer,
  settings,
  onConnectToggle,
  onSelectServer,
  onNavigate
}) => {
  const isConnected = stats.connectionState === 'CONNECTED';

  // Format helpers
  const formatSpeed = (bytesPerSec: number) => {
    if (bytesPerSec > 1024 * 1024) return `${(bytesPerSec / (1024 * 1024)).toFixed(2)} MB/s`;
    return `${(bytesPerSec / 1024).toFixed(1)} KB/s`;
  };

  const formatBytes = (bytes: number) => {
    if (bytes > 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    if (bytes > 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / 1024).toFixed(0)} KB`;
  };

  const formatDuration = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hrs > 0 ? `${hrs}:` : ''}${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="space-y-6">
      {/* Top Banner: Core & Status Summary */}
      <div className="flex items-center justify-between bg-slate-900/40 border border-slate-800/80 rounded-2xl p-4 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
            <Zap className="w-5 h-5 drop-shadow-[0_0_8px_#00e5ff]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-300">ACTIVE ENGINE:</span>
              <span className="text-xs font-mono font-bold text-cyan-400 uppercase bg-cyan-950/60 border border-cyan-500/30 px-2 py-0.5 rounded">
                {stats.activeCore.toUpperCase()}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Mode: {settings.tunnelMode === 'TUN' ? 'Native Wintun TUN (Full System)' : 'System Proxy (WinINet)'} • {settings.routingMode} Routing
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-slate-400">Kill Switch:</span>
          <span
            title={
              stats.killSwitchArmed
                ? 'Windows Firewall rules are installed: traffic is restricted to the VPN core.'
                : settings.killSwitch
                  ? 'Requested in settings, but firewall rules could not be installed. Run RYOX VPN as administrator to enforce it.'
                  : 'Kill switch is disabled in settings.'
            }
            className={`text-xs font-mono px-2 py-0.5 rounded font-bold ${
              stats.killSwitchArmed
                ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-500/30'
                : settings.killSwitch
                  ? 'bg-amber-950/80 text-amber-400 border border-amber-500/30'
                  : 'bg-slate-800 text-slate-400'
            }`}
          >
            {stats.killSwitchArmed ? 'ARMED' : settings.killSwitch ? 'UNAVAILABLE' : 'OFF'}
          </span>
        </div>
      </div>

      {/* Centerpiece: Connect Button & Active Node Selector */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-center">
        {/* Left Column: Quick Node Switcher Card */}
        <div className="bg-slate-900/50 border border-slate-800/80 rounded-2xl p-4 backdrop-blur-md space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold font-mono tracking-wider text-slate-400 uppercase">SELECTED NODE</span>
            <button 
              onClick={() => onNavigate('servers')}
              className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-medium transition-colors"
            >
              All Servers ({servers.length})
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {selectedServer ? (
            <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-sm text-slate-200 truncate max-w-[200px]">
                  {selectedServer.name}
                </span>
                <span className="text-[10px] font-mono font-bold uppercase px-1.5 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800/50">
                  {selectedServer.protocol}
                </span>
              </div>
              <div className="text-[11px] font-mono text-slate-400 flex items-center justify-between">
                <span>{selectedServer.server}:{selectedServer.port}</span>
                {selectedServer.latency && (
                  <span className="text-emerald-400">{selectedServer.latency} ms</span>
                )}
              </div>
              {selectedServer.tls && selectedServer.tls !== 'none' && (
                <div className="text-[10px] text-slate-500 flex items-center gap-1">
                  <Shield className="w-3 h-3 text-cyan-400" />
                  <span>Security: {selectedServer.tls.toUpperCase()}{selectedServer.flow ? ` (${selectedServer.flow})` : ''}</span>
                </div>
              )}
            </div>
          ) : (
            <div className="p-4 text-center text-xs text-slate-500 border border-dashed border-slate-800 rounded-xl">
              No server selected. Please choose a node from Servers page.
            </div>
          )}

          {/* Location & IP Details */}
          <div className="pt-2 border-t border-slate-800/60 space-y-2 text-xs">
            <div className="flex items-center justify-between text-slate-400">
              <span className="flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-slate-500" />
                Virtual IP:
              </span>
              <span className="font-mono text-slate-300">
                {isConnected ? (stats.clientIp || '185.199.108.153') : 'Direct (Unprotected)'}
              </span>
            </div>
            <div className="flex items-center justify-between text-slate-400">
              <span className="flex items-center gap-1.5">
                <Wifi className="w-3.5 h-3.5 text-slate-500" />
                Tunnel Latency:
              </span>
              <span className="font-mono text-cyan-400">
                {isConnected ? `${stats.pingMs} ms` : '—'}
              </span>
            </div>
          </div>
        </div>

        {/* Center: Connect Button */}
        <div className="flex justify-center">
          <CircularConnectButton
            state={stats.connectionState}
            onToggle={onConnectToggle}
            disabled={!selectedServer}
          />
        </div>

        {/* Right Column: Speed Chart & Bandwidth */}
        <div className="space-y-4">
          <div className="bg-slate-900/50 border border-slate-800/80 rounded-2xl p-4 backdrop-blur-md space-y-3">
            <span className="text-xs font-bold font-mono tracking-wider text-slate-400 uppercase">
              NETWORK TELEMETRY
            </span>
            <SpeedChart
              uploadSpeed={stats.uploadSpeed}
              downloadSpeed={stats.downloadSpeed}
            />
          </div>
        </div>
      </div>

      {/* Bottom Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Download Speed */}
        <div className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-3.5 backdrop-blur-md flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
            <ArrowDownCircle className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] font-mono font-bold text-slate-500 uppercase">DOWNLOAD</span>
            <div className="text-base font-bold font-mono text-slate-100">
              {formatSpeed(stats.downloadSpeed)}
            </div>
          </div>
        </div>

        {/* Upload Speed */}
        <div className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-3.5 backdrop-blur-md flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
            <ArrowUpCircle className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] font-mono font-bold text-slate-500 uppercase">UPLOAD</span>
            <div className="text-base font-bold font-mono text-slate-100">
              {formatSpeed(stats.uploadSpeed)}
            </div>
          </div>
        </div>

        {/* Transferred Total */}
        <div className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-3.5 backdrop-blur-md flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] font-mono font-bold text-slate-500 uppercase">TOTAL DATA</span>
            <div className="text-base font-bold font-mono text-slate-100">
              {formatBytes(stats.totalDownload + stats.totalUpload)}
            </div>
          </div>
        </div>

        {/* Session Duration */}
        <div className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-3.5 backdrop-blur-md flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] font-mono font-bold text-slate-500 uppercase">DURATION</span>
            <div className="text-base font-bold font-mono text-slate-100">
              {formatDuration(stats.sessionDuration)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
