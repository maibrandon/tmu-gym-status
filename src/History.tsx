import { OccupancySummary } from "./OccupancySummary";
import { torontoParts, collectionWindow, operatingHours } from '../shared/schedule';
import { HISTORY_POLICY, localInstant, eligibleRecommendation } from '../shared/history';
import { FACILITIES } from './occupancy';
import type { HistoryResponse } from '../shared/history';
import { useHistory } from './useHistory';
import { RevealRow } from './RevealRow';
const label = (minute: number) => `${Math.floor(minute / 60) % 12 || 12}${minute % 60 ? `:${String(minute % 60).padStart(2, '0')}` : ''} ${minute < 720 ? 'AM' : 'PM'}`;
const weekday = new Intl.DateTimeFormat('en-CA', { weekday: 'long', timeZone: 'America/Toronto' });

export function HistoryDetails({id,data,error,mode='later',livePercentage=null}: {id:string;data:HistoryResponse|null;error:string|null;mode?:'now'|'later';livePercentage?:number|null}) {
  const now = new Date();
  const scheduleTime = mode === 'now' ? now : data ? localInstant(data.date,data.minute) : null;
  if (scheduleTime) {
    const window = collectionWindow(scheduleTime);
    if (window.state === 'outside_hours') return <p className="text-sm text-muted">{mode === 'now' ? 'The gym is closed now.' : 'The gym is closed at this time.'}</p>;
    const local = torontoParts(scheduleTime);
    const { close } = operatingHours(local.weekday);
    if (mode === 'now' && window.state === 'open' && local.minute >= close - 60)
      return <p className="text-sm text-muted">The gym closes at {label(close)} today.</p>;
  }
  if (error) return <p className="text-sm text-muted">Suggestions are unavailable right now.</p>;
  if (!data) return <p className="text-sm text-muted">Finding another time…</p>;
  if (mode === 'now' && livePercentage === null) return <p className="text-sm text-muted">A current reading is needed to compare quieter times.</p>;
  const result = data.facilities.find(f => f.id === id);
  const current = mode === 'now' ? torontoParts(now) : { date: data.date, minute: data.minute };
  // An open page may still hold a response from before a rule change or time boundary.
  const suggestion = result?.alternatives.find(option => option.date === current.date && eligibleRecommendation(option.date, option.minute) &&
    Math.abs(option.minute - current.minute) <= HISTORY_POLICY.nearbyMinutes &&
    localInstant(option.date, option.minute).getTime() > now.getTime() &&
    (mode !== 'now' || (option.minute > current.minute && livePercentage !== null &&
      option.percentage <= livePercentage - HISTORY_POLICY.improvement)));
  if (data.message) return <p className="text-sm text-muted">Suggestions aren’t available for this time.</p>;
  const later = result?.quietestLater;
  const showLater = mode === 'now' && later && later.date === current.date &&
    later.minute - current.minute > HISTORY_POLICY.nearbyMinutes &&
    eligibleRecommendation(later.date, later.minute) && livePercentage !== null &&
    later.percentage <= livePercentage - HISTORY_POLICY.improvement;
  const date = new Date(`${data.date}T12:00:00Z`);
  return <div className="text-sm">
    {suggestion ? <>
      <p className="font-medium">How about {label(suggestion.minute)}?</p>
      <p className="mt-1 text-muted">{suggestion.basis === 'weekday' ? 'Weekdays' : `${weekday.format(date)}s`} around {label(suggestion.minute)} average <span className="font-medium">{suggestion.percentage}%</span> occupancy.</p>
    </> : <p className="text-muted">{(mode === 'now' ? Boolean(result?.alternatives.length) : Boolean(result?.baseline)) ? 'It looks like this is the least busy time within the next 3 hours!' : 'No recorded times in this three-hour window yet.'}</p>}
    {showLater && <p className="mt-3 text-muted">{suggestion ? 'Or, the' : 'The'} least busy time remaining today would likely be <span className="font-medium">{label(later.minute)}</span> at around <span className="font-medium">{later.percentage}%</span> occupancy{later.basis === 'weekday' ? ', based on weekday averages' : ''}.</p>}
  </div>;
}

export function History({date,time}: {date:string;time:string}) {
  const response=useHistory('later',date,time);
  const selectedMinute = Number(time.slice(0,2))*60 + Number(time.slice(3));
  const data = response.data?.date === date && response.data.minute === selectedMinute ? response.data : null;
  const error = response.error;
  const loading = !data && !error;
  return <section className="mt-6" aria-label="Historical estimates">
    <p className="text-sm text-muted">Average occupancy</p>
    {error && <p role="alert" className="mt-3 text-sm text-muted">{error}</p>}
    <ul>{FACILITIES.map(f=>{
      const baseline=data?.facilities.find(r=>r.id===f.id)?.baseline;
      return <RevealRow key={f.id} label={`${f.name}, alternative times`} summary={<OccupancySummary name={f.name} percentage={data?.message || error ? null : baseline?.percentage ?? null} loading={loading} />}>
        <HistoryDetails id={f.id} data={data} error={error}/>
      </RevealRow>;
    })}</ul>
  </section>;
}
