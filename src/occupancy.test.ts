// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { FACILITIES, parseOccupancy } from './occupancy';

const card = (name: string, value: string) => `<div class="occupancy-card"><h2><strong>${name}</strong></h2><canvas data-occupancy="60"></canvas><p class="occupancy-count"><strong>${value}</strong></p><p class="occupancy-count"><strong>${value}</strong></p></div>`;

describe('TMU HTML parser', () => {
  it('reads displayed percentages, deduplicates mobile markup, and preserves source order', () => {
    const html = [...FACILITIES].reverse().map((facility) => card(facility.name.replace('&', '&amp;'), '86%')).join('');
    expect(parseOccupancy(html)).toEqual(FACILITIES.map((facility) => ({ ...facility, percentage: 86 })));
  });
  it('preserves zero and treats missing or invalid readings as unavailable', () => {
    const html = card(FACILITIES[0].name, '0%') + card(FACILITIES[1].name, '101%') + card(FACILITIES[2].name, '-5%');
    expect(parseOccupancy(html).map((reading) => reading.percentage)).toEqual([0, null, null, null, null, null]);
  });
  it('rejects login, error, or changed markup instead of inventing readings', () => {
    expect(() => parseOccupancy('<h1>Sign in</h1>')).toThrow('could not be read');
  });
});
