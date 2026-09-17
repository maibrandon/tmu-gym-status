import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';
import { HistoryDetails } from './History';
import { HISTORY_POLICY, type HistoryResponse } from '../shared/history';

const bucket = (percentage: number, minute: number) => ({ facilityId: 'rac-fitness', percentage, minute, dates: 1, observations: 6, firstDate: '2026-09-10', lastDate: '2026-09-10', updatedAt: '2026-09-10T19:00:00Z' });
function render(live: number | null, percentages: number[], mode: 'now' | 'later' = 'now') {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-17T17:00:00Z'));
  const data: HistoryResponse = { date: '2026-09-17', minute: 780, state: 'open', message: null, generatedAt: new Date().toISOString(), policy: HISTORY_POLICY, facilities: [{ id: 'rac-fitness', baseline: bucket(85, 780), alternatives: percentages.map((percentage, i) => ({ ...bucket(percentage, 900 + i * 30), date: '2026-09-17' })) }] };
  return renderToStaticMarkup(<HistoryDetails id="rac-fitness" data={data} error={null} mode={mode} livePercentage={live} />);
}
afterEach(() => vi.useRealTimers());
it('rejects a historically quieter time that is busier than the live reading', () => {
  expect(render(46, [62])).not.toContain('How about');
});
it('requires five percentage points of improvement including the boundary', () => {
  expect(render(46, [46, 42])).not.toContain('How about');
  expect(render(46, [41])).toContain('How about');
});
it('checks later candidates when the first candidate is not quieter', () => {
  expect(render(46, [62, 30])).toContain('How about 3:30 PM');
});
it('does not recommend when live occupancy is unavailable or zero', () => {
  expect(render(null, [20])).not.toContain('How about');
  expect(render(0, [0])).not.toContain('How about');
});
it('keeps future planning comparisons based on history', () => {
  expect(render(null, [62], 'later')).toContain('How about');
});

it('shows the requested message when no alternative qualifies', () => {
  expect(render(46, [62])).toContain('It looks like this is the least busy time within the next 3 hours!');
});
