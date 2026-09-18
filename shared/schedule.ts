// Owner-supplied schedule, effective 2026-09-08; owner updates it at term changes.
export const SCHEDULE_START = '2026-09-08';
export const TIME_ZONE = 'America/Toronto';
// Manual exclusions for unexpected closures or campus-specific observed days.
export const EXTRA_EXCLUDED_DATES: Record<string, string> = {};

const formatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});
const isoDay = (date: Date) => date.toISOString().slice(0, 10);
const dateAt = (year: number, month: number, day: number) => new Date(Date.UTC(year, month - 1, day));
const nthMonday = (year: number, month: number, n: number) => {
  const first = dateAt(year, month, 1);
  return dateAt(year, month, 1 + (8 - first.getUTCDay()) % 7 + (n - 1) * 7);
};

export function holidayCalendar(year: number): Map<string, string> {
  // Gregorian Easter calculation; Good Friday is two days before Easter Sunday.
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = (h + l - 7 * m + 114) % 31 + 1;
  const goodFriday = dateAt(year, month, day - 2);
  const victoria = dateAt(year, 5, 24);
  victoria.setUTCDate(24 - ((victoria.getUTCDay() + 6) % 7 + 1));
  const actual: [Date, string][] = [
    [dateAt(year, 1, 1), 'New Year’s Day'], [nthMonday(year, 2, 3), 'Family Day'],
    [goodFriday, 'Good Friday'], [victoria, 'Victoria Day'],
    [dateAt(year, 7, 1), 'Canada Day'], [nthMonday(year, 8, 1), 'Civic Holiday'],
    [nthMonday(year, 9, 1), 'Labour Day'], [nthMonday(year, 10, 2), 'Thanksgiving'],
    [dateAt(year, 12, 25), 'Christmas Day'], [dateAt(year, 12, 26), 'Boxing Day'],
  ];
  const holidays = new Map(actual.map(([date, name]) => [isoDay(date), name]));
  // Conservative app policy: skip actual holidays AND following substitute weekdays.
  // This is a collection policy, not a claim about TMU's operating calendar.
  for (const [date, name] of actual) {
    if (date.getUTCDay() !== 0 && date.getUTCDay() !== 6) continue;
    const observed = new Date(date);
    do { observed.setUTCDate(observed.getUTCDate() + 1); }
    while ([0, 6].includes(observed.getUTCDay()) || holidays.has(isoDay(observed)));
    holidays.set(isoDay(observed), `${name} (observed)`);
  }
  return holidays;
}

export function torontoParts(now: Date) {
  const parts = Object.fromEntries(formatter.formatToParts(now).map(p => [p.type, p.value]));
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  return { date, year: Number(parts.year), weekday: new Date(`${date}T12:00:00Z`).getUTCDay(),
    minute: Number(parts.hour) * 60 + Number(parts.minute) };
}
export function operatingHours(weekday: number) {
  const weekend = weekday === 0 || weekday === 6;
  return { open: weekend ? 9 * 60 : 6 * 60 + 30, close: weekend ? 18 * 60 + 30 : 23 * 60 };
}
export type CollectionState = 'open' | 'outside_hours' | 'holiday' | 'not_started' | 'paused';
export function collectionWindow(now: Date): { state: CollectionState; reason: string | null } {
  const local = torontoParts(now);
  if (local.date < SCHEDULE_START) return { state: 'not_started', reason: 'Collection has not started yet.' };
  const holiday = EXTRA_EXCLUDED_DATES[local.date] ?? holidayCalendar(local.year).get(local.date);
  if (holiday) return { state: 'holiday', reason: `Collection paused for ${holiday}.` };
  const { open, close } = operatingHours(local.weekday);
  if (local.minute < open || local.minute >= close) return {
    state: 'outside_hours', reason: 'The gym is closed now.',
  };
  return { state: 'open', reason: null };
}
