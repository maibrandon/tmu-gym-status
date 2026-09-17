import { AGGREGATE_MAX_AGE_MS } from './aggregates';
import { FACILITIES } from '../shared/facilities';
import { HISTORY_POLICY, localInstant, eligibleBucket, selectHistory, type HistorySlotCache, type HistoricalBucket, type HistoryResponse } from '../shared/history';
import { collectionWindow, torontoParts } from '../shared/schedule';

export async function historicalResponse(url: URL, env: Env, now = new Date()): Promise<Response> {
  const local = torontoParts(now);
  const mode = url.searchParams.get('mode') ?? 'later';
  const date = mode === 'now' ? local.date : url.searchParams.get('date') ?? '';
  const time = url.searchParams.get('time') ?? '';
  if (!['now','later'].includes(mode) || !/^\d{4}-\d{2}-\d{2}$/.test(date) || (mode !== 'now' && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))) return Response.json({ error: 'Choose a valid date and time.' }, { status: 400 });
  const parsed = new Date(`${date}T12:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0,10) !== date) return Response.json({ error: 'Choose a valid date.' }, { status: 400 });
  const minute = mode === 'now' ? local.minute : Number(time.slice(0,2))*60 + Number(time.slice(3));
  const target = localInstant(date, minute);
  if (mode !== 'now' && (target.getTime() < now.getTime() || target.getTime() > now.getTime() + 90*86400000)) return Response.json({ error: 'Choose a future time within the next 90 days.' }, { status: 400 });
  const window = collectionWindow(target);
  const empty = (state: string, message: string): HistoryResponse => ({ date, minute, state, message, facilities: FACILITIES.map(f => ({id:f.id,baseline:null,alternatives:[]})), generatedAt:now.toISOString(),policy:HISTORY_POLICY });
  const headers = {'Cache-Control':'no-store'};
  if (env.COLLECTION_ENABLED !== 'true') return Response.json(empty('paused','Historical context is paused while the collection schedule is being reviewed.'),{headers});
  if (window.state !== 'open' || !eligibleBucket(date,Math.floor(minute/30)*30)) return Response.json(empty(window.state,window.reason ?? 'No estimates for this time.'),{headers});
  const cached = await env.DB.prepare('SELECT generated_at, buckets_json FROM history_aggregates WHERE weekday = ?')
    .bind(parsed.getUTCDay()).first<{generated_at:string;buckets_json:string}>();
  if (!cached || now.getTime()-Date.parse(cached.generated_at) > AGGREGATE_MAX_AGE_MS) {
    return Response.json(empty('unavailable','Historical estimates are awaiting a scheduled update.'),{headers});
  }
  const buckets = JSON.parse(cached.buckets_json) as HistoricalBucket[];
  const slots: HistorySlotCache = new Map();
  const data: HistoryResponse = {date,minute,state:'open',message:null,facilities:FACILITIES.map(f=>selectHistory(f.id,buckets,date,minute,now,mode,slots)),generatedAt:now.toISOString(),policy:HISTORY_POLICY};
  return Response.json(data,{headers});
}
