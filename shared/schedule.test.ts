import { describe, expect, it } from 'vitest';
import { collectionWindow, holidayCalendar } from './schedule';
describe('Toronto collection schedule', () => {
  it.each([
    ['2026-09-10T10:29:59Z', 'outside_hours'], ['2026-09-10T10:30:00Z', 'open'],
    ['2026-09-11T02:59:59Z', 'open'], ['2026-09-11T03:00:00Z', 'outside_hours'],
    ['2026-09-12T12:59:59Z', 'outside_hours'], ['2026-09-12T13:00:00Z', 'open'],
    ['2026-09-12T22:29:59Z', 'open'], ['2026-09-12T22:30:00Z', 'outside_hours'],
    ['2026-11-02T11:29:59Z', 'outside_hours'], ['2026-11-02T11:30:00Z', 'open'],
    ['2026-09-07T14:00:00Z', 'not_started'], ['2026-10-12T14:00:00Z', 'holiday'],
    ['2027-08-02T14:00:00Z', 'holiday'], ['2026-12-28T14:00:00Z', 'holiday'],
  ])('%s => %s', (date, state) => expect(collectionWindow(new Date(date)).state).toBe(state));
  it('includes all Ontario holidays plus Civic and handles colliding substitutes', () => {
    const calendar = holidayCalendar(2026);
    for (const date of ['2026-01-01','2026-02-16','2026-04-03','2026-05-18','2026-07-01','2026-08-03','2026-09-07','2026-10-12','2026-12-25','2026-12-26','2026-12-28']) expect(calendar.has(date)).toBe(true);
    const christmas = holidayCalendar(2027);
    expect(christmas.has('2027-12-27')).toBe(true);
    expect(christmas.has('2027-12-28')).toBe(true);
  });
});
