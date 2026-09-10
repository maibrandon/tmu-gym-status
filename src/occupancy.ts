export { FACILITIES, SOURCE_URL } from '../shared/facilities';
import type { Reading } from '../shared/facilities';
import type { CollectionState } from '../shared/schedule';
export type Snapshot = {
  readings: Reading[];
  checkedAt: Date | null;
  stale: boolean;
  collectionState: CollectionState;
  message: string | null;
};
export async function fetchOccupancy(signal?: AbortSignal): Promise<Snapshot> {
  const response = await fetch('/api/occupancy', {
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error('Occupancy is temporarily unavailable. Please try again.');
  const data = await response.json() as Omit<Snapshot, 'checkedAt'> & { checkedAt: string | null };
  if (!Array.isArray(data.readings)) throw new Error('The occupancy response could not be read.');
  return { ...data, checkedAt: data.checkedAt ? new Date(data.checkedAt) : null };
}
