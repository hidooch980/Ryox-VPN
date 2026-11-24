import React from 'react';
import { Activity, Power, Server } from 'lucide-react';
import { SpeedChart } from '../components/SpeedChart';
import { VpnServerConfig, LiveStats, AppSettings } from '../../../shared/types';
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

  const fa = settings.language === 'fa';
  const chooseServer = !selectedServer && ['DISCONNECTED', 'ERROR'].includes(stats.connectionState) && !stats.killSwitchArmed;
  const disconnect = isConnected || (stats.connectionState === 'ERROR' && stats.killSwitchArmed);
  const connecting = ['CONNECTING', 'VERIFYING'].includes(stats.connectionState);
  const actionLabel = chooseServer ? (fa ? 'انتخاب سرور' : 'Choose server')
    : disconnect ? (fa ? 'قطع اتصال' : 'Disconnect')
    : connecting ? (fa ? 'لغو اتصال' : 'Cancel connection')
    : stats.connectionState === 'DISCONNECTING' ? (fa ? 'در حال قطع اتصال' : 'Disconnecting')
    : (fa ? 'اتصال' : 'Connect');

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

  const node = isConnected ? stats.activeServer ?? selectedServer : selectedServer;
  const android = Boolean(window.AndroidBridge);
  const title = isConnected ? (fa ? 'متصل' : 'Connected') : connecting ? (fa ? 'در حال بررسی اتصال' : 'Checking connection')
    : stats.connectionState === 'ERROR' ? (fa ? 'اتصال ناموفق' : 'Connection failed')
    : stats.connectionState === 'DISCONNECTING' ? (fa ? 'در حال قطع اتصال' : 'Disconnecting') : (fa ? 'قطع اتصال' : 'Disconnected');
  const metrics = [
    [fa ? 'دریافت' : 'Download', formatSpeed(stats.downloadSpeed)],
    [fa ? 'ارسال' : 'Upload', formatSpeed(stats.uploadSpeed)],
    [fa ? 'حجم مصرفی' : 'Transferred', formatBytes(stats.totalUpload + stats.totalDownload)],
    [fa ? 'مدت اتصال' : 'Duration', formatDuration(stats.sessionDuration)]
  ];
  const details = [
    [fa ? 'هسته' : 'Engine', android ? 'sing-box' : stats.activeCore],
    [fa ? 'مسیر اتصال' : 'Mode', android ? (fa ? 'پروکسی سیستم' : 'System proxy') : settings.tunnelMode],
    [fa ? 'تأخیر' : 'Latency', isConnected && stats.pingMs > 0 ? `${stats.pingMs} ms` : '—'],
    [fa ? 'نشانی خروجی' : 'Exit IP', isConnected ? stats.clientIp || '—' : '—'],
    [fa ? 'سلامت سرور' : 'Node health', isConnected && stats.healthScore != null ? `${stats.healthScore}/100` : '—'],
    [fa ? 'تعویض خودکار' : 'Auto switches', String(stats.autoSwitchCount ?? 0)],
    ...(!android ? [[fa ? 'محافظ قطع اتصال' : 'Kill switch', stats.killSwitchArmed ? (fa ? 'فعال' : 'Armed') : (fa ? 'غیرفعال' : 'Off')]] : [])
  ];

  return (
    <div className="session-view">
      <section className="session-cover">
        <div>
          <h1>{fa ? 'اتصال شبکه' : 'Network connection'}</h1>
          <h2 aria-live="polite">{title}</h2>
          <button className="session-action" disabled={stats.connectionState === 'DISCONNECTING'}
            onClick={chooseServer ? () => onNavigate('servers') : onConnectToggle}>
            <Power size={18} />{actionLabel}
          </button>
        </div>
        <div className="session-signal" aria-hidden="true"><Activity /></div>
      </section>
      {stats.connectionState === 'ERROR' && <button className="session-error" onClick={() => onNavigate('logs')}>
        {fa ? 'مشاهدهٔ گزارش خطای اتصال' : 'View connection error log'} {stats.killSwitchArmed && (fa ? ' · محافظ فعال است' : ' · Kill switch armed')}
      </button>}
      <button className="session-node" onClick={() => onNavigate('servers')}>
        <Server /><span><small>{fa ? 'سرور' : 'Server'}</small><strong>{node?.name || (fa ? 'انتخاب سرور' : 'Choose a server')}</strong></span>
        <bdi>{node?.protocol.toUpperCase() ?? servers.length}</bdi>
      </button>
      <div className="session-metrics">{metrics.map(([key,value]) => <div key={key}><small>{key}</small><strong dir="ltr">{value}</strong></div>)}</div>
      <div className="session-panels">
        <section><h3>{fa ? 'ترافیک شبکه' : 'Network traffic'}</h3><SpeedChart uploadSpeed={stats.uploadSpeed} downloadSpeed={stats.downloadSpeed} /></section>
        <section><h3>{fa ? 'جزئیات اتصال' : 'Connection details'}</h3><dl>{details.map(([key,value]) => <div key={key}><dt>{key}</dt><dd><bdi>{value}</bdi></dd></div>)}</dl></section>
      </div>
    </div>
  );
};
