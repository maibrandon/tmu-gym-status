import { SOURCE_URL } from '../shared/facilities';
import { fetchLiveReadings } from './source';
import { collectionWindow, torontoParts } from '../shared/schedule';

export const SLOT_MS = 5 * 60_000;
const LEASE_MS = 60_000;
export type Snapshot = { collected_at: string; readings_json: string; refresh_failed: number };
export const readSnapshot = (env: Env) => env.DB.prepare(
  'SELECT collected_at, readings_json, refresh_failed FROM latest_snapshot WHERE id = 1',
).first<Snapshot>();
export function isFresh(snapshot: Snapshot | null, now: Date, maximumAge = SLOT_MS) {
  const age = snapshot ? now.getTime() - Date.parse(snapshot.collected_at) : Infinity;
  return age >= 0 && age < maximumAge;
}

// Both Cron and visitor recovery use this database-wide lease. A null token with
// a future lease_until is a failure cooldown; a crashed owner expires naturally.
export async function collect(env: Env, now = new Date(), request: typeof fetch = fetch, maximumAge = SLOT_MS) {
  if (env.COLLECTION_ENABLED !== 'true' || collectionWindow(now).state !== 'open') return 'skipped';
  if (isFresh(await readSnapshot(env), now, maximumAge)) return 'fresh';
  const token = crypto.randomUUID();
  const lock = await env.DB.prepare('UPDATE collector_lock SET token = ?, lease_until = ? WHERE id = 1 AND lease_until <= ?')
    .bind(token, Date.now() + LEASE_MS, Date.now()).run();
  if (!lock.meta.changes) return 'busy';
  let releaseAt = 0;
  let slot: number | undefined;
  let stage = 'claim';
  try {
    // Another invocation may have published between our first read and claim.
    if (isFresh(await readSnapshot(env), new Date(), maximumAge)) return 'fresh';
    if (collectionWindow(new Date()).state !== 'open') return 'skipped';
    const startedAt = new Date();
    slot = Math.floor(startedAt.getTime() / SLOT_MS);
    await env.DB.batch([
      env.DB.prepare(`UPDATE collection_runs SET status='failed',finished_at=?,error='collector_lease_expired'
        WHERE status='running' AND slot<>? AND EXISTS (SELECT 1 FROM collector_lock WHERE id=1 AND token=?)`)
        .bind(startedAt.toISOString(), slot, token),
      env.DB.prepare(`INSERT INTO collection_runs(slot, started_at, status)
        SELECT ?, ?, 'running' WHERE EXISTS (SELECT 1 FROM collector_lock WHERE id=1 AND token=? AND lease_until>?)
        ON CONFLICT(slot) DO UPDATE SET started_at=excluded.started_at,status='running',finished_at=NULL,error=NULL,valid_count=0`)
        .bind(slot, startedAt.toISOString(), token, startedAt.getTime()),
    ]);
    if (collectionWindow(new Date()).state !== 'open') {
      await env.DB.prepare("UPDATE collection_runs SET status='skipped',finished_at=? WHERE slot=? AND status='running'")
        .bind(new Date().toISOString(), slot).run();
      return 'skipped';
    }
    stage = 'source';
    console.log(JSON.stringify({ event: 'collection_source_started', slot }));
    const readings = await fetchLiveReadings(request);
    const fetchedAt = new Date();
    const valid = readings.filter(reading => reading.percentage !== null);
    const local = torontoParts(startedAt);
    console.log(JSON.stringify({ event: 'collection_source_parsed', slot, validCount: valid.length }));
    // Fence every write so an expired lease holder cannot overwrite its successor.
    const fence = 'EXISTS (SELECT 1 FROM collector_lock WHERE id=1 AND token=? AND lease_until>?)';
    const fenceTime = fetchedAt.getTime();
    const writes = valid.map(reading => env.DB.prepare(`INSERT INTO observations
      (facility_id, slot, collected_at, percentage, local_date, weekday, minute_of_day, source_url)
      SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE ${fence}
      ON CONFLICT(facility_id,slot) DO NOTHING`)
      .bind(reading.id, slot, fetchedAt.toISOString(), reading.percentage, local.date, local.weekday, local.minute, SOURCE_URL, token, fenceTime));
    writes.push(env.DB.prepare(`UPDATE collection_runs SET status=?,finished_at=?,valid_count=? WHERE slot=? AND ${fence}`)
      .bind(valid.length === 6 ? 'success' : 'partial', fetchedAt.toISOString(), valid.length, slot, token, fenceTime));
    writes.push(env.DB.prepare(`INSERT INTO latest_snapshot(id,collected_at,readings_json)
      SELECT 1,?,? WHERE ${fence}
      ON CONFLICT(id) DO UPDATE SET collected_at=excluded.collected_at,readings_json=excluded.readings_json,refresh_failed=0
      WHERE excluded.collected_at > latest_snapshot.collected_at`)
      .bind(fetchedAt.toISOString(), JSON.stringify(readings), token, fenceTime));
    stage = 'storage';
    const results = await env.DB.batch(writes);
    if (!results.at(-1)?.meta.changes) return 'skipped';
    console.log(JSON.stringify({ event: 'collection_saved', slot, validCount: valid.length }));
    return 'updated';
  } catch (error) {
    releaseAt = Date.now() + LEASE_MS;
    const message = error instanceof Error ? error.message.slice(0, 250) : 'collection_failed';
    await env.DB.batch([
      env.DB.prepare(`UPDATE collection_runs SET status='failed',finished_at=?,error=? WHERE slot=?
        AND EXISTS (SELECT 1 FROM collector_lock WHERE id=1 AND token=?)`)
        .bind(new Date().toISOString(), message, slot ?? -1, token),
      env.DB.prepare(`UPDATE latest_snapshot SET refresh_failed=1 WHERE id=1
        AND EXISTS (SELECT 1 FROM collector_lock WHERE id=1 AND token=?)`).bind(token),
    ]);
    console.error(JSON.stringify({ event: 'collection_failed', stage, slot, error: message }));
    throw error;
  } finally {
    await env.DB.prepare('UPDATE collector_lock SET lease_until=?,token=NULL WHERE id=1 AND token=?')
      .bind(releaseAt, token).run();
  }
}

// Cold visitors wait for the owner, never launch competing source requests.
// At most 16 reads over ~16 seconds; stale snapshots can be returned immediately.
export async function waitForSnapshot(env: Env) {
  for (let attempt = 0; attempt < 16; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    const snapshot = await readSnapshot(env);
    if (isFresh(snapshot, new Date())) return snapshot;
    const lock = await env.DB.prepare('SELECT token,lease_until FROM collector_lock WHERE id=1')
      .first<{token:string|null;lease_until:number}>();
    if (!lock?.token || lock.lease_until <= Date.now()) return snapshot;
  }
  return readSnapshot(env);
}
