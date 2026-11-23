import React, { useState } from 'react';
import { 
  Server, 
  Search, 
  RefreshCw, 
  Plus, 
  Star, 
  Trash2, 
  Zap, 
  Check, 
  Copy,
  Wifi,
  Share2,
  Globe2,
  Sparkles,
  ExternalLink,
  ShieldAlert
} from 'lucide-react';
import { VpnServerConfig } from '../../../shared/types';
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
  const [isGeneratingWarp, setIsGeneratingWarp] = useState(false);
  const [isFetchingAutoSub, setIsFetchingAutoSub] = useState(false);

  // Clean IP Scanner Modal State
  const [showScannerModal, setShowScannerModal] = useState(false);
  const [isScanningIps, setIsScanningIps] = useState(false);
  const [cleanIps, setCleanIps] = useState<any[]>([]);

  // Export Toast / State
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  const protocols: { id: string; label: string }[] = [
    { id: 'all', label: 'همه پروتکل‌ها (All)' },
    { id: 'vless', label: 'VLESS Reality' },
    { id: 'hysteria2', label: 'Hysteria 2' },
    { id: 'wireguard', label: 'WireGuard / WARP' },
    { id: 'vmess', label: 'VMess' },
    { id: 'trojan', label: 'Trojan' },
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
      alert('فرمت لینک نامعتبر است. فرمت‌های پشتیبانی شده: vless://, vmess://, trojan://, ss://, hy2://, wireguard://');
    }
  };

  // Generate Free Cloudflare WARP Profile
  const handleGenerateWarp = async (cleanIp?: string) => {
    setIsGeneratingWarp(true);
    try {
      const warp = await api.generateWarp(cleanIp);
      await api.saveServer(warp);
      onSelectServer(warp);
      onRefreshServers();
      setExportNotice('⚡ کانفیگ WireGuard کلودفلر WARP با موفقیت ساخته شد و به لیست سرورها اضافه گردید!');
      setTimeout(() => setExportNotice(null), 4000);
      if (showScannerModal) setShowScannerModal(false);
    } catch (err: any) {
      alert(`خطا در ایجاد اکانت WARP: ${err.message}`);
    } finally {
      setIsGeneratingWarp(false);
    }
  };

  // Scan Clean IPs
  const handleStartScanCleanIps = async () => {
    setIsScanningIps(true);
    try {
      const results = await api.scanCleanIps();
      setCleanIps(results);
    } catch (err: any) {
      alert(`خطا در اسکن آی‌پی: ${err.message}`);
    } finally {
      setIsScanningIps(false);
    }
  };

  // Fetch 600+ Real Live Servers
  const handleFetchAutoSub = async () => {
    setIsFetchingAutoSub(true);
    try {
      const added = await api.fetchAutoSub();
      onRefreshServers();
      setExportNotice(`✅ ${added.length || 'ده‌ها'} سرور فعال و واقعی با موفقیت از منابع عمومی دریافت شد!`);
      setTimeout(() => setExportNotice(null), 5000);
    } catch (err: any) {
      alert(`خطا در دریافت سرورها: ${err.message}`);
    } finally {
      setIsFetchingAutoSub(false);
    }
  };

  // Export Subscription
  const handleExportSubscription = async () => {
    try {
      const b64 = await api.exportServers();
      await navigator.clipboard.writeText(b64);
      setExportNotice('📋 لینک سابسکریپشن تمام سرورها در کلیپ‌بورد کپی شد (Base64 URL Exporter).');
      setTimeout(() => setExportNotice(null), 4000);
    } catch {
      alert('خطا در کپی سابسکریپشن');
    }
  };

  return (
    <div className="space-y-5">
      {/* Toast Notification */}
      {exportNotice && (
        <div className="p-3 bg-cyan-950/90 border border-cyan-500 text-cyan-200 rounded-xl text-xs font-semibold flex items-center justify-between shadow-[0_0_20px_rgba(0,229,255,0.25)] animate-in fade-in">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-cyan-400" />
            <span>{exportNotice}</span>
          </div>
          <button onClick={() => setExportNotice(null)} className="text-cyan-400 hover:text-white text-xs px-2">✕</button>
        </div>
      )}

      {/* Top Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-900/40 border border-slate-800/80 rounded-2xl p-4 backdrop-blur-md">
        {/* Search Input */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="جستجوی سرور بر اساس نام، هاست، کشور..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/60"
          />
        </div>

        {/* Action Buttons */}
        <div className="flex items-center flex-wrap gap-2">
          <button
            onClick={handlePingAll}
            disabled={isPingingAll || filtered.length === 0}
            className="flex items-center gap-2 px-3 py-2 bg-slate-800/80 hover:bg-slate-700/80 text-cyan-400 rounded-xl text-xs font-semibold border border-slate-700 transition-all disabled:opacity-50"
            title="تست پینگ همه سرورها"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isPingingAll ? 'animate-spin' : ''}`} />
            <span>{isPingingAll ? 'در حال تست پینگ...' : 'تست پینگ همه'}</span>
          </button>

          <button
            onClick={handleFetchAutoSub}
            disabled={isFetchingAutoSub}
            className="flex items-center gap-2 px-3.5 py-2 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 rounded-xl text-xs font-bold transition-all shadow-[0_0_12px_rgba(16,185,129,0.15)] disabled:opacity-50"
            title="دریافت صدها سرور فعال و واقعی از منابع معتبر"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isFetchingAutoSub ? 'animate-spin' : 'text-emerald-400'}`} />
            <span>{isFetchingAutoSub ? 'در حال دریافت ۶۰۰+ سرور...' : '🔄 دریافت ۶۰۰+ کانفیگ فعال'}</span>
          </button>

          <button
            onClick={() => handleGenerateWarp()}
            disabled={isGeneratingWarp}
            className="flex items-center gap-2 px-3.5 py-2 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded-xl text-xs font-bold transition-all shadow-[0_0_12px_rgba(245,158,11,0.15)] disabled:opacity-50"
            title="ساخت اکانت رایگان Cloudflare WARP بدون نیاز به ثبت نام"
          >
            <Zap className={`w-3.5 h-3.5 ${isGeneratingWarp ? 'animate-spin' : 'text-amber-400'}`} />
            <span>{isGeneratingWarp ? 'در حال ایجاد WARP...' : '⚡ ساخت WARP رایگان'}</span>
          </button>

          <button
            onClick={() => {
              setShowScannerModal(true);
              if (cleanIps.length === 0) handleStartScanCleanIps();
            }}
            className="flex items-center gap-2 px-3 py-2 bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/40 rounded-xl text-xs font-bold transition-all shadow-[0_0_12px_rgba(168,85,247,0.15)]"
            title="یافتن سریع‌ترین آی‌پی‌های بدون فیلتر کلودفلر"
          >
            <Globe2 className="w-3.5 h-3.5 text-purple-400" />
            <span>🌐 اسکنر آی‌پی تمیز</span>
          </button>

          <button
            onClick={handleExportSubscription}
            className="flex items-center gap-2 px-3 py-2 bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 border border-slate-700 rounded-xl text-xs font-semibold transition-all"
            title="خروجی سابسکریپشن Base64 از تمام سرورهای شما"
          >
            <Share2 className="w-3.5 h-3.5 text-cyan-400" />
            <span>خروجی سابسکریپشن</span>
          </button>

          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-3.5 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 rounded-xl text-xs font-bold transition-all shadow-[0_0_15px_rgba(0,229,255,0.3)]"
          >
            <Plus className="w-4 h-4" />
            <span>افزودن کانفیگ</span>
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
                  title="حذف این سرور"
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
            <h4 className="text-xs font-semibold text-slate-400">هیچ سروری یافت نشد</h4>
            <p className="text-[11px] text-slate-500">
              یک لینک وارد کنید، یا روی «⚡ ساخت WARP رایگان» کلیک کنید، یا از تب منابع رایگان (Free Sources) هزاران سرور دریافت کنید.
            </p>
          </div>
        )}
      </div>

      {/* Clean IP Scanner Modal */}
      {showScannerModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl p-5 space-y-4 shadow-2xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Globe2 className="w-5 h-5 text-purple-400" />
                <h3 className="text-sm font-bold text-slate-100">اسکنر آی‌پی تمیز کلودفلر (ضد فیلتر)</h3>
              </div>
              <button
                onClick={handleStartScanCleanIps}
                disabled={isScanningIps}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-500 hover:bg-purple-400 text-slate-950 font-bold rounded-xl text-xs transition-all disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isScanningIps ? 'animate-spin' : ''}`} />
                <span>{isScanningIps ? 'در حال تست تاخیر...' : 'اسکن مجدد'}</span>
              </button>
            </div>

            <p className="text-xs text-slate-400">
              آی‌پی‌های تمیز زیر دارای کمترین تاخیر و بدون پکت‌لاس در شبکه ایران هستند. با کلیک بر روی هر آی‌پی می‌توانید مستقیماً با آن کانفیگ WARP تولید کنید یا آن را کپی نمایید:
            </p>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
              {cleanIps.map((node, i) => (
                <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-slate-950/80 border border-slate-800 hover:border-purple-500/50 transition-all">
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-full bg-slate-800 text-[10px] font-mono font-bold flex items-center justify-center text-slate-400">
                      {i + 1}
                    </span>
                    <div>
                      <div className="text-xs font-mono font-bold text-slate-200">{node.ip}</div>
                      <div className="text-[10px] text-slate-500">Cloudflare Edge CDN Node</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      {node.latencyMs > 0 ? (
                        <span className={`text-xs font-mono font-bold ${node.latencyMs < 80 ? 'text-emerald-400' : 'text-amber-400'}`}>
                          {node.latencyMs} ms
                        </span>
                      ) : (
                        <span className="text-xs font-mono text-red-400">تایم‌اوت</span>
                      )}
                    </div>

                    <button
                      onClick={() => handleGenerateWarp(node.ip)}
                      disabled={isGeneratingWarp}
                      className="px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded-lg text-[11px] font-bold transition-all"
                      title="ساخت پروفایل WARP با این آی‌پی"
                    >
                      ساخت WARP
                    </button>

                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(node.ip);
                        setExportNotice(`آی‌پی ${node.ip} کپی شد.`);
                        setTimeout(() => setExportNotice(null), 3000);
                      }}
                      className="p-1 rounded-lg text-slate-400 hover:text-cyan-400 hover:bg-slate-800"
                      title="کپی آی‌پی"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-800">
              <button
                onClick={() => setShowScannerModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-slate-200 hover:bg-slate-800"
              >
                بستن پنجره
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Server Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-5 space-y-4 shadow-2xl">
            <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              <Plus className="w-4 h-4 text-cyan-400" />
              ورود دستی لینک کانفیگ VPN
            </h3>
            <p className="text-xs text-slate-400">
              لینک کانفیگ خود را وارد کنید (پشتیبانی از vless://, vmess://, trojan://, ss://, hy2://, wireguard://):
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
                انصراف
              </button>
              <button
                onClick={handleImportUri}
                className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 rounded-xl text-xs font-bold shadow-[0_0_12px_rgba(0,229,255,0.3)]"
              >
                افزودن به لیست
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
