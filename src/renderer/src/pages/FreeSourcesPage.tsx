import React, { useState } from 'react';
import { 
  Globe2, 
  DownloadCloud, 
  CheckCircle2, 
  ShieldCheck, 
  Users, 
  ExternalLink,
  Layers,
  Sparkles,
  ToggleLeft,
  ToggleRight
} from 'lucide-react';
import { FreeConfigSource } from '../../../shared/types';
import { api } from '../api/client';

interface FreeSourcesPageProps {
  sources: FreeConfigSource[];
  onRefreshSources: () => void;
  onServersUpdated: () => void;
}

export const FreeSourcesPage: React.FC<FreeSourcesPageProps> = ({
  sources,
  onRefreshSources,
  onServersUpdated
}) => {
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ count: number; totalRaw: number } | null>(null);

  const handleToggle = async (source: FreeConfigSource) => {
    await api.toggleFreeSource(source.id, !source.enabled);
    onRefreshSources();
  };

  const handleSyncAll = async () => {
    setIsSyncing(true);
    setSyncResult(null);
    try {
      const res = await api.fetchAllFreeSources();
      setSyncResult({
        count: res.servers.length,
        totalRaw: res.totalRaw
      });
      onServersUpdated();
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-cyan-950/40 via-indigo-950/30 to-slate-900/40 border border-cyan-500/30 rounded-2xl p-5 backdrop-blur-md flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="p-1 rounded-lg bg-cyan-500/20 text-cyan-400">
              <Sparkles className="w-4 h-4" />
            </span>
            <h2 className="text-sm font-bold text-slate-100 font-sans">
              Public Free Configuration Discovery Engine
            </h2>
          </div>
          <p className="text-xs text-slate-400 max-w-xl">
            Automatically discover, scrape, validate, and deduplicate public open-source VPN configurations shared by the global anti-censorship community. 100% Free forever.
          </p>
        </div>

        <button
          onClick={handleSyncAll}
          disabled={isSyncing}
          className="flex items-center justify-center gap-2 px-5 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-slate-950 rounded-xl text-xs font-bold transition-all shadow-[0_0_20px_rgba(0,229,255,0.35)] shrink-0 disabled:opacity-50"
        >
          <DownloadCloud className={`w-4 h-4 ${isSyncing ? 'animate-bounce' : ''}`} />
          <span>{isSyncing ? 'Discovering & Testing Nodes...' : 'Fetch & Sync Free Servers'}</span>
        </button>
      </div>

      {/* Sync Result Banner */}
      {syncResult && (
        <div className="p-4 rounded-xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 text-xs flex items-center justify-between animate-fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>
              Discovered and parsed <strong>{syncResult.totalRaw}</strong> raw configs. After rigorous deduplication and format validation, <strong>{syncResult.count}</strong> unique nodes have been loaded to your Servers list!
            </span>
          </div>
        </div>
      )}

      {/* Source Cards */}
      <div className="space-y-3">
        <div className="text-xs font-mono font-bold tracking-wider text-slate-400 uppercase">
          CURATED PUBLIC SOURCES ({sources.length})
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {sources.map((src) => (
            <div
              key={src.id}
              className={`p-4 rounded-xl border transition-all space-y-3 ${
                src.enabled
                  ? 'bg-slate-900/50 border-slate-700/80 hover:border-slate-600'
                  : 'bg-slate-950/40 border-slate-800/60 opacity-60'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-xs text-slate-200">{src.name}</h3>
                    <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full border ${
                      src.trustLevel === 'Verified'
                        ? 'bg-emerald-950/60 text-emerald-400 border-emerald-800/40'
                        : 'bg-indigo-950/60 text-indigo-300 border-indigo-800/40'
                    }`}>
                      {src.trustLevel}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                    <Users className="w-3 h-3 text-slate-500" />
                    <span>{src.maintainer}</span>
                  </div>
                </div>

                <button
                  onClick={() => handleToggle(src)}
                  className="text-slate-400 hover:text-cyan-400 transition-colors"
                  title={src.enabled ? 'Disable Source' : 'Enable Source'}
                >
                  {src.enabled ? (
                    <ToggleRight className="w-6 h-6 text-cyan-400" />
                  ) : (
                    <ToggleLeft className="w-6 h-6 text-slate-600" />
                  )}
                </button>
              </div>

              <p className="text-[11px] text-slate-400 leading-relaxed">
                {src.description}
              </p>

              <div className="flex items-center justify-between pt-2 border-t border-slate-800/60 text-[10px] font-mono">
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-500">Protocols:</span>
                  <div className="flex gap-1">
                    {src.protocols.map((proto) => (
                      <span key={proto} className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 uppercase">
                        {proto}
                      </span>
                    ))}
                  </div>
                </div>

                <a
                  href={src.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-slate-500 hover:text-cyan-400 flex items-center gap-1"
                >
                  <span>Raw Feed</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
