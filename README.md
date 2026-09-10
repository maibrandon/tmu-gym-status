# tmu-gym-status

A minimal React/TypeScript/Vite/Tailwind website for all six TMU gym spaces, with a Cloudflare Worker and D1 collection backend.

## Architecture

Cloudflare serves `dist/` and `/api/occupancy` from the same origin. Opening the page or pressing Refresh calls the Worker, which fetches TMU and returns current readings immediately after the upstream request completes. It does not wait for a scheduled snapshot. Shared caching is deferred to #4; for now each eligible API request contacts TMU.

Separately, Cron invokes the collector every five minutes to append historical observations to D1. Visitor requests never write historical observations, keeping popular visiting times from biasing the dataset. Both paths reuse the same bounded fetch/parser and enforce the hours/holiday gate. Future-time recommendations remain a placeholder until enough history exists.

Missing readings remain unavailable. Live fetch failures return an unavailable response; the current browser session can retain its prior successful reading, labelled outdated, for at most thirty minutes. “Last collected” is our fetch time, not TMU's measurement time. Source measurement timestamps are currently unknown.

## Local development

Use Node.js 22.22+ and npm:

```sh
npm ci
npm run cf:types
npm run db:local
npm run build
npm run dev:worker
```

The Worker serves the built app at `http://localhost:8787`. For frontend hot reload, run `npm run dev` in another terminal; Vite proxies `/api` to port 8787.

Trigger one local collection **during eligible hours**:

```sh
curl 'http://localhost:8787/cdn-cgi/handler/scheduled'
```

This makes a real TMU request but writes only to the local database. It respects the same holiday/hour gate and deduplicates by collection slot. Automated tests use controlled fixtures and isolated local D1; they never contact TMU.

```sh
npm test
npm run build
npx wrangler deploy --dry-run
```

Wrangler generates `worker-configuration.d.ts` locally; regenerate after editing bindings/variables.

## Collection policy

Owner-supplied Fall/Winter hours apply to all six spaces, effective September 8, 2026:

- Monday–Friday: 06:30 inclusive to 23:00 exclusive.
- Saturday–Sunday: 09:00 inclusive to 18:30 exclusive.
- Timezone: `America/Toronto`; the UTC cron runs year-round but exits without fetching outside these windows.
- No automatic term end: the owner will update the schedule manually.
- Skip Ontario's nine statutory holidays plus Civic Holiday. Conservative app policy also skips following substitute weekdays when actual holidays fall on weekends, resolving Christmas/Boxing Day collisions. This is an intentional data exclusion, not a claim that TMU is closed.
- Add extra closure dates to `EXTRA_EXCLUDED_DATES` in `shared/schedule.ts` and redeploy.

Holiday basis: [Ontario public holidays](https://www.ontario.ca/document/your-guide-employment-standards-act-0/public-holidays). Civic Holiday is the first Monday in August. Easter Monday, Remembrance Day, and Truth and Reconciliation Day are not part of the selected Ontario statutory-plus-Civic calendar; add manual exclusions if desired.

No closed/holiday observations are inserted, and those skips are not errors. Fetch failures never become zeroes or recycled observations. For scheduled collection, a D1 lease prevents overlap; the unique five-minute run slot prevents duplicate scheduled requests/writes. There are no immediate retries: the next eligible scheduled tick is the retry. A crashed run may remain `running`; an expired lease allows the next slot to continue without fabricating the missed data.

## Deploy and operate

All resources use the owner account recorded in `wrangler.jsonc`; `DB` points to the dedicated `tmu-gym-status` database. No credentials are committed. Initial deployment is manual; GitHub auto-deployment is not configured.

```sh
npx wrangler login
npm run cf:types
npm run db:remote
npm run deploy
```

**Pause collection:** set `COLLECTION_ENABLED` to `"false"` in `wrangler.jsonc`, regenerate types, and deploy. API/frontend remain available and report that collection is paused. Set it back to `"true"` and redeploy to resume. You can also remove the Cron Trigger in the dashboard for an immediate operational stop; reconcile config before the next deploy.

**Inspect collection:** Workers & Pages → tmu-gym-status → Logs, or `npx wrangler tail`. Logs include `collection_saved`, `collection_failed`, and expected `collection_skipped` events. D1 → tmu-gym-status → Console exposes run history:

```sql
SELECT slot, started_at, finished_at, status, valid_count, error
FROM collection_runs ORDER BY slot DESC LIMIT 20;
```

Investigate when three eligible five-minute windows pass without a saved run. This is currently a documented manual check; automatic alert delivery is not configured. Inspect errors, fix source/configuration, then allow the next scheduled run. Do not backfill gaps with current readings.

Export a backup with `npx wrangler d1 export DB --remote --output=/path/to/backup.sql`. Check D1 and Worker usage in the dashboard. Account limits are shared across projects. No paid upgrade is required or enabled by this setup; free-tier exhaustion can cause errors.

## Data and next steps

`observations` stores facility, collection slot/time, percentage, Toronto-local date/weekday/minute, source, and parser version. `collection_runs` tracks outcomes. The collector and API are the foundation of [issue #3](https://github.com/maibrandon/tmu-gym-status/issues/3); historical averaging, coverage thresholds, recommendations, retention, and automatic alerts remain future work.

Compute averages per facility/weekday/time bucket, first per local date and then across dates. A week of five-minute samples is still only one Wednesday. Do not present unsupported predictions.

[Server fetching (#5)](https://github.com/maibrandon/tmu-gym-status/issues/5) is implemented. [Shared caching (#4)](https://github.com/maibrandon/tmu-gym-status/issues/4) remains future work: even a visitor’s first page load should reuse a fresh result fetched for another visitor or by the scheduled collector. Both fetch paths will need shared coordination to avoid duplicate upstream requests.

Occupancy bars: green below 25%, yellow 25–under 50%, red 50%+. Unofficial student project, not affiliated with TMU. Technical access does not establish data-reuse permission.

## GitHub production deployment setup

Merge the Cloudflare implementation PR to `main` before connecting Builds. In the existing Worker's Settings → Builds, connect `maibrandon/tmu-gym-status` using the Cloudflare Workers & Pages GitHub App, restricted to this repository.

- Production branch: `main`; root directory: repository root.
- Build command: `npm run ci:build` (generates Worker types, runs tests, builds frontend/backend).
- Deploy command: `npx wrangler deploy`.
- Node.js build environment: `NODE_VERSION=22.22.0`.
- Disable builds for non-production branches for now. Preview environments require a separate D1 database and disabled scheduled collection before enabling them.
- Cloudflare installs dependencies from the committed npm lockfile. No local OAuth credentials belong in GitHub.

The production D1 schema is already applied. Future schema changes require a reviewed migration before deploying dependent code; the deploy command deliberately does not apply migrations automatically.

Connecting the GitHub App and observing a successful build from `main` are still required to activate and verify automatic deployment. Until then, production remains the manually uploaded version.
