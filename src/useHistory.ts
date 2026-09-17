import { useEffect, useState } from 'react';
import type { HistoryResponse } from '../shared/history';
export function useHistory(mode: 'now'|'later', date?: string, time?: string, refresh?: Date|null, enabled = true) {
  const [data,setData] = useState<HistoryResponse|null>(null);
  const [error,setError] = useState<string|null>(null);
  const refreshTime = refresh?.getTime();
  useEffect(()=>{
    if (!enabled) return;
    const controller = new AbortController();
    setData(null); setError(null);
    const params = new URLSearchParams({mode,...(date?{date}:{}),...(time?{time}:{})});
    const timer = setTimeout(()=>{
      void fetch(`/api/history?${params}`,{signal:AbortSignal.any([controller.signal,AbortSignal.timeout(15000)])}).then(async response=>{
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? 'Historical context is unavailable.');
        if (!controller.signal.aborted) setData(body);
      }).catch(cause=>{if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:'Historical context is unavailable.');});
    },200);
    return ()=>{clearTimeout(timer);controller.abort();};
  },[mode,date,time,refreshTime,enabled]);
  return { data, error };
}
