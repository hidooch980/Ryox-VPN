import React from 'react';
import { Minus, Square, X, Shield, ShieldCheck, ShieldAlert, Menu } from 'lucide-react';
import { api } from '../api/client';
import { ConnectionState } from '../../../shared/types';

interface TitleBarProps {
  state: ConnectionState;
  activeServerName?: string;
  pingMs?: number;
  onToggleSidebar?: () => void;
}

export const TitleBar: React.FC<TitleBarProps> = ({ state, activeServerName, pingMs, onToggleSidebar }) => {
  const isConnected = state === 'CONNECTED';
  const isConnecting = state === 'CONNECTING' || state === 'VERIFYING';
  const isAndroid = typeof window !== 'undefined' && (!!(window as any).AndroidBridge || navigator.userAgent.includes('Android'));

  return (
    <header className="h-11 bg-slate-950/80 backdrop-blur-md border-b border-slate-800/80 flex items-center justify-between px-3 select-none z-50 drag-region">
      {/* Brand title on left + Hamburger Menu for Mobile */}
      <div className="flex items-center gap-2.5 no-drag">
        {onToggleSidebar && (
          <button
            onClick={onToggleSidebar}
            className="md:hidden p-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-cyan-500 text-slate-300 hover:text-cyan-400 transition-all"
            title="منوی ناوبری"
          >
            <Menu className="w-4 h-4" />
          </button>
        )}
        <div className="w-5 h-5 rounded-md bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center">
          <span className="font-bold text-[10px] text-cyan-400">R</span>
        </div>
        <span className="text-xs font-semibold tracking-wider text-slate-300">
          RYOX <span className="text-cyan-400 font-normal">VPN</span>
        </span>
        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800/60 text-slate-400 border border-slate-700/50 hidden sm:inline-block">
          v{window.AndroidBridge?.installedVersion?.() ?? '1.2.0'}
        </span>
      </div>

      {/* Middle status pill */}
      <div className="flex items-center gap-2 no-drag">
        <div className={`flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-medium border backdrop-blur-sm transition-all duration-300 ${
          isConnected 
            ? 'bg-emerald-950/50 border-emerald-500/40 text-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.25)]' 
            : isConnecting
            ? 'bg-amber-950/50 border-amber-500/40 text-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.2)]'
            : 'bg-slate-900/60 border-slate-800 text-slate-400'
        }`}>
          {isConnected ? (
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
          ) : isConnecting ? (
            <ShieldAlert className="w-3.5 h-3.5 text-amber-400 animate-spin" />
          ) : (
            <Shield className="w-3.5 h-3.5 text-slate-500" />
          )}
          <span className="hidden xs:inline">{state}</span>
          {isConnected && activeServerName && (
            <span className="text-slate-300 font-mono text-[11px] max-w-[100px] sm:max-w-[140px] truncate">
              • {activeServerName}
            </span>
          )}
          {isConnected && pingMs !== undefined && pingMs > 0 && (
            <span className="text-[10px] font-mono text-emerald-300/80 bg-emerald-900/40 px-1 rounded">
              {pingMs}ms
            </span>
          )}
        </div>
      </div>

      {/* Window Controls on right (hidden on Android) */}
      {!isAndroid && (
        <div className="hidden md:flex items-center gap-1 no-drag">
          <button
            onClick={() => api.minimize()}
            className="w-8 h-7 flex items-center justify-center rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
            title="Minimize"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => api.maximize()}
            className="w-8 h-7 flex items-center justify-center rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
            title="Maximize"
          >
            <Square className="w-3 h-3" />
          </button>
          <button
            onClick={() => api.close()}
            className="w-8 h-7 flex items-center justify-center rounded hover:bg-red-500/20 text-slate-400 hover:text-red-400 transition-colors"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </header>
  );
};
