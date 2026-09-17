import { FACILITIES } from '../shared/facilities';
import { HISTORY_POLICY, eligibleBucket, type HistoricalBucket } from '../shared/history';
import { torontoParts } from '../shared/schedule';

export const AGGREGATE_MAX_AGE_MS = 24 * 60 * 60_000;
type DailyBucket = { facility_id: string; local_date: string; weekday: number; minute: number; percentage: number; observations: number; updatedAt: string };

// Runs only in scheduled collection, never on a visitor request.
export async function refreshAggregates(env: Env, now = new Date()) {
  const local = torontoParts(now);
  const dayOffset = (days: number) => new Date(new Date(`${local.date}T12:00:00Z`).getTime() - days * 86400000).toISOString().slice(0,10);
  const freshDate = dayOffset(HISTORY_POLICY.maximumAgeDays);
  const cutoff = dayOffset(HISTORY_POLICY.days);
  const previous = await env.DB.prepare('SELECT generated_at FROM history_aggregates WHERE weekday = 0').first<{generated_at:string}>();
  // Bootstrap once; normally only today's rows need summarising. After downtime,
  // include all dates since the last completed refresh. Imports can clear aggregates
  // to request a full rebuild on the next successful scheduled collection.
  const previousDate = previous ? torontoParts(new Date(previous.generated_at)).date : cutoff;
  const rebuildFrom = previousDate < cutoff ? cutoff : previousDate;
  await env.DB.batch([
    env.DB.prepare('DELETE FROM history_daily_buckets WHERE local_date >= ? OR local_date < ?').bind(rebuildFrom,cutoff),
    env.DB.prepare(`INSERT INTO history_daily_buckets
      (facility_id,local_date,weekday,minute,percentage,observations,updated_at)
      SELECT facility_id,local_date,weekday,CAST(minute_of_day / 30 AS INTEGER)*30,
      AVG(percentage),COUNT(*),MAX(collected_at) FROM observations
      WHERE local_date >= ? AND local_date <= ? AND parser_version = 1 AND collected_at < ?
      GROUP BY facility_id,local_date,weekday,CAST(minute_of_day / 30 AS INTEGER)
      HAVING COUNT(DISTINCT CAST(minute_of_day / 5 AS INTEGER)) >= ?`)
      .bind(rebuildFrom,local.date,new Date(now.getTime()-30*60000).toISOString(),HISTORY_POLICY.minimumReadings),
  ]);
  const rows = await env.DB.prepare(`SELECT facility_id,local_date,weekday,minute,percentage,
    observations,updated_at AS updatedAt FROM history_daily_buckets WHERE local_date >= ? AND local_date <= ?`)
    .bind(cutoff,local.date).all<DailyBucket>();
  const groups = new Map<string, DailyBucket[]>();
  // Check schedule once per date/bucket rather than once per facility/target weekday.
  const eligibility = new Map<string, boolean>();
  for (const row of rows.results) {
    const timeKey = `${row.local_date}:${row.minute}`;
    if (!eligibility.has(timeKey)) eligibility.set(timeKey, eligibleBucket(row.local_date, row.minute));
    if (!eligibility.get(timeKey)) continue;
    const key = `${row.facility_id}:${row.minute}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  const writes = Array.from({length:7}, (_,weekday) => {
    const buckets: HistoricalBucket[] = [];
    for (const facility of FACILITIES) {
      for (let minute = 0; minute < 1440; minute += 30) {
        const all = groups.get(`${facility.id}:${minute}`) ?? [];
        const matching = all.filter(day => day.weekday === weekday);
        const hasMatch = matching.some(day => day.local_date >= freshDate);
        const days = hasMatch ? matching : all.filter(day => weekday >= 1 && weekday <= 5 && day.weekday >= 1 && day.weekday <= 5);
        const dates = days.map(day => day.local_date).sort();
        if (!dates.length || dates[dates.length-1] < freshDate) continue;
        buckets.push({facilityId:facility.id,minute,basis:hasMatch?'matching-weekday':'weekday',
          percentage:Math.round(days.reduce((sum,day)=>sum+day.percentage,0)/days.length),
          dates:days.length,observations:days.reduce((sum,day)=>sum+day.observations,0),
          firstDate:dates[0],lastDate:dates[dates.length-1],updatedAt:days.map(day=>day.updatedAt).sort().at(-1)!});
      }
    }
    return env.DB.prepare(`INSERT INTO history_aggregates(weekday,generated_at,buckets_json) VALUES (?,?,?)
      ON CONFLICT(weekday) DO UPDATE SET generated_at=excluded.generated_at,buckets_json=excluded.buckets_json`)
      .bind(weekday,now.toISOString(),JSON.stringify(buckets));
  });
  await env.DB.batch(writes);
  console.log(JSON.stringify({event:'history_aggregates_saved',generatedAt:now.toISOString()}));
}
