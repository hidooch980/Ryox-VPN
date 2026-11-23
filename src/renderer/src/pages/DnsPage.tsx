import React, { useState } from 'react';
import { Network, ShieldCheck, Lock, Globe } from 'lucide-react';
import { AppSettings } from '../../../shared/types';
import { api } from '../api/client';

interface DnsPageProps {
  settings: AppSettings;
  onSettingsUpdated: (settings: AppSettings) => void;
}

export const DnsPage: React.FC<DnsPageProps> = ({ settings, onSettingsUpdated }) => {
  const [dohUrl, setDohUrl] = useState(settings.dohUrl || 'https://1.1.1.1/dns-query');
  const [primaryDns, setPrimaryDns] = useState(settings.dnsServers[0] || '1.1.1.1');
  const [secondaryDns, setSecondaryDns] = useState(settings.dnsServers[1] || '8.8.8.8');

  const handleSave = async () => {
    const updated: AppSettings = {
      ...settings,
      dohUrl,
      dnsServers: [primaryDns, secondaryDns]
    };
    await api.saveSettings(updated);
    onSettingsUpdated(updated);
  };

  const handleToggleDoh = async () => {
    const updated = { ...settings, dnsOverHttps: !settings.dnsOverHttps };
    await api.saveSettings(updated);
    onSettingsUpdated(updated);
  };

  return (
    <div className="space-y-6">
      <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-4 backdrop-blur-md">
        <h2 className="text-sm font-bold text-slate-100 flex items-center gap-2">
          <Network className="w-4 h-4 text-cyan-400" />
          Encrypted DNS & Leak Prevention
        </h2>
        <p className="text-xs text-slate-400 mt-0.5">
          Eliminate ISP DNS poisoning and hijacking with DNS-over-HTTPS (DoH) and custom secure resolvers
        </p>
      </div>

      <div className="space-y-4">
        {/* DoH Toggle */}
        <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/40 flex items-center justify-between">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-purple-400" />
              <span className="font-semibold text-xs text-slate-200">DNS over HTTPS (DoH) Encryption</span>
            </div>
            <span className="text-[11px] text-slate-400 block">
              Encrypts all DNS queries inside TLS packets over port 443, making query inspection impossible.
            </span>
          </div>
          <input
            type="checkbox"
            checked={settings.dnsOverHttps}
            onChange={handleToggleDoh}
            className="w-4 h-4 accent-cyan-500 rounded cursor-pointer"
          />
        </div>

        {/* DoH Provider URL */}
        {settings.dnsOverHttps && (
          <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/40 space-y-2">
            <label className="text-xs font-mono font-bold text-slate-300">DoH Endpoint URL</label>
            <input
              type="text"
              value={dohUrl}
              onChange={(e) => setDohUrl(e.target.value)}
              placeholder="https://1.1.1.1/dns-query"
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono text-cyan-300 focus:outline-none focus:border-cyan-500"
            />
            <div className="flex gap-2 pt-1 text-[11px] text-slate-400 font-mono">
              <button
                type="button"
                onClick={() => setDohUrl('https://1.1.1.1/dns-query')}
                className="hover:text-cyan-400 underline"
              >
                Cloudflare
              </button>
              •
              <button
                type="button"
                onClick={() => setDohUrl('https://dns.google/dns-query')}
                className="hover:text-cyan-400 underline"
              >
                Google DNS
              </button>
              •
              <button
                type="button"
                onClick={() => setDohUrl('https://dns.quad9.net/dns-query')}
                className="hover:text-cyan-400 underline"
              >
                Quad9 (Clean & Ad-Free)
              </button>
            </div>
          </div>
        )}

        {/* Fallback Static Upstream DNS */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/40 space-y-2">
            <label className="text-xs font-mono font-bold text-slate-300">Primary Upstream DNS</label>
            <input
              type="text"
              value={primaryDns}
              onChange={(e) => setPrimaryDns(e.target.value)}
              placeholder="1.1.1.1"
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-500"
            />
          </div>

          <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/40 space-y-2">
            <label className="text-xs font-mono font-bold text-slate-300">Secondary Upstream DNS</label>
            <input
              type="text"
              value={secondaryDns}
              onChange={(e) => setSecondaryDns(e.target.value)}
              placeholder="8.8.8.8"
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-500"
            />
          </div>
        </div>

        <button
          onClick={handleSave}
          className="px-5 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 rounded-xl text-xs font-bold transition-all shadow-[0_0_15px_rgba(0,229,255,0.3)]"
        >
          Save DNS Configuration
        </button>
      </div>
    </div>
  );
};
