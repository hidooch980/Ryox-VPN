import { Dispatch, SetStateAction, useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import { VpnServerConfig } from '../../../shared/types';

export function regionOf(node: VpnServerConfig) {
  if (/^[a-z]{2}$/i.test(node.countryCode || '')) return node.countryCode!.toUpperCase();
  const flag = node.name.match(/[\u{1F1E6}-\u{1F1FF}]{2}/u)?.[0];
  return flag ? Array.from(flag, c => String.fromCharCode(c.codePointAt(0)! - 127397)).join('') : node.countryName || '?';
}

export function useCatalogue(setServers: Dispatch<SetStateAction<VpnServerConfig[]>>) {
  const busy = useRef(false);
  const alive = useRef(true);
  const [phase, setPhase] = useState<'idle'|'refresh'|'scan'|'error'>('idle');
  const refresh = useCallback(async () => {
    if (busy.current || !window.ryoxApi) return;
    busy.current = true;
    setPhase('refresh');
    try {
      const subs = await api.getSubscriptions();
      for (const sub of subs.filter(s => s.enabled !== false)) {
        try { await api.updateSubscription(sub.id); } catch { /* Retain the last successful feed. */ }
      }
      await api.fetchAllFreeSources();
      const rows = await api.getServers();
      if (!alive.current) return;
      setServers(rows);
      setPhase('scan');
      const latency = new Map<string, number>();
      let index = 0;
      let lastPaint = Date.now();
      const worker = async () => {
        while (alive.current && index < rows.length) {
          const node = rows[index++];
          try { latency.set(node.id, await api.pingServer(node)); } catch { latency.set(node.id, -1); }
          if (alive.current && Date.now() - lastPaint > 3000) {
            lastPaint = Date.now();
            setServers(current => current.map(s => latency.has(s.id) ? {...s, latency:latency.get(s.id)} : s));
          }
        }
      };
      await Promise.all(Array.from({length:4}, worker));
      if (alive.current) {
        const current = await api.getServers();
        setServers(current.map(node => ({...node,latency:latency.get(node.id) ?? node.latency})));
        setPhase('idle');
      }
    } catch { if (alive.current) setPhase('error'); }
    finally { busy.current = false; }
  }, [setServers]);
  useEffect(() => {
    alive.current = true;
    const first = setTimeout(refresh, 2000);
    const timer = setInterval(refresh, 60 * 60 * 1000);
    return () => { alive.current = false; clearTimeout(first); clearInterval(timer); };
  }, [refresh]);
  return { phase, refresh };
}
