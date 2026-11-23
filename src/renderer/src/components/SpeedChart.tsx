import React, { useEffect, useRef } from 'react';

interface SpeedChartProps {
  uploadSpeed: number; // bytes/sec
  downloadSpeed: number; // bytes/sec
  maxPoints?: number;
}

export const SpeedChart: React.FC<SpeedChartProps> = ({ uploadSpeed, downloadSpeed, maxPoints = 30 }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const historyRef = useRef<{ dl: number[]; ul: number[] }>({
    dl: new Array(maxPoints).fill(0),
    ul: new Array(maxPoints).fill(0)
  });

  useEffect(() => {
    // Push new data points
    const hist = historyRef.current;
    hist.dl.push(downloadSpeed);
    if (hist.dl.length > maxPoints) hist.dl.shift();

    hist.ul.push(uploadSpeed);
    if (hist.ul.length > maxPoints) hist.ul.shift();

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);

    // Subtle background grid
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.lineWidth = 1;
    for (let y = 0; y < height; y += 25) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Max scale calculation
    const maxVal = Math.max(1024 * 100, ...hist.dl, ...hist.ul);

    // Helper to draw a glowing path
    const drawLine = (data: number[], color: string, glowColor: string) => {
      ctx.save();
      ctx.strokeStyle = color;
      ctx.shadowColor = glowColor;
      ctx.shadowBlur = 8;
      ctx.lineWidth = 2;
      ctx.beginPath();

      const step = width / (maxPoints - 1);
      data.forEach((val, i) => {
        const x = i * step;
        const y = height - (val / maxVal) * (height - 10) - 5;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });

      ctx.stroke();
      ctx.restore();
    };

    // Draw Download (Cyan)
    drawLine(hist.dl, '#00e5ff', 'rgba(0, 229, 255, 0.8)');
    // Draw Upload (Purple)
    drawLine(hist.ul, '#a855f7', 'rgba(168, 85, 247, 0.8)');

  }, [uploadSpeed, downloadSpeed, maxPoints]);

  return (
    <div className="w-full h-24 bg-slate-950/60 rounded-xl border border-slate-800/80 p-2 relative overflow-hidden flex flex-col justify-between">
      <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 z-10">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 text-cyan-400">
            <span className="w-2 h-2 rounded-full bg-cyan-400 inline-block shadow-[0_0_6px_#00e5ff]" />
            DL: {(downloadSpeed / 1024).toFixed(1)} KB/s
          </span>
          <span className="flex items-center gap-1.5 text-purple-400">
            <span className="w-2 h-2 rounded-full bg-purple-400 inline-block shadow-[0_0_6px_#a855f7]" />
            UL: {(uploadSpeed / 1024).toFixed(1)} KB/s
          </span>
        </div>
        <span className="text-slate-500">Live Throughput</span>
      </div>
      <canvas
        ref={canvasRef}
        width={380}
        height={70}
        className="w-full h-full absolute inset-0 pt-6"
      />
    </div>
  );
};
