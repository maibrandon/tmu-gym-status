import { collectionWindow, torontoParts } from './schedule';

// Recurring RAC schedule supplied by TMU's posted women's-hours timetable.
export function isWomensHours(location: string, at: Date): boolean {
  if (location !== 'RAC' || !Number.isFinite(at.getTime()) || collectionWindow(at).state !== 'open') return false;
  const { weekday, minute } = torontoParts(at);
  const start = [0, 1, 3, 5].includes(weekday) ? 10 * 60 + 30 : 14 * 60;
  return minute >= start && minute < start + 90;
}
