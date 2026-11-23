import React from 'react';
import { Palette, Check, Sparkles } from 'lucide-react';
import { AppSettings } from '../../../shared/types';
import { api } from '../api/client';

interface AppearancePageProps {
  settings: AppSettings;
  onSettingsUpdated: (settings: AppSettings) => void;
}

export const AppearancePage: React.FC<AppearancePageProps> = ({ settings, onSettingsUpdated }) => {
  const accentColors = [
    { name: 'Electric Cyan', hex: '#00e5ff' },
    { name: 'Neon Purple', hex: '#8b5cf6' },
    { name: 'Cyber Emerald', hex: '#10b981' },
    { name: 'Hot Crimson', hex: '#ef4444' },
    { name: 'Amber Gold', hex: '#f59e0b' }
  ];

  const handleSetAccent = async (hex: string) => {
    const updated = { ...settings, accentColor: hex };
    await api.saveSettings(updated);
    onSettingsUpdated(updated);
  };

  return (
    <div className="space-y-6">
      <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-4 backdrop-blur-md">
        <h2 className="text-sm font-bold text-slate-100 flex items-center gap-2">
          <Palette className="w-4 h-4 text-cyan-400" />
          Appearance & Visual Styling
        </h2>
        <p className="text-xs text-slate-400 mt-0.5">
          Customize high-tech cyberpunk glow, neon accent hues, and dark/light modes
        </p>
      </div>

      {/* Theme Modes */}
      <div className="space-y-3">
        <span className="text-xs font-mono font-bold tracking-wider text-slate-400 uppercase">
          THEME ENVIRONMENT
        </span>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { id: 'cyberpunk', name: 'Cyberpunk Neon', desc: 'Dark obsidian background with glowing neon accents and tech grids' },
            { id: 'dark', name: 'Graphite Dark', desc: 'Minimalist dark slate theme with reduced contrast' },
            { id: 'light', name: 'Clean Light', desc: 'Clean high-readability daylight theme' }
          ].map((th) => (
            <div
              key={th.id}
              onClick={async () => {
                const updated: AppSettings = { ...settings, theme: th.id as any };
                await api.saveSettings(updated);
                onSettingsUpdated(updated);
              }}
              className={`p-4 rounded-xl border cursor-pointer transition-all space-y-1 ${
                settings.theme === th.id
                  ? 'bg-cyan-950/30 border-cyan-500/50 shadow-[0_0_15px_rgba(0,229,255,0.15)]'
                  : 'bg-slate-900/40 border-slate-800'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs text-slate-200">{th.name}</span>
                {settings.theme === th.id && <Check className="w-4 h-4 text-cyan-400" />}
              </div>
              <p className="text-[11px] text-slate-400">{th.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Accent Colors */}
      <div className="space-y-3">
        <span className="text-xs font-mono font-bold tracking-wider text-slate-400 uppercase">
          NEON ACCENT COLOR
        </span>

        <div className="flex items-center gap-3">
          {accentColors.map((color) => (
            <button
              key={color.hex}
              onClick={() => handleSetAccent(color.hex)}
              className="w-9 h-9 rounded-full border-2 flex items-center justify-center transition-all hover:scale-110"
              style={{
                backgroundColor: color.hex,
                borderColor: settings.accentColor === color.hex ? '#ffffff' : 'transparent',
                boxShadow: settings.accentColor === color.hex ? `0 0 15px ${color.hex}` : 'none'
              }}
              title={color.name}
            >
              {settings.accentColor === color.hex && <Check className="w-4 h-4 text-black font-bold" />}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
