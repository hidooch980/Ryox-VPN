import React from 'react';
import { Settings as SettingsIcon, Shield, Radio, Power, EyeOff, Globe } from 'lucide-react';
import { AppSettings, TunnelMode } from '../../../shared/types';
import { api } from '../api/client';

interface SettingsPageProps {
  settings: AppSettings;
  onSettingsUpdated: (settings: AppSettings) => void;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({ settings, onSettingsUpdated }) => {
  const handleToggle = async (key: keyof AppSettings) => {
    const updated = { ...settings, [key]: !settings[key] };
    await api.saveSettings(updated);
    onSettingsUpdated(updated);
  };

  const handleModeChange = async (mode: TunnelMode) => {
    const updated = { ...settings, tunnelMode: mode };
    await api.saveSettings(updated);
    onSettingsUpdated(updated);
  };

  return (
    <div className="space-y-6">
      <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-4 backdrop-blur-md">
        <h2 className="text-sm font-bold text-slate-100 flex items-center gap-2">
          <SettingsIcon className="w-4 h-4 text-cyan-400" />
          General & Security Settings
        </h2>
        <p className="text-xs text-slate-400 mt-0.5">
          Configure operating system tunneling mechanisms, kill switch, startup, and local proxy ports
        </p>
      </div>

      {/* Tunneling Mode Selection */}
      <div className="space-y-3">
        <span className="text-xs font-mono font-bold tracking-wider text-slate-400 uppercase">
          TUNNELING MECHANISM
        </span>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div
            onClick={() => handleModeChange('TUN')}
            className={`p-4 rounded-xl border cursor-pointer transition-all space-y-1 ${
              settings.tunnelMode === 'TUN'
                ? 'bg-cyan-950/30 border-cyan-500/50 shadow-[0_0_15px_rgba(0,229,255,0.15)]'
                : 'bg-slate-900/40 border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-bold text-xs text-slate-200">TUN Mode (Wintun / Layer 3)</span>
              <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-400 border border-emerald-800/40 font-bold">
                RECOMMENDED
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Creates a native kernel virtual network adapter (ryox-tun). Tunnels 100% of all apps, games, and terminal traffic automatically.
            </p>
          </div>

          <div
            onClick={() => handleModeChange('SystemProxy')}
            className={`p-4 rounded-xl border cursor-pointer transition-all space-y-1 ${
              settings.tunnelMode === 'SystemProxy'
                ? 'bg-cyan-950/30 border-cyan-500/50 shadow-[0_0_15px_rgba(0,229,255,0.15)]'
                : 'bg-slate-900/40 border-slate-800'
            }`}
          >
            <span className="font-bold text-xs text-slate-200">System Proxy (WinINet)</span>
            <p className="text-[11px] text-slate-400">
              Configures Windows Internet Options proxy on port 10808/10809. Lightweight, does not require virtual adapter drivers.
            </p>
          </div>
        </div>
      </div>

      {/* Security & Lifecycle Toggles */}
      <div className="space-y-3">
        <span className="text-xs font-mono font-bold tracking-wider text-slate-400 uppercase">
          SECURITY & STARTUP
        </span>

        <div className="space-y-2">
          <div className="p-3.5 rounded-xl border border-slate-800 bg-slate-900/40 flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="font-semibold text-xs text-slate-200 block">Kill Switch (Traffic Protection)</span>
              <span className="text-[11px] text-slate-400">Block all internet traffic if the VPN connection drops unexpectedly to prevent leakages.</span>
            </div>
            <input
              type="checkbox"
              checked={settings.killSwitch}
              onChange={() => handleToggle('killSwitch')}
              className="w-4 h-4 accent-cyan-500 rounded cursor-pointer"
            />
          </div>

          <div className="p-3.5 rounded-xl border border-slate-800 bg-slate-900/40 flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="font-semibold text-xs text-slate-200 block">Auto-Connect on Launch</span>
              <span className="text-[11px] text-slate-400">Automatically establish VPN tunnel immediately when RYOX VPN launches.</span>
            </div>
            <input
              type="checkbox"
              checked={settings.autoConnectOnLaunch}
              onChange={() => handleToggle('autoConnectOnLaunch')}
              className="w-4 h-4 accent-cyan-500 rounded cursor-pointer"
            />
          </div>

          <div className="p-3.5 rounded-xl border border-slate-800 bg-slate-900/40 flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="font-semibold text-xs text-slate-200 block">Start Minimized to System Tray</span>
              <span className="text-[11px] text-slate-400">Launch quietly in the Windows notification area without opening the main window.</span>
            </div>
            <input
              type="checkbox"
              checked={settings.startMinimized}
              onChange={() => handleToggle('startMinimized')}
              className="w-4 h-4 accent-cyan-500 rounded cursor-pointer"
            />
          </div>

          <div className="p-3.5 rounded-xl border border-slate-800 bg-slate-900/40 flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="font-semibold text-xs text-slate-200 block">Allow LAN Sharing</span>
              <span className="text-[11px] text-slate-400">Permit other devices on your local Wi-Fi / LAN to connect through your inbound proxy.</span>
            </div>
            <input
              type="checkbox"
              checked={settings.allowLan}
              onChange={() => handleToggle('allowLan')}
              className="w-4 h-4 accent-cyan-500 rounded cursor-pointer"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
