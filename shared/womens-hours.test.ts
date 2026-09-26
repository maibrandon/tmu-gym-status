import { expect, it } from 'vitest';
import { isWomensHours } from './womens-hours';
import { localInstant } from './history';
it.each([
  ['2026-09-21',630], ['2026-09-22',840], ['2026-09-23',630],
  ['2026-09-24',840], ['2026-09-25',630], ['2026-09-26',840], ['2026-09-27',630],
])('uses the posted interval on %s, including the start and excluding the end', (date,start) => {
  for (const [minute,expected] of [[start-1,false],[start,true],[start+89,true],[start+90,false]] as const) {
    expect(isWomensHours('RAC',localInstant(date,minute))).toBe(expected);
    expect(isWomensHours('MAC',localInstant(date,minute))).toBe(false);
  }
});
it('uses Toronto time in winter and excludes closed or holiday dates', () => {
  expect(isWomensHours('RAC',new Date('2026-12-07T15:30:00Z'))).toBe(true);
  expect(isWomensHours('RAC',new Date('2026-12-07T15:29:00Z'))).toBe(false);
  expect(isWomensHours('RAC',localInstant('2026-10-12',660))).toBe(false);
  expect(isWomensHours('RAC',new Date('invalid'))).toBe(false);
});
