import React from 'react';
import { Layers, ShieldCheck, Lock, Zap, Radio, Globe } from 'lucide-react';

export const ProtocolManagerPage: React.FC = () => {
  const protocolMatrix = [
    {
      name: 'VLESS + Reality',
      type: 'Modern Proxy',
      security: 'TLS 1.3 Reality / XTLS Vision',
      underlying: 'TCP / WebSocket / gRPC',
      optimalCore: 'Xray-core / sing-box',
      antiCensorship: 'Maximum (Bypasses active probing & deep packet inspection)',
      recommended: true
    },
    {
      name: 'Hysteria 2',
      type: 'UDP Transport',
      security: 'Custom QUIC + TLS 1.3',
      underlying: 'UDP (Brutal Congestion Control)',
      optimalCore: 'sing-box / Hysteria 2',
      antiCensorship: 'High (Excels on packet-loss & throttled mobile networks)',
      recommended: true
    },
    {
      name: 'WireGuard',
      type: 'Kernel / TUN VPN',
      security: 'Noise Protocol (ChaCha20-Poly1305)',
      underlying: 'UDP',
      optimalCore: 'sing-box / WireGuard',
      antiCensorship: 'Moderate (Standard WireGuard headers; optimal via Warp / AmneziaWG)'
    },
    {
      name: 'TUIC',
      type: 'QUIC Proxy',
      security: 'QUIC + TLS 1.3',
      underlying: 'UDP',
      optimalCore: 'sing-box',
      antiCensorship: 'High (0-RTT handshake, low overhead)'
    },
    {
      name: 'Trojan',
      type: 'Proxy',
      security: 'Native TLS',
      underlying: 'TCP / WS / gRPC',
      optimalCore: 'Xray-core / sing-box',
      antiCensorship: 'High (Mimics HTTPS web server traffic)'
    },
    {
      name: 'VMess',
      type: 'Encrypted Proxy',
      security: 'AEAD + TLS',
      underlying: 'TCP / WebSocket / gRPC',
      optimalCore: 'Xray-core / sing-box',
      antiCensorship: 'Moderate to High (When paired with WebSocket + TLS)'
    },
    {
      name: 'Shadowsocks AEAD',
      type: 'Symmetric Proxy',
      security: 'AEAD 2022 (Blake3 / AES-GCM)',
      underlying: 'TCP / UDP',
      optimalCore: 'sing-box / Shadowsocks-rust',
      antiCensorship: 'Moderate (Requires plugin like Cloak or ShadowTLS for heavy GFW)'
    }
  ];

  return (
    <div className="space-y-6">
      <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-4 backdrop-blur-md flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-slate-100 flex items-center gap-2">
            <Layers className="w-4 h-4 text-cyan-400" />
            Protocol & Cryptographic Transport Matrix
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Detailed breakdown of encryption schemes, transports, and anti-censorship resistance
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {protocolMatrix.map((item, idx) => (
          <div
            key={idx}
            className="p-4 rounded-xl border border-slate-800/80 bg-slate-900/40 hover:bg-slate-900/60 transition-all space-y-2"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="font-bold text-xs text-slate-100">{item.name}</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-cyan-400 border border-slate-700">
                  {item.type}
                </span>
                {item.recommended && (
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800/50">
                    RECOMMENDED
                  </span>
                )}
              </div>
              <span className="text-[11px] font-mono text-slate-400">
                Core: <strong className="text-slate-200">{item.optimalCore}</strong>
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 pt-2 text-xs">
              <div className="p-2 rounded-lg bg-slate-950/60 border border-slate-800/50">
                <span className="text-[10px] text-slate-500 uppercase font-mono block">Security / Cipher</span>
                <span className="text-slate-300 font-medium text-[11px]">{item.security}</span>
              </div>
              <div className="p-2 rounded-lg bg-slate-950/60 border border-slate-800/50">
                <span className="text-[10px] text-slate-500 uppercase font-mono block">Underlying Transport</span>
                <span className="text-slate-300 font-medium text-[11px]">{item.underlying}</span>
              </div>
              <div className="p-2 rounded-lg bg-slate-950/60 border border-slate-800/50 sm:col-span-2 md:col-span-1">
                <span className="text-[10px] text-slate-500 uppercase font-mono block">Anti-Censorship Efficacy</span>
                <span className="text-cyan-300 font-medium text-[11px]">{item.antiCensorship}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
