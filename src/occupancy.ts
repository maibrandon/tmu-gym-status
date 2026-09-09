export const SOURCE_URL = 'https://recportal.torontomu.ca/FacilityOccupancy';

export const FACILITIES = [
  { id: 'mac-fitness', name: 'MAC Fitness Centre', location: 'MAC' },
  { id: 'rac-fitness', name: 'RAC Fitness Centre', location: 'RAC' },
  { id: 'rac-1', name: 'RAC 1 Gym (LL3)', location: 'RAC' },
  { id: 'rac-2', name: 'RAC II Gym (LL3)', location: 'RAC' },
  { id: 'rac-circuit', name: 'RAC Cardio & Strength Circuit Room', location: 'RAC' },
  { id: 'rac-functional', name: 'RAC Functional Training Room', location: 'RAC' },
] as const;

export type Facility = (typeof FACILITIES)[number];
export type Reading = Facility & { percentage: number | null };
export type Snapshot = { readings: Reading[]; checkedAt: Date };

const normalize = (value: string) => value.replace(/\s+/g, ' ').trim().toLowerCase();

export function parseOccupancy(html: string): Reading[] {
  // Parse a detached document. Never insert source HTML or execute its scripts.
  const document = new DOMParser().parseFromString(html, 'text/html');
  const cards = [...document.querySelectorAll('.occupancy-card')];
  const readings = FACILITIES.map((facility): Reading => {
    const card = cards.find((item) =>
      normalize(item.querySelector('h2')?.textContent ?? '') === normalize(facility.name),
    );
    // TMU duplicates the reading for desktop/mobile. Read only the first.
    // data-occupancy is a headcount, NOT a percentage.
    const text = card?.querySelector('.occupancy-count')?.textContent?.trim() ?? '';
    const match = /^(\d+(?:\.\d+)?)\s*%$/.exec(text);
    const value = match ? Number(match[1]) : NaN;
    return { ...facility, percentage: Number.isFinite(value) && value >= 0 && value <= 100 ? value : null };
  });

  if (readings.every((reading) => reading.percentage === null)) {
    throw new Error('TMU’s occupancy readings could not be read. Please try again later.');
  }
  return readings;
}

export async function fetchOccupancy(signal?: AbortSignal): Promise<Snapshot> {
  const response = await fetch(SOURCE_URL, {
    credentials: 'omit',
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`TMU returned an error (${response.status}). Please try again later.`);
  const readings = parseOccupancy(await response.text());
  return { readings, checkedAt: new Date() };
}
