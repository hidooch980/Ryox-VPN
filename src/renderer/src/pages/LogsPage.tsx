import React, { useState } from 'react';
import { Terminal, Trash2, Copy, Check, Filter } from 'lucide-react';
import { LogEntry } from '../../../shared/types';

interface LogsPageProps {
  logs: LogEntry[];
  onClearLogs: () => void;
}

export const LogsPage: React.FC<LogsPageProps> = ({ logs, onClearLogs }) => {
  const [levelFilter, setLevelFilter] = useState<string>('ALL');
  const [copied, setCopied] = useState(false);

  const filtered = logs.filter(l => levelFilter === 'ALL' || l.level === levelFilter);

  const handleCopy = () => {
    const text = logs.map(l => `[${new Date(l.timestamp).toLocaleTimeString()}] [${l.level}] [${l.source}]: ${l.message}`).join('\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between bg-slate-900/40 border border-slate-800/80 rounded-2xl p-4 backdrop-blur-md">
        <div>
          <h2 className="text-sm font-bold text-slate-100 flex items-center gap-2">
            <Terminal className="w-4 h-4 text-cyan-400" />
            Live Tunnel & Core Process Logs
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Real-time diagnostic stream from active proxy cores, TUN drivers, and connection state machine
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Level Filter */}
          <select
            value={levelFilter}
            onChange={(e) => setLevelFilter(e.target.value)}
            className="px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono text-slate-300 focus:outline-none focus:border-cyan-500"
          >
            <option value="ALL">ALL LEVELS</option>
            <option value="INFO">INFO</option>
            <option value="WARN">WARN</option>
            <option value="ERROR">ERROR</option>
            <option value="DEBUG">DEBUG</option>
          </select>

          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold border border-slate-700 transition-colors"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>

          <button
            onClick={onClearLogs}
            className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-colors"
            title="Clear Console"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Terminal Viewport */}
      <div className="rounded-2xl border border-slate-800 bg-slate-950/95 p-4 font-mono text-xs h-[480px] overflow-y-auto custom-scrollbar space-y-1.5">
        {filtered.map((log) => {
          const colorMap = {
            INFO: 'text-cyan-400',
            WARN: 'text-amber-400',
            ERROR: 'text-red-400 font-bold',
            DEBUG: 'text-slate-500'
          };

          return (
            <div key={log.id} className="leading-relaxed hover:bg-slate-900/40 px-1 rounded flex items-start gap-2">
              <span className="text-slate-600 select-none shrink-0">
                [{new Date(log.timestamp).toLocaleTimeString()}]
              </span>
              <span className={`font-bold select-none shrink-0 ${colorMap[log.level]}`}>
                [{log.level}]
              </span>
              <span className="text-purple-400 select-none shrink-0">
                [{log.source}]:
              </span>
              <span className="text-slate-300 break-all">
                {log.message}
              </span>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="text-slate-600 text-center py-20">
            No log entries matching filter.
          </div>
        )}
      </div>
    </div>
  );
};
