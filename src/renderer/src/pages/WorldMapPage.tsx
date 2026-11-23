import React, { useState } from 'react';
import { VpnServerConfig } from '../../../shared/types';

interface WorldMapPageProps {
  servers: VpnServerConfig[];
  selectedServer?: VpnServerConfig;
  onSelectServer: (server: VpnServerConfig) => void;
}

// Approximate x,y positions within a 2000x1000 viewBox
const COUNTRY_COORDS: Record<string, [number, number]> = {
  US: [350, 350],
  DE: [950, 280],
  NL: [930, 265],
  FR: [920, 300],
  GB: [890, 260],
  JP: [1650, 330],
  SG: [1550, 500],
  HK: [1620, 400],
  AU: [1620, 650],
  CA: [320, 300],
  TR: [1050, 330],
  IR: [1100, 360],
  RU: [1200, 220],
  CF: [970, 310],
};

const DEFAULT_COORD: [number, number] = [1000, 500];

function getCoord(countryCode?: string): [number, number] {
  if (!countryCode) return DEFAULT_COORD;
  return COUNTRY_COORDS[countryCode.toUpperCase()] ?? DEFAULT_COORD;
}

// SVG continent paths (simplified outlines for decorative background)
const CONTINENTS = {
  northAmerica: 'M180,150 L380,120 L440,200 L420,320 L380,400 L310,420 L250,380 L200,300 L180,220 Z',
  southAmerica: 'M300,440 L380,420 L430,500 L420,620 L370,680 L310,660 L280,580 L270,500 Z',
  europe: 'M850,180 L1000,160 L1050,220 L1020,300 L940,320 L880,290 L850,240 Z',
  africa: 'M900,330 L1020,310 L1060,420 L1040,580 L970,630 L900,580 L870,460 L880,380 Z',
  asia: 'M1050,160 L1500,120 L1700,200 L1750,380 L1650,480 L1500,460 L1300,400 L1100,380 L1050,300 Z',
  oceania: 'M1540,580 L1700,560 L1750,640 L1700,710 L1580,720 L1530,660 Z',
};

