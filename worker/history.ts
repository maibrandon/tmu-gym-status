import { FACILITIES } from '../shared/facilities';
import { HISTORY_POLICY, localInstant, eligibleBucket, selectHistory, type HistoricalBucket, type HistoryResponse } from '../shared/history';
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
  const cutoff = new Date(`${local.date}T12:00:00Z`); cutoff.setUTCDate(cutoff.getUTCDate()-HISTORY_POLICY.days);
  const fresh = new Date(`${local.date}T12:00:00Z`); fresh.setUTCDate(fresh.getUTCDate()-HISTORY_POLICY.maximumAgeDays);
  const weekday = parsed.getUTCDay();
  // Compare only matching weekdays; never substitute another weekday.
  const buckets: HistoricalBucket[] = [];
  for (const facility of FACILITIES) {
    const rows = await env.DB.prepare(`SELECT local_date, CAST(minute_of_day / 30 AS INTEGER)*30 AS minute,
      AVG(percentage) AS percentage, COUNT(*) AS observations, MAX(collected_at) AS updatedAt
      FROM observations WHERE facility_id = ? AND weekday = ? AND local_date >= ? AND local_date <= ?
      AND minute_of_day BETWEEN ? AND ? AND parser_version = 1 AND collected_at < ?
      GROUP BY local_date, CAST(minute_of_day / 30 AS INTEGER)
      HAVING COUNT(DISTINCT CAST(minute_of_day / 5 AS INTEGER)) >= ?`)
      .bind(facility.id,weekday,cutoff.toISOString().slice(0,10),local.date,0,1439,new Date(now.getTime()-30*60000).toISOString(),HISTORY_POLICY.minimumReadings)
      .all<{local_date:string;minute:number;percentage:number;observations:number;updatedAt:string}>();
    const groups = new Map<number, typeof rows.results>();
    for (const row of rows.results) {
      if (!eligibleBucket(row.local_date,row.minute)) continue;
      groups.set(row.minute,[...(groups.get(row.minute) ?? []),row]);
    }
    for (const [bucket, days] of groups) {
      const basis = 'matching-weekday';
      const dates = days.map(d=>d.local_date).sort();
      if (dates[dates.length-1] < fresh.toISOString().slice(0,10)) continue;
      buckets.push({basis,facilityId:facility.id,minute:bucket,percentage:Math.round(days.reduce((s,d)=>s+d.percentage,0)/days.length),dates:days.length,observations:days.reduce((s,d)=>s+d.observations,0),firstDate:dates[0],lastDate:dates[dates.length-1],updatedAt:days.map(d=>d.updatedAt).sort().at(-1)!});
    }
  }
  const data: HistoryResponse = {date,minute,state:'open',message:null,facilities:FACILITIES.map(f=>selectHistory(f.id,buckets,date,minute,now,mode)),generatedAt:now.toISOString(),policy:HISTORY_POLICY};
  return Response.json(data,{headers});
}
