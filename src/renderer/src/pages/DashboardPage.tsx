import React from 'react';
import { Activity, Power, Globe2, SlidersHorizontal, RefreshCw, Stethoscope } from 'lucide-react';
import { regionOf } from '../api/useCatalogue';
import { VpnServerConfig, LiveStats, AppSettings } from '../../../shared/types';
import { PageId } from '../components/Sidebar';

interface DashboardPageProps {
  region: string; mode: string; setRegion: (region: string) => void; setMode: (mode: string) => void;
  refresh: () => void; phase: string; updateUrl: string;
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
  region, mode, setRegion, setMode, refresh, phase, updateUrl,
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

  const sec = Math.max(0, Math.floor(stats.sessionDuration || 0));
  const duration = [Math.floor(sec / 3600), Math.floor(sec / 60) % 60, sec % 60].map(n => String(n).padStart(2,'0')).join(':');
  const node = isConnected ? stats.activeServer ?? selectedServer : selectedServer;
  
  const title = isConnected ? (fa ? 'متصل' : 'Connected') : connecting ? (fa ? 'در حال بررسی اتصال' : 'Checking connection')
    : stats.connectionState === 'ERROR' ? (fa ? 'اتصال ناموفق' : 'Connection failed')
    : stats.connectionState === 'DISCONNECTING' ? (fa ? 'در حال قطع اتصال' : 'Disconnecting') : (fa ? 'قطع اتصال' : 'Disconnected');
  const regions = [...new Set(servers.map(regionOf))].sort();
  const protocols = [...new Set(servers.map(s => s.protocol))].sort();
  const names = new Intl.DisplayNames([fa ? 'fa' : 'en'], {type:'region'});
  const label = (code: string) => code === '?' ? (fa ? 'نامشخص' : 'Unknown') : /^[A-Z]{2}$/.test(code) ? names.of(code) || code : code;
  const locked = isConnected || connecting || stats.connectionState === 'DISCONNECTING';
  const activeRegion = node && regionOf(node);
  return <div className="vpn-home">
    <section className="vpn-connection">
      <div className="vpn-overview">
        <div><span className="vpn-state" aria-live="polite">{title}</span>
          <strong className="vpn-time" dir="ltr">{duration}</strong>
          <small>{activeRegion ? label(activeRegion) : (fa ? 'مکان خودکار' : 'Automatic location')} · {node?.protocol.toUpperCase() ?? '—'}</small>
        </div>
        <button className="vpn-power" aria-label={actionLabel} title={actionLabel} disabled={stats.connectionState === 'DISCONNECTING'}
          onClick={chooseServer ? () => onNavigate('servers') : onConnectToggle}><Power size={44}/></button>
      </div>
      <div className="vpn-bandwidth" dir="ltr"><span>↑ {formatSpeed(stats.uploadSpeed)}</span><span>{stats.pingMs > 0 ? stats.pingMs : '—'} ms</span><span>↓ {formatSpeed(stats.downloadSpeed)}</span></div>
    </section>
    <p className="vpn-hint">{stats.connectionState === 'ERROR' ? <button onClick={() => onNavigate('logs')}>{fa ? 'اتصال ناموفق؛ مشاهدهٔ گزارش' : 'Connection failed · View log'}</button> : actionLabel}</p>
    <section className="vpn-ip"><Globe2/><div><small>{fa ? 'آی‌پی خروجی' : 'Exit IP'}</small><strong dir="ltr">{stats.clientIp || '—'}</strong></div><Activity/></section>
    <div className="vpn-pickers">
      <label><Globe2/><span>{fa ? 'مکان خروجی' : 'Exit location'}<select value={region} onChange={e => setRegion(e.target.value)} disabled={locked}>
        <option value="">{fa ? 'خودکار' : 'Automatic'}</option>{[...new Set([...regions,...(region ? [region] : [])])].map(r => <option key={r} value={r}>{label(r)}</option>)}</select></span></label>
      <label><SlidersHorizontal/><span>{fa ? 'حالت اتصال' : 'Connection mode'}<select value={mode} onChange={e => setMode(e.target.value)} disabled={locked}>
        <option value="auto">{fa ? 'خودکار' : 'Automatic'}</option><option value="manual">{fa ? 'سرور انتخابی' : 'Selected server'}</option>
        {[...new Set([...protocols,...(!['auto','manual'].includes(mode) ? [mode] : [])])].map(v => <option key={v} value={v}>{v.toUpperCase()}</option>)}</select></span></label>
      <button onClick={() => onNavigate('diagnostics')}><Stethoscope/>{fa ? 'عیب‌یابی اتصال' : 'Diagnostics'}</button>
      <button onClick={refresh} disabled={phase === 'scan' || phase === 'refresh'}><RefreshCw size={16}/>{phase === 'scan' ? (fa ? 'اسکن سرورها…' : 'Scanning…') : phase === 'refresh' ? (fa ? 'دریافت سرورها…' : 'Refreshing…') : (fa ? 'تازه‌سازی سرورها' : 'Refresh servers')}</button>
    </div>
    {phase === 'error' && <small role="status">{fa ? 'تازه‌سازی انجام نشد' : 'Refresh failed'}</small>}
    {stats.killSwitchArmed && <small>{fa ? 'محافظ قطع اتصال فعال است' : 'Kill switch armed'}</small>}
    {updateUrl && <a className="vpn-update" href={updateUrl} onClick={async event => {
      if (window.ryoxApi?.installStagedUpdate) {
        event.preventDefault();
        if (!await window.ryoxApi.installStagedUpdate()) onNavigate('app-updates');
      }
    }}>{fa ? 'نسخهٔ جدید برنامه' : 'Application update available'}</a>}
  </div>;
};
