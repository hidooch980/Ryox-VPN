import React from 'react';
import { ShieldCheck, Heart, GitBranch, Globe, FileText, CheckCircle2, Lock, ExternalLink } from 'lucide-react';
import { Logo } from '../components/Logo';

export const AboutPage: React.FC = () => {
  return (
    <div className="space-y-6 max-w-4xl">
      {/* Brand & Manifesto Header */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-cyan-950/40 via-purple-950/30 to-slate-900/60 border border-cyan-500/30 backdrop-blur-md flex flex-col sm:flex-row items-center gap-6">
        <Logo size="xl" showText={false} />
        <div className="space-y-2 text-center sm:text-left">
          <div className="flex items-center justify-center sm:justify-start gap-2">
            <h1 className="text-2xl font-black font-sans bg-gradient-to-r from-cyan-400 via-sky-300 to-indigo-400 bg-clip-text text-transparent">
              RYOX VPN
            </h1>
            <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-cyan-950 border border-cyan-500/40 text-cyan-300">
              v1.0.0
            </span>
          </div>
          <p className="text-sm font-semibold text-slate-200">
            The Ultimate Free & Open-Source Multi-Core Anti-Censorship VPN Client
          </p>
          <p className="text-xs text-slate-400 max-w-xl leading-relaxed">
            Engineered with an uncompromising commitment to internet freedom, privacy, and speed. Designed for Windows and Android with native kernel tunneling and modular proxy cores.
          </p>
        </div>
      </div>

      {/* 100% Free Forever Pledge Card */}
      <div className="p-5 rounded-2xl bg-slate-900/40 border border-slate-800 space-y-4">
        <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
          <ShieldCheck className="w-5 h-5" />
          <span>OUR PERPETUAL MANIFESTO: 100% FREE FOREVER</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs">
          {[
            'Zero Paid Subscriptions',
            'Zero VIP / Premium Tiers',
            'Zero Advertisements',
            'Zero Paywalls or Trials',
            'Zero Artificial Restrictions',
            '100% Open Source (Apache 2.0)',
            'Zero User Traffic Tracking',
            'Zero Hidden In-App Purchases',
            'Free Automated Updates'
          ].map((item, idx) => (
            <div key={idx} className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/60 text-slate-300">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{item}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Tech Stack & Legal Acknowledgements */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
        <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800 space-y-2">
          <span className="font-bold text-slate-200 block font-mono">CORE INTEGRATIONS</span>
          <p className="text-slate-400 leading-relaxed text-[11px]">
            Powered by independent open-source proxy and VPN projects: 
            sing-box (GPL-3.0), Xray-core (MPL-2.0), Mihomo MetaCubeX (GPL-3.0), WireGuard (GPL-2.0), and Wintun driver.
          </p>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800 space-y-2">
          <span className="font-bold text-slate-200 block font-mono">REPOSITORIES & SOURCE</span>
          <p className="text-slate-400 leading-relaxed text-[11px]">
            Full source code, GitHub Actions CI/CD pipelines, issue trackers, and release binaries are freely accessible to the public on GitHub.
          </p>
          <div className="pt-1 flex gap-3 text-cyan-400 font-mono text-[11px]">
            <a href="https://github.com/ryox-vpn/Ryox-VPN" target="_blank" rel="noreferrer" className="hover:underline flex items-center gap-1">
              <GitBranch className="w-3.5 h-3.5" />
              <span>github.com/ryox-vpn/Ryox-VPN</span>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};
