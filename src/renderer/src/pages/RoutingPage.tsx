import React from 'react';
import { GitFork, Shield, Globe, Check, AlertTriangle } from 'lucide-react';
import { AppSettings, RoutingMode } from '../../../shared/types';
import { api } from '../api/client';

interface RoutingPageProps {
  settings: AppSettings;
  onSettingsUpdated: (settings: AppSettings) => void;
}

export const RoutingPage: React.FC<RoutingPageProps> = ({ settings, onSettingsUpdated }) => {
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

  return (
    <div className="space-y-6">
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
        </div>
      </div>
    </div>
  );
};
