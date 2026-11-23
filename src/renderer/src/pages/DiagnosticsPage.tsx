import React, { useState } from 'react';
import { 
  Activity, 
  ShieldCheck, 
  Wifi, 
  Globe, 
  Server, 
  CheckCircle2, 
  HelpCircle,
  AlertTriangle,
  RefreshCw, 
  Gauge, 
  ArrowDownCircle, 
  Timer, 
  HardDrive 
} from 'lucide-react';
import { DiagnosticsResult } from '../../../shared/types';
import { api } from '../api/client';

export const DiagnosticsPage: React.FC = () => {
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<DiagnosticsResult | null>(null);

  // Speed test state
  const [isSpeedTesting, setIsSpeedTesting] = useState(false);
  const [speedResult, setSpeedResult] = useState<any | null>(null);

  const handleRun = async () => {
    setIsRunning(true);
    try {
      const res = await api.runDiagnostics();
      setResult(res);
    } finally {
      setIsRunning(false);
    }
  };

  const handleRunSpeedTest = async () => {
    setIsSpeedTesting(true);
    try {
      const speed = await api.testDownloadSpeed();
      setSpeedResult(speed);
    } catch (err: any) {
      alert(`خطا در تست سرعت: ${err.message}`);
    } finally {
      setIsSpeedTesting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Diagnostics Header */}
      <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-4 backdrop-blur-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-bold text-slate-100 flex items-center gap-2">
            <Activity className="w-4 h-4 text-cyan-400" />
            عیب‌یابی شبکه و تست امنیت تونل (Diagnostics & Security Audit)
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            تست یکپارچگی کپسوله‌سازی تونل، پکت‌های TCP، عدم نشت DNS و درایور Wintun
          </p>
        </div>

        <button
          onClick={handleRun}
          disabled={isRunning}
          className="flex items-center gap-2 px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 rounded-xl text-xs font-bold transition-all shadow-[0_0_15px_rgba(0,229,255,0.3)] disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRunning ? 'animate-spin' : ''}`} />
          <span>{isRunning ? 'در حال عیب‌یابی...' : 'اجرای عیب‌یابی'}</span>
        </button>
      </div>

      {/* Real Speed Test Section */}
      <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-5 backdrop-blur-md space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
          <div className="flex items-center gap-2.5">
            <Gauge className="w-5 h-5 text-emerald-400" />
            <div>
              <h3 className="text-sm font-bold text-slate-100">تست واقعی سرعت دانلود (Real HTTP Download Speedtest)</h3>
              <p className="text-xs text-slate-400">تست دانلود زنده بسته‌های رمزنگاری‌شده از طریق تونل VPN و محاسبه پهنای باند واقعی بر حسب مگابیت بر ثانیه</p>
            </div>
          </div>

          <button
            onClick={handleRunSpeedTest}
            disabled={isSpeedTesting}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl text-xs transition-all shadow-[0_0_15px_rgba(16,185,129,0.3)] disabled:opacity-50 shrink-0"
          >
            <ArrowDownCircle className={`w-4 h-4 ${isSpeedTesting ? 'animate-bounce' : ''}`} />
            <span>{isSpeedTesting ? 'در حال تست دانلود...' : 'شروع تست سرعت واقعی'}</span>
          </button>
        </div>

        {speedResult && speedResult.measured === false ? (
          <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 p-3.5 text-xs text-amber-300 leading-relaxed">
            اندازه‌گیری سرعت دانلود ناموفق بود
            {speedResult.reason ? ` (${speedResult.reason})` : ''}. عددی نمایش داده نمی‌شود، چون نشان دادن یک مقدار ساختگی
            به‌جای سرعت واقعی گمراه‌کننده است. اتصال شبکه یا تونل را بررسی کنید و دوباره تلاش کنید.
          </div>
        ) : speedResult ? (
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 pt-1">
            <div className="p-3.5 rounded-xl bg-slate-950/70 border border-emerald-500/30">
              <span className="text-[10px] font-mono text-slate-400 uppercase">سرعت دانلود واقعی</span>
              <div className="text-2xl font-mono font-bold text-emerald-400 mt-1">
                {speedResult.downloadMbps} <span className="text-xs text-slate-400 font-normal">Mbps</span>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800">
              <span className="text-[10px] font-mono text-slate-400 uppercase">نرخ انتقال داده</span>
              <div className="text-2xl font-mono font-bold text-cyan-400 mt-1">
                {speedResult.downloadMBps} <span className="text-xs text-slate-400 font-normal">MB/s</span>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800">
              <span className="text-[10px] font-mono text-slate-400 uppercase">مدت زمان دانلود</span>
              <div className="text-2xl font-mono font-bold text-purple-400 mt-1">
                {speedResult.durationMs} <span className="text-xs text-slate-400 font-normal">ms</span>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800">
              <span className="text-[10px] font-mono text-slate-400 uppercase">داده‌های دریافتی</span>
              <div className="text-2xl font-mono font-bold text-slate-200 mt-1">
                {(speedResult.bytesReceived / 1024).toFixed(0)} <span className="text-xs text-slate-400 font-normal">KB</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-4 text-xs text-slate-500">
            هنوز تست سرعتی انجام نشده است. روی دکمه «شروع تست سرعت واقعی» کلیک کنید.
          </div>
        )}
      </div>

      {/* Diagnostics Grid */}
      {result ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/40 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono text-slate-400 uppercase">Public Virtual IP (آی‌پی عمومی)</span>
              <Globe className="w-4 h-4 text-cyan-400" />
            </div>
            <div className="text-lg font-mono font-bold text-slate-100">
              {result.currentPublicIp || '—'}
            </div>
            <div className="text-xs text-slate-400 flex items-center gap-2">
              <span>کشور: <strong className="text-slate-200">{result.country || 'نامشخص'}</strong></span>
              •
              <span>ارائه‌دهنده (ISP): <strong className="text-slate-200">{result.isp || 'نامشخص'}</strong></span>
            </div>
          </div>

          <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/40 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono text-slate-400 uppercase">DNS Leak Audit (بررسی عدم نشت دی‌ان‌اس)</span>
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
            </div>
            {result.dnsLeakDetected === null ? (
              <div className="text-lg font-bold text-amber-400 flex items-center gap-2">
                <HelpCircle className="w-5 h-5" />
                <span>بررسی نشده — نتیجه‌ای تأیید نمی‌شود</span>
              </div>
            ) : result.dnsLeakDetected ? (
              <div className="text-lg font-bold text-rose-400 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5" />
                <span>نشت DNS شناسایی شد</span>
              </div>
            ) : (
              <div className="text-lg font-bold text-emerald-400 flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5" />
                <span>بدون نشت DNS</span>
              </div>
            )}
            <p className="text-xs text-slate-400">
              تمام پرس‌وجوهای DNS به‌صورت امن و رمزگذاری‌شده در داخل تونل هدایت می‌شوند.
            </p>
          </div>

          <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/40 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono text-slate-400 uppercase">TCP Round-Trip Handshake</span>
              <Wifi className="w-4 h-4 text-purple-400" />
            </div>
            <div className="text-lg font-mono font-bold text-slate-100">
              {result.tcpHandshakeMs >= 0 ? `${result.tcpHandshakeMs} میلی‌ثانیه (ms)` : '— بدون پاسخ'}
            </div>
            <p className="text-xs text-slate-400">
              مدت زمان برقراری ارتباط سه مرحله‌ای سوکت TCP (SYN-ACK).
            </p>
          </div>

          <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/40 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono text-slate-400 uppercase">Virtual TUN Interface (کارت شبکه مجازی)</span>
              <Server className="w-4 h-4 text-cyan-400" />
            </div>
            <div className="text-lg font-bold text-cyan-400">
              {result.tunAdapterStatus} (ryox-tun Wintun Driver)
            </div>
            <p className="text-xs text-slate-400">
              درایور Wintun لایه ۳ در ویندوز فعال و مسیریابی کامل بسته‌ها برقرار است.
            </p>
          </div>
        </div>
      ) : (
        <div className="p-12 text-center border border-dashed border-slate-800 rounded-2xl space-y-2">
          <Activity className="w-8 h-8 text-slate-600 mx-auto" />
          <h4 className="text-xs font-semibold text-slate-400">عیب‌یابی انجام نشده است</h4>
          <p className="text-[11px] text-slate-500">
            برای بررسی سلامت تونل VPN و پروتکل‌های رمزنگاری، روی «اجرای عیب‌یابی» کلیک نمایید.
          </p>
        </div>
      )}
    </div>
  );
};
