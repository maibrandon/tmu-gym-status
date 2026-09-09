import { useEffect, useRef, useState } from 'react';
import { FACILITIES, fetchOccupancy, SOURCE_URL } from './occupancy';
import type { Snapshot } from './occupancy';

const clock = new Intl.DateTimeFormat('en-CA', {
  hour: 'numeric', minute: '2-digit', timeZone: 'America/Toronto',
});

function timeLabel(time: string) {
  const [hours, minutes] = time.split(':').map(Number);
  return `${hours % 12 || 12}:${String(minutes).padStart(2, '0')} ${hours < 12 ? 'AM' : 'PM'}`;
}

export function App() {
  const [mode, setMode] = useState<'now' | 'later'>('now');
  const [time, setTime] = useState('18:00');
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const activeRequest = useRef<AbortController | null>(null);
  const stale = snapshot !== null && now - snapshot.checkedAt.getTime() >= 5 * 60_000;

  async function load() {
    if (activeRequest.current) return;
    const controller = new AbortController();
    activeRequest.current = controller;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchOccupancy(controller.signal);
      setSnapshot(result);
      setNow(Date.now());
      console.table(result.readings.map(({ name, percentage }) => ({ facility: name, occupancy: percentage === null ? 'Unavailable' : `${percentage}%` })));
    } catch (cause) {
      if (!controller.signal.aborted) {
        setError(cause instanceof TypeError
          ? 'Couldn’t reach TMU. Check your connection and try again.'
          : cause instanceof Error && cause.name === 'TimeoutError'
            ? 'TMU took too long to respond. Please try again.'
            : cause instanceof Error ? cause.message : 'Couldn’t load occupancy. Please try again.');
      }
    } finally {
      if (activeRequest.current === controller) {
        activeRequest.current = null;
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    void load();
    // Update freshness labels locally; this timer never fetches TMU.
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => {
      activeRequest.current?.abort();
      window.clearInterval(timer);
    };
  }, []);

  return (
    <main className="mx-auto w-full max-w-[640px] px-5 pb-8 pt-7 sm:px-8 sm:pt-14">
      <header className="mb-9 flex items-center justify-between gap-4">
        <a href="./" className="brand flex items-center gap-2.5" aria-label="TMU Gym Status home">
          <span className="brand-mark" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="M5 9v6m4-9v12m6-12v12m4-9v6M9 12h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg></span>
          <span>TMU <span className="font-normal text-muted">/ Gym status</span></span>
        </a>
        <span className="text-sm text-muted">Toronto</span>
      </header>

      <h1 className="mb-6 text-[2.125rem] font-semibold leading-tight tracking-[-0.045em] sm:text-[2.625rem]">Let’s go gym.</h1>
      <div className="mode-switch mb-7" role="group" aria-label="When do you want to go?">
        <button type="button" aria-pressed={mode === 'now'} onClick={() => setMode('now')} className={mode === 'now' ? 'selected' : ''}>Let’s go gym now</button>
        <button type="button" aria-pressed={mode === 'later'} onClick={() => setMode('later')} className={mode === 'later' ? 'selected' : ''}>Choose a time</button>
      </div>

      {mode === 'now' ? (
        <section aria-labelledby="occupancy-heading">
          <div className="mb-1 flex items-start justify-between gap-4">
            <div>
              <h2 id="occupancy-heading" className="text-base font-semibold">Current occupancy</h2>
              <p className="mt-1 text-sm text-muted" role="status">
                {loading ? 'Checking TMU…' : snapshot ? `Last checked ${clock.format(snapshot.checkedAt)} ET` : 'Readings unavailable'}
                {!loading && snapshot && (stale || error) ? ' · May be outdated' : ''}
              </p>
            </div>
            <button type="button" className="refresh" disabled={loading} onClick={() => void load()} aria-label="Refresh current occupancy">
              <svg aria-hidden="true" viewBox="0 0 20 20" fill="none"><path d="M16 8a6.2 6.2 0 1 0-.3 4M16 3v5h-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
              Refresh
            </button>
          </div>

          {error && <div role="alert" className="error-message mt-5">{error}{snapshot && ' Showing the last successful readings.'}</div>}

          <ul className="facility-list" aria-busy={loading}>
            {FACILITIES.map((facility) => {
              const percentage = snapshot?.readings.find((reading) => reading.id === facility.id)?.percentage ?? null;
              return (
                <li key={facility.id} className="facility-row">
                  <div className="mb-3 flex items-center justify-between gap-5">
                    <h3 className="max-w-[75%] text-base font-medium leading-snug">{facility.name}</h3>
                    {loading && !snapshot ? <span className="skeleton h-7 w-12 rounded" aria-label="Loading" /> :
                      <span className="shrink-0 text-[1.625rem] font-semibold leading-none tracking-[-0.04em] tabular-nums">{percentage === null ? <span className="text-sm font-normal tracking-normal text-muted">Unavailable</span> : <>{percentage}<span className="ml-0.5 text-sm font-medium text-muted">%</span></>}</span>}
                  </div>
                  {percentage !== null ? <meter className="occupancy-meter" min={0} max={100} value={percentage} aria-label={`${facility.name} occupancy`}>{percentage}%</meter> : <div className={`empty-meter ${loading ? 'skeleton' : ''}`} aria-hidden="true" />}
                </li>
              );
            })}
          </ul>
          <p className="mt-4 text-sm leading-relaxed text-muted">Reported by TMU. Readings may lag behind what’s happening at the gym.</p>
        </section>
      ) : (
        <section className="future-panel" aria-labelledby="future-heading">
          <h2 id="future-heading" className="mb-5 text-lg font-semibold">When are you thinking?</h2>
          <label htmlFor="gym-time" className="mb-2 block text-sm font-medium">Time to go <span className="font-normal text-muted">· Toronto time</span></label>
          <input id="gym-time" type="time" value={time} onChange={(event) => setTime(event.target.value)} />
          <div className="mt-7 border-t border-line pt-6" role="status">
            <p className="mb-2 text-base font-medium">{time ? `Planning for ${timeLabel(time)}` : 'Pick a time that works for you'}</p>
            <p className="text-sm leading-relaxed text-muted">Historical recommendations coming soon. We don’t have an estimate for this time yet.</p>
          </div>
        </section>
      )}
      <footer className="mt-9 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5 text-sm text-muted">
        <span>An unofficial student project.</span>
        <a className="source-link" href={SOURCE_URL} target="_blank" rel="noreferrer">TMU source <span aria-hidden="true">↗</span></a>
      </footer>
    </main>
  );
}
