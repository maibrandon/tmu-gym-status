import { torontoParts } from "../shared/schedule";
import { useHistory } from "./useHistory";
import { RevealRow } from "./RevealRow";
import { HistoryDetails, History } from "./History";
import { useEffect, useRef, useState } from "react";
import { FACILITIES, fetchOccupancy, SOURCE_URL } from "./occupancy";
import { Appearance } from "./Appearance";
import type { Snapshot } from "./occupancy";

const clock = new Intl.DateTimeFormat("en-CA", {
  hour: "numeric",
  minute: "2-digit",
  timeZone: "America/Toronto",
});

function timeLabel(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return `${hours % 12 || 12}:${String(minutes).padStart(2, "0")} ${hours < 12 ? "AM" : "PM"}`;
}

export function App() {
  const [mode, setMode] = useState<"now" | "later">("now");
  const [initialPlan] = useState(() =>
    torontoParts(new Date(Math.ceil((Date.now() + 60000) / 1800000) * 1800000)),
  );
  const [date, setDate] = useState(initialPlan.date);
  const [time, setTime] = useState(
    `${String(Math.floor(initialPlan.minute / 60)).padStart(2, "0")}:${String(initialPlan.minute % 60).padStart(2, "0")}`,
  );
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const activeRequest = useRef<AbortController | null>(null);
  const stale =
    snapshot !== null &&
    (snapshot.stale ||
      (snapshot.checkedAt !== null &&
        now - snapshot.checkedAt.getTime() >= 10 * 60_000));

  const history = useHistory("now", undefined, undefined, snapshot?.checkedAt);

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
      console.table(
        result.readings.map(({ name, percentage }) => ({
          facility: name,
          occupancy: percentage === null ? "Unavailable" : `${percentage}%`,
        })),
      );
    } catch (cause) {
      if (!controller.signal.aborted) {
        setError(
          cause instanceof TypeError
            ? "Couldn’t load occupancy. Check your connection and try again."
            : cause instanceof Error && cause.name === "TimeoutError"
              ? "The request took too long to respond. Please try again."
              : cause instanceof Error
                ? cause.message
                : "Couldn’t load occupancy. Please try again.",
        );
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
    <main className="page-shell">
      <header className="site-header">
        <a href="./" className="brand" aria-label="TMU Gym Status home">
          should i go gym?
        </a>
        <span className="location-label">
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none"><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z" stroke="currentColor" strokeWidth="1.5"/><circle cx="12" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.5"/></svg>
          Toronto, ON
        </span>
      </header>

      <div className="hero">
        <p className="eyebrow">Live gym occupancy <span aria-hidden="true">·</span> TMU</p>
        <h1>we gotta lock in.</h1>
      </div>
      <div
        className="mode-switch"
        role="group"
        aria-label="When do you want to go?"
      >
        <button
          type="button"
          aria-pressed={mode === "now"}
          onClick={() => setMode("now")}
          className={mode === "now" ? "selected" : ""}
        >
          Right now
        </button>
        <button
          type="button"
          aria-pressed={mode === "later"}
          onClick={() => setMode("later")}
          className={mode === "later" ? "selected" : ""}
        >
          Choose a time
        </button>
      </div>

      {mode === "now" ? (
        <section aria-labelledby="occupancy-heading">
          <div className="section-heading">
            <div>
              <h2 id="occupancy-heading" className="section-title">
                Live occupancy
              </h2>
              <p className="mt-1 text-sm text-muted" role="status">
                {loading
                  ? "Checking occupancy…"
                  : snapshot?.checkedAt
                    ? `Last updated ${clock.format(snapshot.checkedAt)} ET`
                    : "Readings unavailable"}
                {!loading && snapshot && (stale || error)
                  ? " · May be outdated"
                  : ""}
              </p>
            </div>
            <button
              type="button"
              className="refresh"
              disabled={loading}
              onClick={() => void load()}
              aria-label="Refresh current occupancy"
            >
              <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
                <path
                  d="M16 8a6.2 6.2 0 1 0-.3 4M16 3v5h-5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Refresh
            </button>
          </div>

          {snapshot?.message && (
            <p
              role="status"
              className="mt-5 text-sm leading-relaxed text-muted"
            >
              {snapshot.message}
            </p>
          )}
          {error && (
            <div role="alert" className="error-message mt-5">
              {error}
              {snapshot && " Showing the last successful readings."}
            </div>
          )}

          {['Popular', 'Other'].map((group) => (
            <section className="facility-group" key={group} aria-labelledby={`group-${group.toLowerCase()}`}>
              <h3 className="facility-group-title" id={`group-${group.toLowerCase()}`}>{group}</h3>
              <ul className="facility-list" aria-busy={loading}>
            {FACILITIES.filter((facility) => {
              const popular = facility.id === 'mac-fitness' || facility.id === 'rac-fitness';
              return group === 'Popular' ? popular : !popular;
            }).map((facility) => {
              const expired =
                snapshot?.checkedAt == null ||
                now - snapshot.checkedAt.getTime() > 30 * 60_000;
              const percentage = expired
                ? null
                : (snapshot?.readings.find(
                    (reading) => reading.id === facility.id,
                  )?.percentage ?? null);
              return (
                <RevealRow
                  key={facility.id}
                  label={`${facility.name}, alternative times`}
                  summary={
                    <span className="occupancy-row">
                      <span className="facility-name">{facility.name}</span>
                      <span className="row-meter">
                      {percentage !== null ? (
                        <span
                          role="meter"
                          className="occupancy-meter"
                          data-level={
                            percentage < 35
                              ? "low"
                              : percentage < 65
                                ? "moderate"
                                : "high"
                          }
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={percentage}
                          aria-label={`${facility.name} occupancy`}
                        >
                          <span className="occupancy-fill" style={{ width: `${percentage}%` }} aria-hidden="true" />
                        </span>
                      ) : (
                        <div
                          className={`empty-meter ${loading ? "skeleton" : ""}`}
                          aria-hidden="true"
                        />
                      )}
                      </span>
                      <span className="occupancy-value">
                        {loading && !snapshot ? <span className="skeleton h-5 w-10 rounded" aria-label="Loading" /> : percentage === null ? <span className="unavailable-value">—</span> : `${percentage}%`}
                      </span>
                      <span className="occupancy-status" data-level={percentage === null ? 'unknown' : percentage < 35 ? 'low' : percentage < 65 ? 'moderate' : 'high'}>
                        {percentage === null ? (loading ? 'Checking' : 'Unavailable') : percentage < 35 ? 'Quiet' : percentage < 65 ? 'Not too busy' : 'Busy'}
                      </span>
                    </span>
                  }
                >
                  <HistoryDetails
                    mode="now"
                    livePercentage={stale || error ? null : percentage}
                    id={facility.id}
                    data={history.data}
                    error={history.error}
                  />
                </RevealRow>
              );
            })}
              </ul>
            </section>
          ))}
          <p className="reading-note">
            Readings from TMU may lag behind the gym.
          </p>
        </section>
      ) : (
        <section className="future-panel" aria-labelledby="future-heading">
          <h2 id="future-heading" className="mb-5 text-lg font-semibold">
            When are you thinking?
          </h2>
          <label htmlFor="gym-date" className="mb-2 block text-sm font-medium">
            Date · Toronto
          </label>
          <input
            id="gym-date"
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            className="mb-5"
          />
          <label htmlFor="gym-time" className="mb-2 block text-sm font-medium">
            Time to go{" "}
            <span className="font-normal text-muted">· Toronto time</span>
          </label>
          <input
            id="gym-time"
            type="time"
            value={time}
            onChange={(event) => setTime(event.target.value)}
          />
          <div className="mt-7 border-t border-line pt-6" role="status">
            <p className="mb-2 text-base font-medium">
              {time
                ? `Planning for ${timeLabel(time)}`
                : "Pick a time that works for you"}
            </p>
            <History date={date} time={time} />
          </div>
        </section>
      )}
      <footer className="site-footer">
        <span>An unofficial student project — not affiliated with TMU.</span>
        <a
          className="source-link"
          href={SOURCE_URL}
          target="_blank"
          rel="noreferrer"
        >
          Data from TMU <span aria-hidden="true">↗</span>
        </a>
        <div className="footer-appearance">
          <Appearance />
        </div>
      </footer>
    </main>
  );
}
