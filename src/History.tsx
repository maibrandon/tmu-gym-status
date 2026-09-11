import { useEffect, useState } from 'react';
import { FACILITIES } from './occupancy';
import type { Snapshot } from './occupancy';
import { torontoParts } from '../shared/schedule';
import type { HistoryResponse } from '../shared/history';
const label = (minute: number) => `${Math.floor(minute/60)%12 || 12}:${String(minute%60).padStart(2,'0')} ${minute<720?'AM':'PM'}`;
export function History({mode,date,time,live}: {mode:'now'|'later';date?:string;time?:string;live?:Snapshot|null}) {
  const [data,setData] = useState<HistoryResponse|null>(null);
  const [error,setError] = useState<string|null>(null);
  useEffect(()=>{
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
  },[mode,date,time]);
  return <section className="mt-7 border-t border-line pt-6" aria-label="Historical context">
    <h2 className="text-base font-semibold">{mode==='now'?'Historical context':'Early occupancy estimates'}</h2>
    <p className="mt-2 text-sm text-muted">Experimental: based on matching weekdays and 30-minute periods. One day is an early reference, not an established pattern. When nearby times have no data, options may include another time or the next matching weekday; dates are shown.</p>
    {error ? <p role="status" className="mt-4 text-sm text-muted">{error}</p> : !data ? <p role="status" className="mt-4 text-sm text-muted">Checking history…</p> : data.message ? <p role="status" className="mt-4 text-sm text-muted">{data.message}</p> : <ul>
      {FACILITIES.map(f=>{
        const result=data.facilities.find(r=>r.id===f.id);
        const baseline=result?.baseline;
        const reading=live?.readings.find(r=>r.id===f.id)?.percentage;
        const fresh=live?.checkedAt && !live.stale && Date.now()-live.checkedAt.getTime()<10*60000 && data.date===torontoParts(live.checkedAt).date && baseline?.minute===Math.floor(torontoParts(live.checkedAt).minute/30)*30;
        const difference=baseline && reading!=null && fresh ? Math.round(reading-baseline.percentage):null;
        return <li key={f.id} className="border-b border-line py-4 last:border-0">
          <h3 className="text-sm font-medium">{f.name}</h3>
          {baseline ? <>
            <p className="mt-1 text-sm">Early estimate: <strong>{baseline.percentage}%</strong> <span className="text-muted">· {label(baseline.minute)}–{label(baseline.minute+30)}</span></p>
            <p className="mt-1 text-sm text-muted">{baseline.dates} {baseline.dates===1?'day':'days'} of data · {baseline.observations} readings · {baseline.firstDate}{baseline.lastDate!==baseline.firstDate?` to ${baseline.lastDate}`:''}</p>
            {difference!==null && <p className="mt-2 text-sm">{difference===0?'Live occupancy matches this early reference.':`Live occupancy is ${Math.abs(difference)} percentage points ${difference<0?'lower':'higher'} than this early reference.`}</p>}

          </> : <p className="mt-1 text-sm text-muted">No estimate yet for this time. We need at least three readings in a matching half-hour period.</p>}
            {!!result?.alternatives.length && <div className="mt-3 text-sm"><p className="text-muted">{baseline ? 'Quieter in the available history:' : 'Times to consider from the available history:'}</p><ul>{result.alternatives.map(b=><li key={b.minute} className="mt-1">{b.date !== data.date ? `${b.date} · ` : ''}{label(b.minute)} — {b.percentage}% <span className="text-muted">· {b.dates} {b.dates===1?'day':'days'} of data</span></li>)}</ul></div>}
          {!result?.alternatives.length && <p className="mt-2 text-sm text-muted">No supported alternatives yet.</p>}
        </li>;
      })}
    </ul>}
  </section>;
}
