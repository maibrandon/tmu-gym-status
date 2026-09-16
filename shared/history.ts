import { collectionWindow, torontoParts } from './schedule';
export const HISTORY_POLICY = { days: 56, bucketMinutes: 30, minimumDates: 1, minimumReadings: 3, maximumAgeDays: 21, improvement: 10, nearbyMinutes: 180 } as const;
export type HistoricalBucket = { basis?: 'matching-weekday' | 'weekday'; facilityId: string; minute: number; percentage: number; dates: number; observations: number; firstDate: string; lastDate: string; updatedAt: string };
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
  // Rank the biggest occupancy reduction first; proximity breaks equal-value ties.
  // Never widen the window or roll a suggestion into a different date.
  const alternatives = supported.filter(b =>
    b.minute !== bucket &&
    Math.abs(b.minute - minute) <= HISTORY_POLICY.nearbyMinutes &&
    localInstant(date, b.minute).getTime() > now.getTime() &&
    (mode !== 'now' || b.minute > minute) &&
    (!baseline || b.percentage <= baseline.percentage - HISTORY_POLICY.improvement)
  ).sort((a,b) => a.percentage - b.percentage ||
    Math.abs(a.minute-minute) - Math.abs(b.minute-minute) || a.minute-b.minute
  ).slice(0,3).map(b => ({ ...b, date }));
  return { id, baseline, alternatives };
}
