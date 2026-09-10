CREATE TABLE collection_runs (
  slot INTEGER PRIMARY KEY,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL CHECK (status IN ('running', 'success', 'partial', 'failed', 'skipped')),
  valid_count INTEGER NOT NULL DEFAULT 0,
  error TEXT
);
CREATE TABLE observations (
  facility_id TEXT NOT NULL,
  slot INTEGER NOT NULL REFERENCES collection_runs(slot),
  collected_at TEXT NOT NULL,
  percentage REAL NOT NULL CHECK (percentage >= 0 AND percentage <= 100),
  local_date TEXT NOT NULL,
  weekday INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  minute_of_day INTEGER NOT NULL CHECK (minute_of_day BETWEEN 0 AND 1439),
  source_url TEXT NOT NULL,
  source_updated_at TEXT,
  parser_version INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (facility_id, slot)
);
CREATE INDEX observations_history ON observations(facility_id, weekday, local_date, minute_of_day);
CREATE INDEX runs_latest_success ON collection_runs(status, slot DESC);
CREATE TABLE collector_lock (id INTEGER PRIMARY KEY CHECK(id = 1), token TEXT, lease_until INTEGER NOT NULL DEFAULT 0);
INSERT INTO collector_lock(id) VALUES (1);
