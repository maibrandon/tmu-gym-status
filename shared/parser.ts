import { parse } from 'node-html-parser';
import { FACILITIES } from './facilities';
import type { Reading } from './facilities';

const normalize = (value: string) => value.replace(/\s+/g, ' ').trim().toLowerCase();

export function parseOccupancy(html: string): Reading[] {
  // Parse a detached document. Never insert source HTML or execute its scripts.
  const document = parse(html, { blockTextElements: { script: false, style: false } });
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

