import React, { useState } from 'react';
import { 
  Server, 
  Search, 
  RefreshCw, 
  Plus, 
  Star, 
  Trash2, 
  Shield, 
  Zap, 
  Check, 
  Copy,
  Wifi
} from 'lucide-react';
import { VpnServerConfig, SupportedProtocol } from '../../../shared/types';
import { api } from '../api/client';

interface ServersPageProps {
  servers: VpnServerConfig[];
  selectedServer?: VpnServerConfig;
  onSelectServer: (server: VpnServerConfig) => void;
  onRefreshServers: () => void;
}

export const ServersPage: React.FC<ServersPageProps> = ({
  servers,
  selectedServer,
  onSelectServer,
  onRefreshServers
}) => {
  const [search, setSearch] = useState('');
  const [filterProto, setFilterProto] = useState<string>('all');
  const [isPingingAll, setIsPingingAll] = useState(false);
  const [manualUri, setManualUri] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);

  const protocols: { id: string; label: string }[] = [
    { id: 'all', label: 'All Protocols' },
    { id: 'vless', label: 'VLESS Reality' },
    { id: 'hysteria2', label: 'Hysteria 2' },
    { id: 'vmess', label: 'VMess' },
    { id: 'trojan', label: 'Trojan' },
    { id: 'wireguard', label: 'WireGuard' },
    { id: 'shadowsocks', label: 'Shadowsocks' }
  ];

  const filtered = servers.filter(s => {
    const matchesProto = filterProto === 'all' || s.protocol === filterProto;
    const matchesSearch = s.name.toLowerCase().includes(search.toLowerCase()) || 
                          s.server.toLowerCase().includes(search.toLowerCase());
    return matchesProto && matchesSearch;
  });

  const handlePingAll = async () => {
    setIsPingingAll(true);
    for (const server of filtered) {
      const ping = await api.pingServer(server);
      server.latency = ping > 0 ? ping : -1;
      await api.saveServer(server);
    }
    setIsPingingAll(false);
    onRefreshServers();
  };

  const handleToggleFavorite = async (server: VpnServerConfig) => {
    server.isFavorite = !server.isFavorite;
    await api.saveServer(server);
    onRefreshServers();
  };

  const handleDelete = async (id: string) => {
    await api.removeServer(id);
    onRefreshServers();
  };

  const handleImportUri = async () => {
    if (!manualUri.trim()) return;
    const parsed = await api.parseUri(manualUri.trim());
    if (parsed) {
      await api.saveServer(parsed);
      setManualUri('');
      setShowAddModal(false);
      onRefreshServers();
    } else {
      alert('Invalid VPN URI format. Supported: vless://, vmess://, trojan://, ss://, hy2://, wireguard://');
    }
  };

  return (
    <div className="space-y-5">
      {/* Top Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-900/40 border border-slate-800/80 rounded-2xl p-4 backdrop-blur-md">
        {/* Search Input */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search servers by name, host, location..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/60"
          />
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={handlePingAll}
            disabled={isPingingAll || filtered.length === 0}
            className="flex items-center gap-2 px-3 py-2 bg-slate-800/80 hover:bg-slate-700/80 text-cyan-400 rounded-xl text-xs font-semibold border border-slate-700 transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isPingingAll ? 'animate-spin' : ''}`} />
            <span>{isPingingAll ? 'Testing Latency...' : 'Ping All'}</span>
          </button>

          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-3.5 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 rounded-xl text-xs font-bold transition-all shadow-[0_0_15px_rgba(0,229,255,0.3)]"
          >
            <Plus className="w-4 h-4" />
            <span>Add Node</span>
          </button>
        </div>
      </div>

      {/* Protocol Filters */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 custom-scrollbar">
        {protocols.map((p) => (
          <button
            key={p.id}
            onClick={() => setFilterProto(p.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
              filterProto === p.id
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-[0_0_10px_rgba(0,229,255,0.15)]'
                : 'text-slate-400 hover:text-slate-200 bg-slate-900/40 hover:bg-slate-800/60 border border-slate-800'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Server List */}
      <div className="space-y-2">
        {filtered.map((server) => {
          const isSelected = selectedServer?.id === server.id;
          return (
            <div
              key={server.id}
              onClick={() => onSelectServer(server)}
              className={`p-3.5 rounded-xl border transition-all duration-200 cursor-pointer flex items-center justify-between group ${
                isSelected
                  ? 'bg-cyan-950/30 border-cyan-500/50 shadow-[0_0_15px_rgba(0,229,255,0.15)]'
                  : 'bg-slate-900/40 hover:bg-slate-800/40 border-slate-800/80 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center gap-3.5 min-w-0">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleToggleFavorite(server);
                  }}
                  className="text-slate-500 hover:text-amber-400 transition-colors"
                >
                  <Star className={`w-4 h-4 ${server.isFavorite ? 'text-amber-400 fill-amber-400' : ''}`} />
                </button>

                <div className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-xs text-slate-300 shrink-0">
                  {server.countryCode || '🌐'}
                </div>

                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-xs text-slate-100 truncate">
                      {server.name}
                    </span>
                    <span className="text-[10px] font-mono font-bold uppercase px-1.5 py-0.2 rounded bg-cyan-950/80 text-cyan-300 border border-cyan-800/40 shrink-0">
                      {server.protocol}
                    </span>
                    {server.tls === 'reality' && (
                      <span className="text-[10px] font-mono font-bold uppercase px-1.5 py-0.2 rounded bg-purple-950/80 text-purple-300 border border-purple-800/40 shrink-0">
                        REALITY
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] font-mono text-slate-400 truncate mt-0.5">
                    {server.server}:{server.port} • Engine: {server.core}
                  </div>
                </div>
              </div>

              {/* Latency & Actions on right */}
              <div className="flex items-center gap-4 shrink-0">
                <div className="text-right">
                  <div className="text-xs font-mono font-semibold flex items-center gap-1 justify-end">
                    <Wifi className="w-3 h-3 text-slate-500" />
                    {server.latency && server.latency > 0 ? (
                      <span className={server.latency < 80 ? 'text-emerald-400' : server.latency < 160 ? 'text-amber-400' : 'text-red-400'}>
                        {server.latency} ms
                      </span>
                    ) : (
                      <span className="text-slate-500">—</span>
                    )}
                  </div>
                  <span className="text-[10px] text-slate-500">RTT</span>
                </div>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(server.id);
                  }}
                  className="p-1.5 rounded-lg text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                  title="Remove Server"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="p-12 text-center border border-dashed border-slate-800 rounded-2xl space-y-2">
            <Server className="w-8 h-8 text-slate-600 mx-auto" />
            <h4 className="text-xs font-semibold text-slate-400">No servers found</h4>
            <p className="text-[11px] text-slate-500">
              Import a link, or visit the Free Sources tab to automatically discover free public endpoints.
            </p>
          </div>
        )}
      </div>

      {/* Add Server Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-5 space-y-4 shadow-2xl">
            <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              <Plus className="w-4 h-4 text-cyan-400" />
              Import VPN Configuration URI
            </h3>
            <p className="text-xs text-slate-400">
              Paste any standard link (vless://, vmess://, trojan://, ss://, hy2://, wireguard://):
            </p>
            <textarea
              rows={4}
              value={manualUri}
              onChange={(e) => setManualUri(e.target.value)}
              placeholder="vless://d3b07384... or ss://... or hysteria2://..."
              className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-slate-200 hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={handleImportUri}
                className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 rounded-xl text-xs font-bold shadow-[0_0_12px_rgba(0,229,255,0.3)]"
              >
                Import Node
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
