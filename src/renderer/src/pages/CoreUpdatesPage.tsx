import React, { useState } from 'react';
import { DownloadCloud, RefreshCw, CheckCircle, AlertTriangle, ExternalLink } from 'lucide-react';
import { CoreMetadata } from '../../../shared/types';

/**
 * Structural twin of `CoreUpdateResult` from the main process
 * (`src/main/index.ts`), exposed through `window.ryoxApi.updateCore`.
 */
interface CoreUpdateResult {
  coreId: string;
  status: 'up-to-date' | 'update-available' | 'unknown-core' | 'network-error';
  currentVersion?: string;
  latestVersion?: string;
  downloadUrl?: string;
  installed: boolean;
  message: string;
}

interface CoreUpdatesPageProps {
  cores: CoreMetadata[];
  onRefreshCores: () => void;
}

export const CoreUpdatesPage: React.FC<CoreUpdatesPageProps> = ({ cores, onRefreshCores }) => {
  const [updatingCore, setUpdatingCore] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, CoreUpdateResult>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleUpdate = async (coreId: string) => {
    setUpdatingCore(coreId);
    setErrors((prev) => {
      const next = { ...prev };
      delete next[coreId];
      return next;
    });

    try {
      const api = window.ryoxApi;
      if (!api?.updateCore) {
        throw new Error('Core update bridge is unavailable in this build.');
      }
      const result = (await api.updateCore(coreId)) as CoreUpdateResult;
      setResults((prev) => ({ ...prev, [coreId]: result }));
    } catch (err) {
      // Surface the real failure instead of the old fake "verified" alert.
      setErrors((prev) => ({
        ...prev,
        [coreId]: err instanceof Error ? err.message : String(err),
      }));
    } finally {
      setUpdatingCore(null);
    }
  };

  const renderStatus = (coreId: string) => {
    const error = errors[coreId];
    if (error) {
      return (
        <span className="text-[10px] text-rose-400 flex items-center gap-1 font-mono">
          <AlertTriangle className="w-3 h-3" /> Check failed
        </span>
      );
    }

    const result = results[coreId];
    if (!result) {
      return <span className="text-[10px] text-slate-500 font-mono">Not checked</span>;
    }

    switch (result.status) {
      case 'up-to-date':
        return (
          <span className="text-[10px] text-emerald-400 flex items-center gap-1 font-mono">
            <CheckCircle className="w-3 h-3" /> Up to date (v{result.latestVersion ?? result.currentVersion})
          </span>
        );
      case 'update-available':
        return (
          <span className="text-[10px] text-amber-400 flex items-center gap-1 font-mono">
            <AlertTriangle className="w-3 h-3" /> v{result.latestVersion} available
          </span>
        );
      default:
        return (
          <span className="text-[10px] text-rose-400 flex items-center gap-1 font-mono">
            <AlertTriangle className="w-3 h-3" /> Upstream unreachable
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-4 backdrop-blur-md">
        <h2 className="text-sm font-bold text-slate-100 flex items-center gap-2">
          <DownloadCloud className="w-4 h-4 text-cyan-400" />
          Upstream Core & Binary Updaters
        </h2>
        <p className="text-xs text-slate-400 mt-0.5">
          Keep underlying proxy cores (sing-box, Xray, Mihomo) up to date directly from official GitHub releases
        </p>
      </div>

      <div className="space-y-3">
        {cores.map((c) => {
          const result = results[c.id];
          const error = errors[c.id];
          return (
            <div
              key={c.id}
              className="p-4 rounded-xl border border-slate-800/80 bg-slate-900/40 flex items-center justify-between"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-xs text-slate-200">{c.name}</span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-cyan-400">
                    v{c.version}
                  </span>
                  {renderStatus(c.id)}
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Upstream: <a href={c.upstreamUrl} target="_blank" rel="noreferrer" className="text-cyan-400 hover:underline">{c.upstreamUrl}</a>
                </p>
                {(result?.message || error) && (
                  <p className={`text-[11px] mt-1 ${error ? 'text-rose-400' : 'text-slate-400'}`}>
                    {error ?? result?.message}
                  </p>
                )}
                {result?.downloadUrl && result.status === 'update-available' && (
                  <a
                    href={result.downloadUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] text-cyan-400 hover:underline inline-flex items-center gap-1 mt-1"
                  >
                    <ExternalLink className="w-3 h-3" /> Open release asset
                  </a>
                )}
              </div>

              <button
                onClick={() => handleUpdate(c.id)}
                disabled={updatingCore === c.id}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium border border-slate-700 transition-colors disabled:opacity-60 shrink-0"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${updatingCore === c.id ? 'animate-spin text-cyan-400' : ''}`} />
                <span>{updatingCore === c.id ? 'Checking...' : 'Check Upstream'}</span>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};
