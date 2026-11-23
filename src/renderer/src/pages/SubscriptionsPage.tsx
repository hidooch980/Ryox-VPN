import React, { useState } from 'react';
import { Rss, Plus, RefreshCw, Trash2, Clock, CheckCircle2, AlertCircle, ExternalLink } from 'lucide-react';
import { Subscription } from '../../../shared/types';
import { api } from '../api/client';

interface SubscriptionsPageProps {
  subscriptions: Subscription[];
  onRefresh: () => void;
}

export const SubscriptionsPage: React.FC<SubscriptionsPageProps> = ({ subscriptions, onRefresh }) => {
  const [showAddModal, setShowAddModal] = useState(false);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [interval, setInterval] = useState(12);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const handleAdd = async () => {
    if (!url.trim()) return;
    await api.addSubscription(name.trim() || 'My Subscription', url.trim(), interval);
    setName('');
    setUrl('');
    setShowAddModal(false);
    onRefresh();
  };

  const handleUpdate = async (id: string) => {
    setUpdatingId(id);
    await api.updateSubscription(id);
    setUpdatingId(null);
    onRefresh();
  };

  const handleDelete = async (id: string) => {
    await api.removeSubscription(id);
    onRefresh();
  };

  return (
    <div className="space-y-5">
      {/* Header Bar */}
      <div className="flex items-center justify-between bg-slate-900/40 border border-slate-800/80 rounded-2xl p-4 backdrop-blur-md">
        <div>
          <h2 className="text-sm font-bold text-slate-100 flex items-center gap-2">
            <Rss className="w-4 h-4 text-cyan-400" />
            Subscription Manager
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Manage remote VPN subscription URLs (Base64, Clash YAML, sing-box JSON)
          </p>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-3.5 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 rounded-xl text-xs font-bold transition-all shadow-[0_0_15px_rgba(0,229,255,0.3)]"
        >
          <Plus className="w-4 h-4" />
          <span>Add Subscription</span>
        </button>
      </div>

      {/* Subscription Cards */}
      <div className="grid grid-cols-1 gap-3">
        {subscriptions.map((sub) => (
          <div
            key={sub.id}
            className="p-4 rounded-xl border border-slate-800/80 bg-slate-900/40 hover:bg-slate-900/60 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
          >
            <div className="space-y-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-xs text-slate-100">{sub.name}</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-cyan-400 border border-slate-700">
                  {sub.serverCount} servers
                </span>
                {sub.error ? (
                  <span className="text-[10px] text-red-400 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" /> Error fetching
                  </span>
                ) : (
                  <span className="text-[10px] text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Active
                  </span>
                )}
              </div>
              <div className="text-[11px] font-mono text-slate-400 truncate max-w-xl">
                {sub.url}
              </div>
              <div className="text-[10px] text-slate-500 flex items-center gap-3">
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  Every {sub.updateIntervalHours}h
                </span>
                {sub.lastUpdated && (
                  <span>Last synced: {new Date(sub.lastUpdated).toLocaleTimeString()}</span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => handleUpdate(sub.id)}
                disabled={updatingId === sub.id}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium border border-slate-700 transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${updatingId === sub.id ? 'animate-spin text-cyan-400' : ''}`} />
                <span>{updatingId === sub.id ? 'Updating...' : 'Sync Now'}</span>
              </button>
              <button
                onClick={() => handleDelete(sub.id)}
                className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                title="Remove Subscription"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}

        {subscriptions.length === 0 && (
          <div className="p-12 text-center border border-dashed border-slate-800 rounded-2xl space-y-2">
            <Rss className="w-8 h-8 text-slate-600 mx-auto" />
            <h4 className="text-xs font-semibold text-slate-400">No subscriptions configured</h4>
            <p className="text-[11px] text-slate-500">
              Add your subscription URL above to import a full batch of servers.
            </p>
          </div>
        )}
      </div>

      {/* Add Subscription Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-5 space-y-4 shadow-2xl">
            <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              <Plus className="w-4 h-4 text-cyan-400" />
              Add VPN Subscription
            </h3>

            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-mono text-slate-400 block mb-1">Subscription Name</label>
                <input
                  type="text"
                  placeholder="e.g. My Fast Reality Provider"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="text-[11px] font-mono text-slate-400 block mb-1">Subscription URL</label>
                <input
                  type="url"
                  placeholder="https://example.com/sub/v2ray or raw github link"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="text-[11px] font-mono text-slate-400 block mb-1">Auto-Update Interval (Hours)</label>
                <select
                  value={interval}
                  onChange={(e) => setInterval(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
                >
                  <option value={1}>Every 1 hour</option>
                  <option value={6}>Every 6 hours</option>
                  <option value={12}>Every 12 hours</option>
                  <option value={24}>Every 24 hours</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-slate-200 hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={handleAdd}
                className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 rounded-xl text-xs font-bold shadow-[0_0_12px_rgba(0,229,255,0.3)]"
              >
                Save Subscription
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
