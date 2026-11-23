import React from 'react';
import { 
  Cpu, 
  CheckCircle, 
  AlertCircle, 
  ExternalLink, 
  ShieldCheck, 
  Sparkles,
  Layers,
  ArrowRight
} from 'lucide-react';
import { CoreMetadata, SupportedCore, AppSettings } from '../../../shared/types';
import { api } from '../api/client';

interface CoreManagerPageProps {
  cores: CoreMetadata[];
  settings: AppSettings;
  onRefreshCores: () => void;
  onSettingsUpdated: (settings: AppSettings) => void;
}

export const CoreManagerPage: React.FC<CoreManagerPageProps> = ({
  cores,
  settings,
  onRefreshCores,
  onSettingsUpdated
}) => {
  const handleSelectActiveCore = async (coreId: SupportedCore) => {
    const updated = { ...settings, activeCore: coreId };
    await api.saveSettings(updated);
    onSettingsUpdated(updated);
  };

  return (
    <div className="space-y-6">
      {/* Overview Banner */}
      <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-4 backdrop-blur-md flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400">
            <Cpu className="w-5 h-5 drop-shadow-[0_0_8px_#a855f7]" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-100">
              Multi-Core Modular Engine Architecture
            </h2>
            <p className="text-xs text-slate-400">
              RYOX VPN runs independent sandboxed core adapters. Each protocol runs on its optimal high-performance binary.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-slate-400">Default Primary Core:</span>
          <span className="text-xs font-mono font-bold uppercase px-2.5 py-1 rounded-lg bg-cyan-950 border border-cyan-500/40 text-cyan-400">
            {settings.activeCore}
          </span>
        </div>
      </div>

      {/* Core Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {cores.map((core) => {
          const isPrimary = settings.activeCore === core.id;
          return (
            <div
              key={core.id}
              className={`p-4 rounded-xl border transition-all space-y-3 ${
                isPrimary
                  ? 'bg-cyan-950/20 border-cyan-500/40 shadow-[0_0_15px_rgba(0,229,255,0.1)]'
                  : 'bg-slate-900/40 border-slate-800/80 hover:border-slate-700'
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-xs text-slate-200">{core.name}</h3>
                    <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-800 text-slate-400">
                      v{core.version}
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-cyan-400/80 mt-0.5 block">
                    {core.category}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full flex items-center gap-1 border ${
                    core.status === 'Ready'
                      ? 'bg-emerald-950/60 text-emerald-400 border-emerald-800/40'
                      : 'bg-amber-950/60 text-amber-400 border-amber-800/40'
                  }`}>
                    {core.status === 'Ready' ? <CheckCircle className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                    {core.status}
                  </span>
                </div>
              </div>

              <p className="text-[11px] text-slate-400 leading-relaxed">
                {core.description}
              </p>

              <div className="flex items-center justify-between pt-2 border-t border-slate-800/60 text-[10px] font-mono">
                <div className="flex items-center gap-2">
                  <span className="text-slate-500">License:</span>
                  <a
                    href={core.licenseUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-slate-300 hover:text-cyan-400 underline underline-offset-2"
                  >
                    {core.license}
                  </a>
                </div>

                <div className="flex items-center gap-2">
                  <a
                    href={core.upstreamUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-slate-500 hover:text-slate-300 flex items-center gap-1"
                  >
                    <span>Releases</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>

                  {!isPrimary && (
                    <button
                      onClick={() => handleSelectActiveCore(core.id)}
                      className="px-2 py-1 rounded bg-slate-800 hover:bg-cyan-500 hover:text-slate-950 text-slate-300 font-medium transition-all"
                    >
                      Set Default
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
