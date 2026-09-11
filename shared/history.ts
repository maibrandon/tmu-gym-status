import { collectionWindow, torontoParts } from './schedule';
export const HISTORY_POLICY = { days: 56, bucketMinutes: 30, minimumDates: 1, minimumReadings: 3, maximumAgeDays: 21, improvement: 10, nearbyMinutes: 120 } as const;
export type HistoricalBucket = { facilityId: string; minute: number; percentage: number; dates: number; observations: number; firstDate: string; lastDate: string; updatedAt: string };
export type HistoricalFacility = { id: string; baseline: HistoricalBucket | null; alternatives: (HistoricalBucket & { date: string })[] };
export type HistoryResponse = { date: string; minute: number; state: string; message: string | null; facilities: HistoricalFacility[]; generatedAt: string; policy: typeof HISTORY_POLICY };
export function localInstant(date: string, minute: number): Date {
  const noon = new Date(`${date}T12:00:00Z`);
  return new Date(noon.getTime() + (minute - torontoParts(noon).minute) * 60000);
}
export function eligibleBucket(date: string, minute: number) {
  return collectionWindow(localInstant(date, minute)).state === 'open' && collectionWindow(localInstant(date, minute + 29)).state === 'open';
}
export function selectHistory(id: string, buckets: HistoricalBucket[], date: string, minute: number, now: Date, mode: string): HistoricalFacility {
  const bucket = Math.floor(minute / 30) * 30;
  const supported = buckets.filter(b => b.facilityId === id && b.dates >= HISTORY_POLICY.minimumDates && eligibleBucket(date, b.minute));
  const baseline = supported.find(b => b.minute === bucket) ?? null;
  const candidates = supported.filter(b => b.minute !== bucket || !baseline).map(b => {
    let candidateDate = date;
    // Today's measured times may already have passed. Offer their next matching
    // weekday explicitly rather than present past times as options for tonight.
    if (localInstant(candidateDate, b.minute).getTime() <= now.getTime()) {
      const next = new Date(`${date}T12:00:00Z`);
      next.setUTCDate(next.getUTCDate() + 7);
      candidateDate = next.toISOString().slice(0,10);
    }
    return { ...b, date: candidateDate };
  }).filter(b => eligibleBucket(b.date,b.minute) && localInstant(b.date,b.minute).getTime()>now.getTime() && (!baseline || b.percentage <= baseline.percentage-HISTORY_POLICY.improvement));
  const nearby = candidates.filter(b=>b.date===date && Math.abs(b.minute-minute)<=HISTORY_POLICY.nearbyMinutes && (mode!=='now'||b.minute>minute));
  const alternatives = (nearby.length ? nearby : candidates).sort((a,b)=>a.percentage-b.percentage || a.date.localeCompare(b.date) || Math.abs(a.minute-minute)-Math.abs(b.minute-minute) || a.minute-b.minute).slice(0,3);
  return { id, baseline, alternatives };
}
