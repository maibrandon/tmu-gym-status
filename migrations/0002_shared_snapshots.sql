CREATE TABLE latest_snapshot (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  collected_at TEXT NOT NULL,
  readings_json TEXT NOT NULL,
  refresh_failed INTEGER NOT NULL DEFAULT 0 CHECK (refresh_failed IN (0,1))
);
CREATE TABLE history_aggregates (
  weekday INTEGER PRIMARY KEY CHECK (weekday BETWEEN 0 AND 6),
  generated_at TEXT NOT NULL,
  buckets_json TEXT NOT NULL
);

CREATE INDEX observations_date ON observations(local_date);

CREATE TABLE history_daily_buckets (
  facility_id TEXT NOT NULL,
  local_date TEXT NOT NULL,
  weekday INTEGER NOT NULL,
  minute INTEGER NOT NULL,
  percentage REAL NOT NULL,
  observations INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (local_date, facility_id, minute)
);
