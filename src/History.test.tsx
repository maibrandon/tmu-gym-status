import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';
import { HistoryDetails } from './History';
import { HISTORY_POLICY, type HistoryResponse } from '../shared/history';

const bucket = (percentage: number, minute: number) => ({ facilityId: 'rac-fitness', percentage, minute, dates: 1, observations: 6, firstDate: '2026-09-10', lastDate: '2026-09-10', updatedAt: '2026-09-10T19:00:00Z' });
function render(live: number | null, percentages: number[], mode: 'now' | 'later' = 'now', laterPercentage?: number) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-17T17:00:00Z'));
  const data: HistoryResponse = { date: '2026-09-17', minute: 780, state: 'open', message: null, generatedAt: new Date().toISOString(), policy: HISTORY_POLICY, facilities: [{ id: 'rac-fitness', quietestLater: laterPercentage === undefined ? null : {...bucket(laterPercentage,1320),date:'2026-09-17'}, baseline: bucket(85, 780), alternatives: percentages.map((percentage, i) => ({ ...bucket(percentage, 900 + i * 30), date: '2026-09-17' })) }] };
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

it('does not claim now is least busy when matching history is missing', () => {
  expect(render(46, [])).toContain('No recorded times in this three-hour window yet.');
});

it('adds a distant estimate only when it also improves on live occupancy',()=>{
 expect(render(60,[50],'now',30)).toContain('least busy time remaining today');
 expect(render(60,[50],'now',30)).toContain('10 PM');
 expect(render(30,[20],'now',40)).not.toContain('least busy time remaining today');
 expect(render(null,[],'now',20)).not.toContain('least busy time remaining today');
});

it.each([
 ['2026-09-19T01:59:00Z',null],
 ['2026-09-19T02:00:00Z','The gym closes at 11 PM today.'],
 ['2026-09-19T02:59:00Z','The gym closes at 11 PM today.'],
 ['2026-09-19T03:00:00Z','The gym is closed now.'],
 ['2026-09-19T21:30:00Z','The gym closes at 6:30 PM today.'],
 ['2026-09-19T22:30:00Z','The gym is closed now.'],
 ['2026-09-19T12:00:00Z','The gym is closed now.'],
 ['2026-12-19T03:00:00Z','The gym closes at 11 PM today.'],
])('uses schedule-aware copy at %s even when readings are unavailable', (instant,message)=>{
 vi.useFakeTimers();vi.setSystemTime(new Date(instant));
 const html=renderToStaticMarkup(<HistoryDetails id="rac-fitness" data={null} error="fetch failed" mode="now" livePercentage={null}/>);
 if(message) expect(html).toContain(message);
 else expect(html).not.toContain('The gym closes');
});
it('does not mistake a holiday collection exclusion for a confirmed closure',()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-12T18:00:00Z'));
 const html=renderToStaticMarkup(<HistoryDetails id="rac-fitness" data={null} error={null} mode="now"/>);
 expect(html).not.toContain('The gym is closed');
});
