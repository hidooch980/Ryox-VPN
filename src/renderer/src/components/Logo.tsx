import React from 'react';

interface LogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showText?: boolean;
}

export const Logo: React.FC<LogoProps> = ({ size = 'md', showText = true }) => {
  const sizeMap = {
    sm: { box: 'w-7 h-7', text: 'text-base', sub: 'text-[9px]' },
    md: { box: 'w-9 h-9', text: 'text-xl', sub: 'text-[10px]' },
    lg: { box: 'w-14 h-14', text: 'text-3xl', sub: 'text-xs' },
    xl: { box: 'w-24 h-24', text: 'text-5xl', sub: 'text-sm' }
  };

  const s = sizeMap[size];

  return (
    <div className="flex items-center gap-3 select-none">
      <div className={`relative ${s.box} flex items-center justify-center`}>
        {/* Glowing backdrop */}
        <div className="absolute inset-0 bg-gradient-to-tr from-cyan-500 via-indigo-500 to-purple-600 rounded-xl blur-[6px] opacity-70 animate-pulse-slow" />
        
        {/* Core emblem container */}
        <div className="relative w-full h-full bg-slate-950 border border-cyan-500/50 rounded-xl flex items-center justify-center shadow-lg shadow-cyan-500/20 overflow-hidden">
          {/* Cyber grid lines in background */}
          <div className="absolute inset-0 bg-[radial-gradient(#00e5ff_1px,transparent_1px)] [background-size:6px_6px] opacity-20" />
          
          {/* Futuristic stylized R Vector */}
          <svg viewBox="0 0 100 100" className="w-[70%] h-[70%] text-cyan-400 drop-shadow-[0_0_8px_rgba(0,229,255,0.8)]" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M25 80V20H55C66.0457 20 75 28.9543 75 40C75 48.8687 69.2486 56.3934 61.2223 58.9805L78 80H62L48 60H39V80H25ZM39 34V46H54C57.3137 46 60 43.3137 60 40C60 36.6863 57.3137 34 54 34H39Z"
              fill="url(#ryoxGradient)"
            />
            {/* Tech nodes / circuit dots */}
            <circle cx="75" cy="40" r="4" fill="#00e5ff" className="animate-ping" />
            <circle cx="78" cy="80" r="3" fill="#a855f7" />
            <defs>
              <linearGradient id="ryoxGradient" x1="20" y1="20" x2="80" y2="80" gradientUnits="userSpaceOnUse">
                <stop stopColor="#00e5ff" />
                <stop offset="0.5" stopColor="#38bdf8" />
                <stop offset="1" stopColor="#818cf8" />
              </linearGradient>
            </defs>
          </svg>
        </div>
      </div>

      {showText && (
        <div className="flex flex-col leading-tight">
          <div className="flex items-center gap-1.5">
            <span className={`font-black tracking-wider ${s.text} bg-gradient-to-r from-cyan-400 via-sky-300 to-indigo-400 bg-clip-text text-transparent font-sans`}>
              RYOX
            </span>
            <span className={`font-semibold tracking-widest ${s.text} text-slate-200`}>
              VPN
            </span>
          </div>
          <span className={`font-mono uppercase tracking-[0.2em] text-cyan-400/80 font-bold ${s.sub}`}>
            100% Free & Open Source
          </span>
        </div>
      )}
    </div>
  );
};
