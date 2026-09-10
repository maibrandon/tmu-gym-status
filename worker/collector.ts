import { SOURCE_URL } from '../shared/facilities';
import { fetchLiveReadings } from './source';
import { collectionWindow, torontoParts } from '../shared/schedule';

export const SLOT_MS = 5 * 60_000;

export async function collect(env: Env, now = new Date(), request: typeof fetch = fetch) {
  const window = collectionWindow(now);
  if (env.COLLECTION_ENABLED !== 'true' || window.state !== 'open') {
    console.log(JSON.stringify({ event: 'collection_skipped', reason: env.COLLECTION_ENABLED !== 'true' ? 'paused' : window.state }));
    return;
  }
  const slot = Math.floor(now.getTime() / SLOT_MS);
  const token = crypto.randomUUID();
  const lock = await env.DB.prepare('UPDATE collector_lock SET token = ?, lease_until = ? WHERE id = 1 AND lease_until <= ?')
    .bind(token, now.getTime() + 60_000, now.getTime()).run();
  if (!lock.meta.changes) return;
  try {
    const claimed = await env.DB.prepare("INSERT OR IGNORE INTO collection_runs(slot, started_at, status) VALUES (?, ?, 'running')")
      .bind(slot, now.toISOString()).run();
    if (!claimed.meta.changes) return;
    // Recheck wall-clock eligibility after awaiting DB work, especially at closing time.
    if (collectionWindow(new Date()).state !== 'open') {
      await env.DB.prepare("UPDATE collection_runs SET status = 'skipped', finished_at = ? WHERE slot = ?").bind(new Date().toISOString(), slot).run();
      return;
    }
    try {
      const fetchedAt = new Date();
      const readings = await fetchLiveReadings(request);
      const valid = readings.filter(reading => reading.percentage !== null);
      const local = torontoParts(fetchedAt);
      const writes = valid.map(reading => env.DB.prepare(`INSERT INTO observations
        (facility_id, slot, collected_at, percentage, local_date, weekday, minute_of_day, source_url)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(reading.id, slot, fetchedAt.toISOString(), reading.percentage, local.date, local.weekday, local.minute, SOURCE_URL));
      writes.push(env.DB.prepare('UPDATE collection_runs SET status = ?, finished_at = ?, valid_count = ? WHERE slot = ?')
        .bind(valid.length === 6 ? 'success' : 'partial', new Date().toISOString(), valid.length, slot));
      await env.DB.batch(writes);
      console.log(JSON.stringify({ event: 'collection_saved', slot, validCount: valid.length }));
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 250) : 'collection_failed';
      await env.DB.prepare("UPDATE collection_runs SET status = 'failed', finished_at = ?, error = ? WHERE slot = ?")
        .bind(new Date().toISOString(), message, slot).run();
      console.error(JSON.stringify({ event: 'collection_failed', slot, error: message }));
      throw error;
    }
  } finally {
    await env.DB.prepare('UPDATE collector_lock SET lease_until = 0, token = NULL WHERE id = 1 AND token = ?').bind(token).run();
  }
}
