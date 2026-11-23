import React from 'react';
import { 
  LayoutDashboard, 
  Server, 
  Rss, 
  Globe2, 
  Cpu, 
  Layers, 
  FileCode, 
  GitFork, 
  Network, 
  Split, 
  Activity, 
  Terminal, 
  RefreshCw, 
  DownloadCloud, 
  Palette, 
  Settings, 
  Info,
  ExternalLink
} from 'lucide-react';
import { Logo } from './Logo';

export type PageId = 
  | 'dashboard'
  | 'servers'
  | 'subscriptions'
  | 'free-sources'
  | 'core-manager'
  | 'protocol-manager'
  | 'config-editor'
  | 'routing'
  | 'dns'
  | 'split-tunneling'
  | 'diagnostics'
  | 'logs'
  | 'app-updates'
  | 'core-updates'
  | 'appearance'
  | 'settings'
  | 'about';

interface SidebarProps {
  activePage: PageId;
  onSelectPage: (page: PageId) => void;
  serverCount: number;
}

export const Sidebar: React.FC<SidebarProps> = ({ activePage, onSelectPage, serverCount }) => {
  const navSections = [
    {
      title: 'OVERVIEW',
      items: [
        { id: 'dashboard' as PageId, label: 'Dashboard', icon: LayoutDashboard },
        { id: 'servers' as PageId, label: 'Servers', icon: Server, badge: serverCount },
        { id: 'subscriptions' as PageId, label: 'Subscriptions', icon: Rss },
        { id: 'free-sources' as PageId, label: 'Free Sources', icon: Globe2 }
      ]
    },
    {
      title: 'ENGINE & PROTOCOLS',
      items: [
        { id: 'core-manager' as PageId, label: 'Core Manager', icon: Cpu },
        { id: 'protocol-manager' as PageId, label: 'Protocols', icon: Layers },
        { id: 'config-editor' as PageId, label: 'Config Editor', icon: FileCode }
      ]
    },
    {
      title: 'NETWORKING & SECURITY',
      items: [
        { id: 'routing' as PageId, label: 'Routing Rules', icon: GitFork },
        { id: 'dns' as PageId, label: 'DNS Settings', icon: Network },
        { id: 'split-tunneling' as PageId, label: 'Split Tunneling', icon: Split },
        { id: 'diagnostics' as PageId, label: 'Diagnostics', icon: Activity },
        { id: 'logs' as PageId, label: 'Live Logs', icon: Terminal }
      ]
    },
    {
      title: 'UPDATES & SYSTEM',
      items: [
        { id: 'app-updates' as PageId, label: 'App Updates', icon: RefreshCw },
        { id: 'core-updates' as PageId, label: 'Core Updates', icon: DownloadCloud },
        { id: 'appearance' as PageId, label: 'Appearance', icon: Palette },
        { id: 'settings' as PageId, label: 'Settings', icon: Settings },
        { id: 'about' as PageId, label: 'About Ryox', icon: Info }
      ]
    }
  ];

  return (
    <aside className="w-64 bg-slate-950/90 border-r border-slate-800/80 flex flex-col justify-between select-none">
      {/* Top Branding Section */}
      <div className="p-4 border-b border-slate-800/80">
        <Logo size="md" />
      </div>

      {/* Navigation Links Scrollable List */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4 custom-scrollbar">
        {navSections.map((sec, idx) => (
          <div key={idx}>
            <div className="px-3 mb-1 text-[10px] font-mono font-bold tracking-widest text-slate-500 uppercase">
              {sec.title}
            </div>
            <div className="space-y-0.5">
              {sec.items.map((item) => {
                const Icon = item.icon;
                const isActive = activePage === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => onSelectPage(item.id)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all duration-200 group ${
                      isActive
                        ? 'bg-gradient-to-r from-cyan-500/15 to-transparent border-l-2 border-cyan-400 text-cyan-300 font-semibold shadow-inner'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <Icon className={`w-4 h-4 transition-colors ${
                        isActive ? 'text-cyan-400 drop-shadow-[0_0_6px_#00e5ff]' : 'text-slate-500 group-hover:text-slate-300'
                      }`} />
                      <span>{item.label}</span>
                    </div>

                    {item.badge !== undefined && (
                      <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full ${
                        isActive ? 'bg-cyan-500/20 text-cyan-300' : 'bg-slate-800 text-slate-400'
                      }`}>
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Bottom Footer Badge */}
      <div className="p-3 border-t border-slate-800/80 bg-slate-950/60 flex items-center justify-between text-[11px] text-slate-400">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="font-mono text-[10px]">100% Free Core</span>
        </div>
        <a 
          href="https://github.com/hidooch980/Ryox-VPN" 
          target="_blank" 
          rel="noreferrer"
          className="text-slate-500 hover:text-cyan-400 flex items-center gap-1 transition-colors"
          title="GitHub Repository"
        >
          <span className="text-[10px] font-mono">GitHub</span>
          <ExternalLink className="w-3 h-3" />
        </a>
      </div>
    </aside>
  );
};
