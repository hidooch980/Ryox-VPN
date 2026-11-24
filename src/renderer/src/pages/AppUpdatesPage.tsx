import React, { useState } from 'react';
import { RefreshCw, DownloadCloud, CheckCircle2, ShieldCheck, ExternalLink } from 'lucide-react';
import { AppUpdater, AppReleaseInfo } from '../../../main/updater/AppUpdater';
import { api } from '../api/client';

export const AppUpdatesPage: React.FC = () => {
  const [checking, setChecking] = useState(false);
  const [releaseInfo, setReleaseInfo] = useState<AppReleaseInfo | null>(null);

  const handleCheck = async () => {
    setChecking(true);
    try {
      const res = await api.checkForAppUpdates();
      setReleaseInfo(res);
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-4 backdrop-blur-md flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-slate-100 flex items-center gap-2">
            <RefreshCw className="w-4 h-4 text-cyan-400" />
            Automatic Application Updates via GitHub Releases
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Every update is verified with SHA256 checksums before installation. 100% free forever.
          </p>
        </div>

        <button
          onClick={handleCheck}
          disabled={checking}
          className="flex items-center gap-2 px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 rounded-xl text-xs font-bold transition-all shadow-[0_0_15px_rgba(0,229,255,0.3)] disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${checking ? 'animate-spin' : ''}`} />
          <span>{checking ? 'Checking GitHub...' : 'Check for Updates'}</span>
        </button>
      </div>

      <div className="p-5 rounded-2xl border border-slate-800 bg-slate-900/40 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-4">
          <div>
            <span className="text-xs text-slate-400 block">CURRENT INSTALLED VERSION</span>
            <span className="text-lg font-bold font-mono text-cyan-400">v1.1.0 (Official Stable Release)</span>
          </div>

          <div className="text-right">
            <span className="text-xs text-slate-400 block">RELEASE CHANNEL</span>
            <span className="text-xs font-mono font-bold px-2.5 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800/40">
              STABLE / PUBLIC OPEN SOURCE
            </span>
          </div>
        </div>

        {releaseInfo ? (
          <div className="space-y-3 pt-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              <span className="text-xs font-bold text-slate-200">
                {releaseInfo.hasUpdate
                  ? `New Update Available: v${releaseInfo.version}!`
                  : `You are running the latest version (v${releaseInfo.version}).`}
              </span>
            </div>

            <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 text-xs text-slate-300 leading-relaxed font-mono whitespace-pre-line">
              {releaseInfo.changelog}
            </div>

            {releaseInfo.downloadUrl && (
              <a
                href={releaseInfo.downloadUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-xl transition-all shadow-[0_0_15px_rgba(16,185,129,0.3)]"
              >
                <DownloadCloud className="w-4 h-4" />
                <span>Download Verified Release Package</span>
              </a>
            )}
          </div>
        ) : (
          <p className="text-xs text-slate-500 pt-2">
            Click "Check for Updates" above to query the official GitHub repository releases API.
          </p>
        )}
      </div>
    </div>
  );
};
