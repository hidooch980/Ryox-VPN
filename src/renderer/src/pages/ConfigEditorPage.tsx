import React, { useState, useEffect } from 'react';
import { FileCode, Copy, Check, Shield, RefreshCw } from 'lucide-react';
import { VpnServerConfig, AppSettings } from '../../../shared/types';
import { SingBoxAdapter } from '../../../main/core/adapters/SingBoxAdapter';
import { XrayAdapter } from '../../../main/core/adapters/XrayAdapter';
import { MihomoAdapter } from '../../../main/core/adapters/MihomoAdapter';

interface ConfigEditorPageProps {
  selectedServer?: VpnServerConfig;
  settings: AppSettings;
}

export const ConfigEditorPage: React.FC<ConfigEditorPageProps> = ({ selectedServer, settings }) => {
  const [activeTab, setActiveTab] = useState<'sing-box' | 'xray' | 'mihomo'>('sing-box');
  const [configText, setConfigText] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!selectedServer) {
      setConfigText('// No server selected. Please choose a node in the Servers tab.');
      return;
    }

    try {
      if (activeTab === 'sing-box') {
        const obj = SingBoxAdapter.generateConfig(selectedServer, settings);
        setConfigText(JSON.stringify(obj, null, 2));
      } else if (activeTab === 'xray') {
        const obj = XrayAdapter.generateConfig(selectedServer, settings);
        setConfigText(JSON.stringify(obj, null, 2));
      } else if (activeTab === 'mihomo') {
        const yamlStr = MihomoAdapter.generateConfig(selectedServer, settings);
        setConfigText(yamlStr);
      }
    } catch (e: any) {
      setConfigText(`// Error compiling config: ${e.message}`);
    }
  }, [selectedServer, settings, activeTab]);

  const handleCopy = () => {
    navigator.clipboard.writeText(configText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between bg-slate-900/40 border border-slate-800/80 rounded-2xl p-4 backdrop-blur-md">
        <div>
          <h2 className="text-sm font-bold text-slate-100 flex items-center gap-2">
            <FileCode className="w-4 h-4 text-cyan-400" />
            Live Configuration Compiler & Inspector
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Inspect real-time generated runtime JSON/YAML configs for sing-box, Xray-core, or Mihomo
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800">
            {(['sing-box', 'xray', 'mihomo'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-3 py-1 rounded-lg text-xs font-mono font-medium transition-all ${
                  activeTab === tab
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {tab.toUpperCase()}
              </button>
            ))}
          </div>

          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold border border-slate-700 transition-colors"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>
        </div>
      </div>

      <div className="relative rounded-2xl border border-slate-800 bg-slate-950/90 overflow-hidden">
        <textarea
          rows={22}
          value={configText}
          onChange={(e) => setConfigText(e.target.value)}
          className="w-full p-4 font-mono text-xs text-cyan-300/90 bg-transparent focus:outline-none resize-none leading-relaxed"
          spellCheck={false}
        />
      </div>
    </div>
  );
};
