import React, { useState } from 'react';
import { Split, Plus, Trash2, CheckSquare, Square, Laptop } from 'lucide-react';

export const SplitTunnelingPage: React.FC = () => {
  const [mode, setMode] = useState<'bypass' | 'proxy'>('bypass');
  const [apps, setApps] = useState<string[]>([
    'chrome.exe',
    'discord.exe',
    'telegram.exe',
    'steam.exe',
    'qbittorrent.exe'
  ]);
  const [customApp, setCustomApp] = useState('');

  const handleAddApp = () => {
    if (!customApp.trim()) return;
    setApps([...apps, customApp.trim().toLowerCase()]);
    setCustomApp('');
  };

  const handleRemove = (app: string) => {
    setApps(apps.filter(a => a !== app));
  };

  return (
    <div className="space-y-6">
      <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-4 backdrop-blur-md">
        <h2 className="text-sm font-bold text-slate-100 flex items-center gap-2">
          <Split className="w-4 h-4 text-cyan-400" />
          Application Split Tunneling
        </h2>
        <p className="text-xs text-slate-400 mt-0.5">
          Choose which individual Windows / Android applications route through VPN and which use direct connection
        </p>
      </div>

      {/* Mode Toggle */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div
          onClick={() => setMode('bypass')}
          className={`p-4 rounded-xl border cursor-pointer transition-all space-y-1 ${
            mode === 'bypass'
              ? 'bg-cyan-950/30 border-cyan-500/50 shadow-[0_0_15px_rgba(0,229,255,0.15)]'
              : 'bg-slate-900/40 border-slate-800'
          }`}
        >
          <span className="font-bold text-xs text-slate-200">Bypass Mode</span>
          <p className="text-[11px] text-slate-400">
            Selected applications connect directly without VPN. All other apps are encrypted.
          </p>
        </div>

        <div
          onClick={() => setMode('proxy')}
          className={`p-4 rounded-xl border cursor-pointer transition-all space-y-1 ${
            mode === 'proxy'
              ? 'bg-cyan-950/30 border-cyan-500/50 shadow-[0_0_15px_rgba(0,229,255,0.15)]'
              : 'bg-slate-900/40 border-slate-800'
          }`}
        >
          <span className="font-bold text-xs text-slate-200">Only Proxy Mode</span>
          <p className="text-[11px] text-slate-400">
            Only selected applications route through VPN. All other apps stay on normal network.
          </p>
        </div>
      </div>

      {/* Add App Form */}
      <div className="flex gap-2">
        <input
          type="text"
          value={customApp}
          onChange={(e) => setCustomApp(e.target.value)}
          placeholder="Application executable name, e.g. spotify.exe or com.twitter.android"
          className="flex-1 px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-500"
        />
        <button
          onClick={handleAddApp}
          className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 rounded-xl text-xs font-bold transition-all"
        >
          Add App
        </button>
      </div>

      {/* Apps List */}
      <div className="space-y-2">
        {apps.map((app) => (
          <div
            key={app}
            className="p-3 rounded-xl border border-slate-800 bg-slate-900/40 flex items-center justify-between"
          >
            <div className="flex items-center gap-2.5">
              <Laptop className="w-4 h-4 text-slate-500" />
              <span className="font-mono text-xs text-slate-200">{app}</span>
            </div>
            <button
              onClick={() => handleRemove(app)}
              className="text-slate-600 hover:text-red-400 p-1"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};