export const WorldMapPage: React.FC<WorldMapPageProps> = ({
  servers,
  selectedServer,
  onSelectServer,
}) => {
  const [hoveredServerId, setHoveredServerId] = useState<string | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-4 backdrop-blur-md">
        <h2 className="text-sm font-bold text-slate-100 flex items-center gap-2">
          <span className="text-cyan-400 text-base">🌐</span>
          نقشه جهانی سرورها
        </h2>
        <p className="text-xs text-slate-400 mt-0.5">
          برای اتصال به هر سرور روی نقطه آن کلیک کنید. نقطه طلایی = سرور انتخاب‌شده
        </p>
      </div>

      {/* Map */}
      <div
        className="relative rounded-2xl overflow-hidden border border-slate-800/80"
        style={{ background: '#05070d' }}
      >
        <svg
          viewBox="0 0 2000 1000"
          className="w-full h-auto"
          style={{ display: 'block', minHeight: 320 }}
        >
          {/* Grid lines */}
          <defs>
            <pattern id="grid" width="100" height="100" patternUnits="userSpaceOnUse">
              <path
                d="M 100 0 L 0 0 0 100"
                fill="none"
                stroke="rgba(100,120,160,0.07)"
                strokeWidth="1"
              />
            </pattern>
            <style>{`
              @keyframes svgPulse {
                0%, 100% { opacity: 0.4; r: 6px; }
                50%       { opacity: 1;   r: 10px; }
              }
              .server-dot {
                animation: svgPulse 2.4s ease-in-out infinite;
                cursor: pointer;
              }
              .server-dot.selected {
                animation: none;
              }
            `}</style>
            <filter id="glow-cyan">
              <feGaussianBlur stdDeviation="4" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter id="glow-amber">
              <feGaussianBlur stdDeviation="6" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Background */}
          <rect width="2000" height="1000" fill="#05070d" />
          <rect width="2000" height="1000" fill="url(#grid)" />

          {/* Continent outlines */}
          {Object.values(CONTINENTS).map((d, i) => (
            <path
              key={i}
              d={d}
              fill="rgba(30,50,80,0.25)"
              stroke="rgba(0,229,255,0.08)"
              strokeWidth="1.5"
            />
          ))}

          {/* Latitude/Longitude decorative lines */}
          {[200, 400, 600, 800].map(y => (
            <line key={`lat-${y}`} x1="0" y1={y} x2="2000" y2={y}
              stroke="rgba(100,130,180,0.04)" strokeWidth="1" />
          ))}
          {[400, 800, 1200, 1600].map(x => (
            <line key={`lon-${x}`} x1={x} y1="0" x2={x} y2="1000"
              stroke="rgba(100,130,180,0.04)" strokeWidth="1" />
          ))}

          {/* Server dots */}
          {servers.map((server) => {
            const [cx, cy] = getCoord(server.countryCode);
            const isSelected = selectedServer?.id === server.id;
            const isHovered = hoveredServerId === server.id;
            const fill = isSelected ? '#fbbf24' : '#00e5ff';
            const filter = isSelected ? 'url(#glow-amber)' : 'url(#glow-cyan)';
            const r = isSelected ? 10 : isHovered ? 10 : 7;

            return (
              <g key={server.id}>
                {/* Outer pulse ring */}
                {!isSelected && (
                  <circle
                    cx={cx}
                    cy={cy}
                    r={isHovered ? 18 : 14}
                    fill="none"
                    stroke={fill}
                    strokeWidth="1"
                    opacity="0.2"
                    style={{ transition: 'r 0.2s' }}
                  />
                )}
                {/* Main dot */}
                <circle
                  cx={cx}
                  cy={cy}
                  r={r}
                  fill={fill}
                  filter={filter}
                  className={`server-dot${isSelected ? ' selected' : ''}`}
                  style={{ transition: 'r 0.2s, fill 0.2s' }}
                  onClick={() => onSelectServer(server)}
                  onMouseEnter={(e) => {
                    setHoveredServerId(server.id);
                    const rect = (e.currentTarget.ownerSVGElement as SVGSVGElement)
                      .getBoundingClientRect();
                    const svgW = rect.width;
                    const svgH = rect.height;
                    setTooltipPos({
                      x: (cx / 2000) * svgW,
                      y: (cy / 1000) * svgH,
                    });
                  }}
                  onMouseLeave={() => {
                    setHoveredServerId(null);
                    setTooltipPos(null);
                  }}
                >
                  <title>{`${server.name}${(server.latency ?? 0) > 0 ? ` — ${server.latency}ms` : ''}`}</title>
                </circle>

                {/* Country code label */}
                <text
                  x={cx}
                  y={cy + 20}
                  textAnchor="middle"
                  fill={isSelected ? '#fbbf24' : 'rgba(0,229,255,0.65)'}
                  fontSize="11"
                  fontFamily="monospace"
                  fontWeight="bold"
                  style={{ pointerEvents: 'none', userSelect: 'none' }}
                >
                  {server.countryCode || '??'}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Floating tooltip */}
        {hoveredServerId && tooltipPos && (() => {
          const srv = servers.find(s => s.id === hoveredServerId);
          if (!srv) return null;
          return (
            <div
              className="absolute z-10 pointer-events-none bg-slate-900/95 border border-cyan-500/30 rounded-lg px-3 py-2 text-xs shadow-xl"
              style={{
                left: tooltipPos.x + 14,
                top: tooltipPos.y - 36,
                transform: 'translateY(-50%)',
                whiteSpace: 'nowrap',
              }}
            >
              <div className="font-bold text-cyan-300">{srv.name}</div>
              {srv.latency != null && srv.latency > 0 && (
                <div className="text-slate-400 mt-0.5">
                  تأخیر: <span className={`font-mono ${srv.latency < 100 ? 'text-emerald-400' : srv.latency < 200 ? 'text-amber-400' : 'text-red-400'}`}>{srv.latency} ms</span>
                </div>
              )}
              {srv.protocol && (
                <div className="text-slate-500 text-[10px] mt-0.5 uppercase font-mono">{srv.protocol}</div>
              )}
            </div>
          );
        })()}
      </div>

      {/* Server list legend */}
      <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-4 backdrop-blur-md">
        <div className="text-xs font-mono font-bold tracking-wider text-slate-400 uppercase mb-3">
          فهرست سرورها روی نقشه
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {servers.map(server => {
            const isSelected = selectedServer?.id === server.id;
            return (
              <button
                key={server.id}
                onClick={() => onSelectServer(server)}
                className={`flex items-center gap-2 p-2 rounded-lg border text-xs text-left transition-all ${
                  isSelected
                    ? 'bg-amber-950/30 border-amber-500/40 text-amber-300'
                    : 'bg-slate-900/40 border-slate-800 text-slate-300 hover:border-cyan-500/30 hover:text-cyan-300'
                }`}
              >
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${isSelected ? 'bg-amber-400' : 'bg-cyan-400'}`} />
                <span className="truncate">{server.name}</span>
                {server.latency != null && server.latency > 0 && (
                  <span className={`ml-auto font-mono flex-shrink-0 ${
                    server.latency < 100 ? 'text-emerald-400' : server.latency < 200 ? 'text-amber-400' : 'text-red-400'
                  }`}>{server.latency}ms</span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
