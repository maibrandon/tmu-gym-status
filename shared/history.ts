import { collectionWindow, torontoParts } from './schedule';
export const HISTORY_POLICY = { days: 56, bucketMinutes: 30, minimumDates: 1, minimumReadings: 3, maximumAgeDays: 21, improvement: 5, nearbyMinutes: 180 } as const;
export type HistoricalBucket = { basis?: 'matching-weekday' | 'weekday'; facilityId: string; minute: number; percentage: number; dates: number; observations: number; firstDate: string; lastDate: string; updatedAt: string };
export type HistoricalFacility = { id: string; baseline: HistoricalBucket | null; alternatives: (HistoricalBucket & { date: string })[]; quietestLater?: (HistoricalBucket & { date: string }) | null };
export type HistoryResponse = { date: string; minute: number; state: string; message: string | null; facilities: HistoricalFacility[]; generatedAt: string; policy: typeof HISTORY_POLICY };
export function localInstant(date: string, minute: number): Date {
  const noon = new Date(`${date}T12:00:00Z`);
  return new Date(noon.getTime() + (minute - torontoParts(noon).minute) * 60000);
}
export function eligibleBucket(date: string, minute: number) {
  return collectionWindow(localInstant(date, minute)).state === 'open' && collectionWindow(localInstant(date, minute + 29)).state === 'open';
}
// The final minute of a full one-hour visit must still be within open hours.
export function eligibleRecommendation(date: string, minute: number) {
  return eligibleBucket(date, minute) && collectionWindow(localInstant(date, minute + 59)).state === 'open';
}
export type HistorySlotCache = Map<number, {eligible:boolean;recommendable:boolean;instant:number}>;
export function selectHistory(id: string, buckets: HistoricalBucket[], date: string, minute: number, now: Date, mode: string, slots: HistorySlotCache = new Map()): HistoricalFacility {
  const slot = (value:number) => {
    let entry=slots.get(value);
    if (!entry) {
      entry={eligible:eligibleBucket(date,value),recommendable:eligibleRecommendation(date,value),instant:localInstant(date,value).getTime()};
      slots.set(value,entry);
    }
    return entry;
  };
  const bucket = Math.floor(minute / 30) * 30;
  const supported = buckets.filter(b => b.facilityId === id && b.dates >= HISTORY_POLICY.minimumDates && slot(b.minute).eligible);
  const baseline = supported.find(b => b.minute === bucket) ?? null;
  // Rank the biggest occupancy reduction first; proximity breaks equal-value ties.
  // Never widen the window or roll a suggestion into a different date.
  // Live-view candidates are compared with the live reading in the UI.
  // A historical baseline must not discard a time that is quieter than live.
  const alternatives = supported.filter(b =>
    b.minute !== bucket && slot(b.minute).recommendable &&
    Math.abs(b.minute - minute) <= HISTORY_POLICY.nearbyMinutes &&
    slot(b.minute).instant > now.getTime() &&
    (mode !== 'now' || b.minute > minute) &&
    (mode === 'now' || !baseline || b.percentage <= baseline.percentage - HISTORY_POLICY.improvement)
  ).sort((a,b) => a.percentage - b.percentage ||
    Math.abs(a.minute-minute) - Math.abs(b.minute-minute) || a.minute-b.minute
  ).slice(0,3).map(b => ({ ...b, date }));
  // Find the minimum across all remaining slots before deciding whether it is distant.
  const quietest = supported.filter(b => b.minute > minute &&
    slot(b.minute).recommendable && slot(b.minute).instant > now.getTime())
    .sort((a,b) => a.percentage - b.percentage || a.minute - b.minute)[0];
  const quietestLater = quietest && quietest.minute - minute > HISTORY_POLICY.nearbyMinutes
    ? { ...quietest, date } : null;
  return { id, baseline, alternatives, quietestLater };
}
