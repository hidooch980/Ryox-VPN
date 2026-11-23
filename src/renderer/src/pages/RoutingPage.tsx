import React, { useState } from 'react';
import { GitFork, Shield, Globe, Check, AlertTriangle, Sparkles, Zap } from 'lucide-react';
import { AppSettings, RoutingMode } from '../../../shared/types';
import { api } from '../api/client';

interface RoutingPageProps {
  settings: AppSettings;
  onSettingsUpdated: (settings: AppSettings) => void;
}

export const RoutingPage: React.FC<RoutingPageProps> = ({ settings, onSettingsUpdated }) => {
  const [smartConnecting, setSmartConnecting] = useState(false);
  const [smartConnectToast, setSmartConnectToast] = useState<string | null>(null);
  const [customDomains, setCustomDomains] = useState<string>(
    (settings.customDirectDomains || []).join('\n')
  );

  const handleModeChange = async (mode: RoutingMode) => {
    const updated = { ...settings, routingMode: mode };
    await api.saveSettings(updated);
    onSettingsUpdated(updated);
  };

  const handleToggle = async (key: keyof AppSettings) => {
    const updated = { ...settings, [key]: !settings[key] };
    await api.saveSettings(updated);
    onSettingsUpdated(updated);
  };

  const handleSmartConnect = async () => {
    setSmartConnecting(true);
    setSmartConnectToast(null);
    try {
      const server = await api.smartConnect();
      if (server) {
        setSmartConnectToast(`✅ متصل شد به: ${server.name}`);
      } else {
        setSmartConnectToast('⚠️ هیچ سروری در دسترس نبود');
      }
    } catch {
      setSmartConnectToast('❌ خطا در اتصال هوشمند');
    } finally {
      setSmartConnecting(false);
      setTimeout(() => setSmartConnectToast(null), 4000);
    }
  };

  const handleSaveCustomDomains = async () => {
    const domains = customDomains
      .split('\n')
      .map(d => d.trim())
      .filter(d => d.length > 0);
    const updated = { ...settings, customDirectDomains: domains };
    await api.saveSettings(updated);
    onSettingsUpdated(updated);
  };

  return (
    <div className="space-y-6">
      {/* Smart Connect Button */}
      <div className="bg-gradient-to-r from-cyan-950/40 to-slate-900/40 border border-cyan-500/30 rounded-2xl p-4 backdrop-blur-md flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-cyan-300 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-cyan-400" />
            Smart Connect
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">اتصال خودکار به بهترین سرور بر اساس تأخیر</p>
        </div>
        <button
          onClick={handleSmartConnect}
          disabled={smartConnecting}
          className="flex items-center gap-2 px-4 py-2 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/50 text-cyan-300 text-xs font-bold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_12px_rgba(0,229,255,0.2)]"
        >
          <Zap className="w-4 h-4" />
          {smartConnecting ? 'در حال جستجو...' : '⚡ Smart Connect — اتصال خودکار به بهترین سرور'}
        </button>
      </div>

      {/* Smart Connect Toast */}
      {smartConnectToast && (
        <div className="bg-slate-900/80 border border-cyan-500/30 rounded-xl p-3 text-xs text-cyan-200 font-mono animate-fade-in">
          {smartConnectToast}
        </div>
      )}

      <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-4 backdrop-blur-md">
        <h2 className="text-sm font-bold text-slate-100 flex items-center gap-2">
          <GitFork className="w-4 h-4 text-cyan-400" />
          Smart Traffic Routing & Rule Management
        </h2>
        <p className="text-xs text-slate-400 mt-0.5">
          Choose how traffic flows through the tunnel: Rule-based (intelligent GeoIP/Geosite), Global, or Direct
        </p>
      </div>

      {/* Mode Selectors */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          {
            id: 'Rule' as RoutingMode,
            title: 'Rule (Intelligent)',
            desc: 'Routes international traffic through VPN, while keeping domestic/LAN sites direct. Blocks ad trackers.',
            badge: 'RECOMMENDED'
          },
          {
            id: 'Global' as RoutingMode,
            title: 'Global (All Traffic)',
            desc: 'Forces 100% of network traffic through the encrypted VPN tunnel regardless of domain or IP.'
          },
          {
            id: 'Direct' as RoutingMode,
            title: 'Direct (Bypass)',
            desc: 'Passes all connections directly through your local ISP connection without proxying.'
          }
        ].map((m) => {
          const isSelected = settings.routingMode === m.id;
          return (
            <div
              key={m.id}
              onClick={() => handleModeChange(m.id)}
              className={`p-4 rounded-xl border cursor-pointer transition-all space-y-2 ${
                isSelected
                  ? 'bg-cyan-950/30 border-cyan-500/50 shadow-[0_0_15px_rgba(0,229,255,0.15)]'
                  : 'bg-slate-900/40 border-slate-800/80 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs text-slate-200">{m.title}</span>
                {isSelected && <Check className="w-4 h-4 text-cyan-400" />}
              </div>
              {m.badge && (
                <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-400 border border-emerald-800/40">
                  {m.badge}
                </span>
              )}
              <p className="text-[11px] text-slate-400 leading-relaxed">
                {m.desc}
              </p>
            </div>
          );
        })}
      </div>

      {/* Routing Toggles */}
      <div className="space-y-3">
        <div className="text-xs font-mono font-bold tracking-wider text-slate-400 uppercase">
          AUTOMATIC ROUTING RULES
        </div>

        <div className="space-y-2">
          <div className="p-3.5 rounded-xl border border-slate-800 bg-slate-900/40 flex items-center justify-between">
            <div>
              <span className="font-semibold text-xs text-slate-200 block">Bypass LAN & Private IP Networks</span>
              <span className="text-[11px] text-slate-400">10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16 local devices remain directly accessible.</span>
            </div>
            <input
              type="checkbox"
              checked={settings.bypassPrivateIps}
              onChange={() => handleToggle('bypassPrivateIps')}
              className="w-4 h-4 accent-cyan-500 rounded cursor-pointer"
            />
          </div>

          <div className="p-3.5 rounded-xl border border-slate-800 bg-slate-900/40 flex items-center justify-between">
            <div>
              <span className="font-semibold text-xs text-slate-200 block">Bypass High-Censorship Domestic IP/Domains</span>
              <span className="text-[11px] text-slate-400">Automatically routes geoip:ir, geoip:cn, and local services direct for maximum speed.</span>
            </div>
            <input
              type="checkbox"
              checked={settings.bypassChinaAndIranLan}
              onChange={() => handleToggle('bypassChinaAndIranLan')}
              className="w-4 h-4 accent-cyan-500 rounded cursor-pointer"
            />
          </div>

          <div className="p-3.5 rounded-xl border border-cyan-500/30 bg-cyan-950/20 flex items-center justify-between">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-xs text-cyan-300 block">سیستم تکه‌تکه‌سازی بسته‌ها (TLS Hello Fragmentation)</span>
                <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded bg-purple-950 text-purple-300 border border-purple-800/40">ANTI-DPI</span>
              </div>
              <span className="text-[11px] text-slate-400">
                بسته‌های ClientHello را به تکه‌های کوچک خرد می‌کند تا فیلترینگ SNI اپراتورها (همراه اول/ایرانسل) دور زده شود.
              </span>
            </div>
            <input
              type="checkbox"
              checked={settings.enableTlsFragment}
              onChange={() => handleToggle('enableTlsFragment')}
              className="w-4 h-4 accent-cyan-500 rounded cursor-pointer"
            />
          </div>
        </div>
      </div>

      {/* GeoIP Bypass Section */}
      <div className="space-y-3">
        <div className="text-xs font-mono font-bold tracking-wider text-slate-400 uppercase flex items-center gap-2">
          <Globe className="w-3.5 h-3.5 text-cyan-400" />
          ایران / چین مستقیم — Smart GeoIP Bypass
        </div>

        <div className="space-y-2">
          {/* Bypass Iran */}
          <div className="p-3.5 rounded-xl border border-slate-800 bg-slate-900/40 flex items-center justify-between">
            <div>
              <span className="font-semibold text-xs text-slate-200 block">بایپس ایران (IR Direct)</span>
              <span className="text-[11px] text-slate-400">ترافیک تمام آی‌پی‌های ایرانی مستقیم ارسال می‌شود (بدون VPN)</span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={!!settings.bypassIran}
                onChange={() => handleToggle('bypassIran')}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-cyan-500 shadow-inner"></div>
            </label>
          </div>

          {/* Bypass China */}
          <div className="p-3.5 rounded-xl border border-slate-800 bg-slate-900/40 flex items-center justify-between">
            <div>
              <span className="font-semibold text-xs text-slate-200 block">بایپس چین (CN Direct)</span>
              <span className="text-[11px] text-slate-400">ترافیک آی‌پی‌های چین مستقیم ارسال می‌شود</span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={!!settings.bypassChina}
                onChange={() => handleToggle('bypassChina')}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-cyan-500 shadow-inner"></div>
            </label>
          </div>
        </div>
      </div>

      {/* Custom Direct Domains */}
      <div className="space-y-3">
        <div className="text-xs font-mono font-bold tracking-wider text-slate-400 uppercase">
          لیست دامنه‌های شخصی (Custom Direct Domains)
        </div>
        <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-4 space-y-3">
          <p className="text-[11px] text-slate-400">
            دامنه‌هایی که می‌خواهید مستقیم (بدون VPN) باز شوند را وارد کنید. هر دامنه در یک خط جداگانه.
          </p>
          <textarea
            value={customDomains}
            onChange={e => setCustomDomains(e.target.value)}
            rows={5}
            dir="ltr"
            placeholder="example.com&#10;mysite.ir&#10;local.internal"
            className="w-full bg-slate-950/60 border border-slate-700 text-slate-200 text-xs font-mono rounded-lg p-3 resize-y focus:outline-none focus:border-cyan-500/50 placeholder-slate-600 custom-scrollbar"
          />
          <div className="flex justify-end">
            <button
              onClick={handleSaveCustomDomains}
              className="px-4 py-1.5 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-cyan-300 text-xs font-bold rounded-lg transition-all"
            >
              ذخیره
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
