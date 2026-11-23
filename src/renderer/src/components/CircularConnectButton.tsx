import React from 'react';
import { Power, Shield, ShieldCheck, Loader2 } from 'lucide-react';
import { ConnectionState } from '../../../shared/types';

interface CircularConnectButtonProps {
  state: ConnectionState;
  onToggle: () => void;
  disabled?: boolean;
}

export const CircularConnectButton: React.FC<CircularConnectButtonProps> = ({ state, onToggle, disabled }) => {
  const isConnected = state === 'CONNECTED';
  const isConnecting = state === 'CONNECTING' || state === 'VERIFYING';
  const isDisconnecting = state === 'DISCONNECTING';

  return (
    <div className="flex flex-col items-center justify-center select-none py-6">
      <div className="relative flex items-center justify-center">
        {/* Ambient Outer Neon Glow */}
        <div className={`absolute w-56 h-56 rounded-full transition-all duration-700 blur-2xl pointer-events-none ${
          isConnected
            ? 'bg-emerald-500/25 scale-110'
            : isConnecting
            ? 'bg-amber-500/25 scale-105 animate-pulse'
            : 'bg-cyan-500/10 scale-95'
        }`} />

        {/* Rotating Tech Circuit Ring */}
        <div className={`absolute w-48 h-48 rounded-full border border-dashed transition-all duration-1000 ${
          isConnected
            ? 'border-emerald-500/40 animate-[spin_20s_linear_infinite]'
            : isConnecting
            ? 'border-amber-400/60 animate-[spin_3s_linear_infinite]'
            : 'border-slate-800 animate-[spin_30s_linear_infinite]'
        }`} />

        {/* Second Reverse Ring */}
        <div className={`absolute w-44 h-44 rounded-full border border-dotted transition-all duration-1000 ${
          isConnected
            ? 'border-cyan-400/40 animate-[spin_15s_linear_infinite_reverse]'
            : isConnecting
            ? 'border-amber-500/40 animate-[spin_4s_linear_infinite_reverse]'
            : 'border-slate-800/80'
        }`} />

        {/* Main Connect Power Button */}
        <button
          onClick={onToggle}
          disabled={disabled || isDisconnecting}
          className={`relative w-36 h-36 rounded-full flex flex-col items-center justify-center transition-all duration-500 focus:outline-none group active:scale-95 ${
            isConnected
              ? 'bg-gradient-to-b from-emerald-950/80 to-slate-950 border-2 border-emerald-500/70 shadow-[0_0_35px_rgba(16,185,129,0.35)] hover:shadow-[0_0_45px_rgba(16,185,129,0.5)]'
              : isConnecting
              ? 'bg-gradient-to-b from-amber-950/80 to-slate-950 border-2 border-amber-500/70 shadow-[0_0_35px_rgba(245,158,11,0.35)]'
              : 'bg-gradient-to-b from-slate-900 to-slate-950 border-2 border-cyan-500/40 hover:border-cyan-400/80 shadow-[0_0_25px_rgba(0,229,255,0.15)] hover:shadow-[0_0_35px_rgba(0,229,255,0.35)]'
          } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
        >
          {/* Inner Gloss reflection */}
          <div className="absolute top-1 left-4 right-4 h-12 bg-gradient-to-b from-white/10 to-transparent rounded-t-full pointer-events-none" />

          {/* Central Icon */}
          <div className="relative z-10 transition-transform duration-300 group-hover:scale-105">
            {isConnecting || isDisconnecting ? (
              <Loader2 className="w-12 h-12 text-amber-400 animate-spin" />
            ) : isConnected ? (
              <Power className="w-12 h-12 text-emerald-400 drop-shadow-[0_0_12px_rgba(16,185,129,0.9)]" />
            ) : (
              <Power className="w-12 h-12 text-cyan-400 group-hover:text-cyan-300 drop-shadow-[0_0_10px_rgba(0,229,255,0.6)]" />
            )}
          </div>
        </button>
      </div>

      {/* Button Sub-Label */}
      <div className="mt-5 text-center">
        <span className={`text-xs font-mono font-bold tracking-widest uppercase transition-colors duration-300 ${
          isConnected
            ? 'text-emerald-400'
            : isConnecting
            ? 'text-amber-400 animate-pulse'
            : 'text-slate-400'
        }`}>
          {isConnected ? 'DISCONNECT' : isConnecting ? 'CONNECTING...' : 'CLICK TO CONNECT'}
        </span>
        <p className="text-[11px] text-slate-500 font-sans mt-0.5">
          {isConnected ? 'Protected & Encrypted' : 'Encrypted with Multi-Core'}
        </p>
      </div>
    </div>
  );
};
