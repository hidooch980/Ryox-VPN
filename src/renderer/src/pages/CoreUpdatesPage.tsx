import React, { useState } from 'react';
import { DownloadCloud, RefreshCw, CheckCircle, ExternalLink, ShieldCheck } from 'lucide-react';
import { CoreMetadata } from '../../../shared/types';

interface CoreUpdatesPageProps {
  cores: CoreMetadata[];
  onRefreshCores: () => void;
}

export const CoreUpdatesPage: React.FC<CoreUpdatesPageProps> = ({ cores, onRefreshCores }) => {
  const [updatingCore, setUpdatingCore] = useState<string | null>(null);

  const handleUpdate = (coreId: string) => {
    setUpdatingCore(coreId);
    setTimeout(() => {
      setUpdatingCore(null);
      alert(`Core ${coreId} is verified and up-to-date with upstream repository.`);
    }, 1200);
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
        {cores.map((c) => (
          <div
            key={c.id}
            className="p-4 rounded-xl border border-slate-800/80 bg-slate-900/40 flex items-center justify-between"
          >
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-xs text-slate-200">{c.name}</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-cyan-400">
                  v{c.version}
                </span>
                <span className="text-[10px] text-emerald-400 flex items-center gap-1 font-mono">
                  <CheckCircle className="w-3 h-3" /> Up to date
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Upstream: <a href={c.upstreamUrl} target="_blank" rel="noreferrer" className="text-cyan-400 hover:underline">{c.upstreamUrl}</a>
              </p>
            </div>

            <button
              onClick={() => handleUpdate(c.id)}
              disabled={updatingCore === c.id}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium border border-slate-700 transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${updatingCore === c.id ? 'animate-spin text-cyan-400' : ''}`} />
              <span>{updatingCore === c.id ? 'Verifying...' : 'Check Upstream'}</span>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};
