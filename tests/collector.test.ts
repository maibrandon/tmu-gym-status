import { readFileSync } from 'node:fs';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { beforeAll, afterAll, beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { collect } from '../worker/collector';
import worker from '../worker/index';
import { FACILITIES } from '../shared/facilities';

let runtime: Miniflare;
let env: Env;
const now = new Date('2026-09-10T18:00:00Z');
const html = FACILITIES.map((facility, i) => `<div class="occupancy-card"><h2>${facility.name}</h2><p class="occupancy-count">${i * 10}%</p></div>`).join('');
const source = () => new Response(html, { headers: { 'content-type': 'text/html' } });
beforeAll(async () => {
  runtime = new Miniflare(convertV4MiniflareOptions({ name: 'test', compatibilityDate: '2026-09-10', modules: true, script: 'export default {fetch(){return new Response("test")}}', d1Databases: ['DB'] }));
  const db = await runtime.getD1Database('DB');
  const statements = readFileSync('migrations/0001_collection.sql', 'utf8').split(';').map(s => s.trim()).filter(Boolean);
  for (const statement of statements) await db.prepare(statement).run();
  env = { DB: db, COLLECTION_ENABLED: 'true' } as Env;
}, 30000);
afterAll(async () => { await runtime?.dispose(); });
beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM observations'), env.DB.prepare('DELETE FROM collection_runs'),
    env.DB.prepare('UPDATE collector_lock SET token = NULL, lease_until = 0'),
  ]);
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(now);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('collector with local D1', () => {
  it('stores six readings atomically, keeps zero, and deduplicates concurrent runs', async () => {
    const request = vi.fn(async () => source());
    await Promise.all([collect(env, now, request), collect(env, now, request)]);
    await collect(env, now, request);
    expect(request).toHaveBeenCalledTimes(1);
    const rows = await env.DB.prepare('SELECT * FROM observations').all();
    expect(rows.results).toHaveLength(6);
    expect(rows.results[0].percentage).toBe(0);
    vi.stubGlobal('fetch', vi.fn(async () => source()));
    const response = await worker.fetch(new Request('http://localhost/api/occupancy'), env);
    const data = await response.json();
    expect(data.readings.map((r: { percentage: number }) => r.percentage)).toEqual([0,10,20,30,40,50]);
    expect(data.checkedAt).toBe(now.toISOString());
    expect(data.stale).toBe(false);
    expect(request).toHaveBeenCalledTimes(1);
  });
  it.each(['2026-09-11T03:00:00Z','2026-10-12T15:00:00Z','2027-08-02T15:00:00Z'])('does not fetch or write on excluded time %s', async (date) => {
    vi.setSystemTime(new Date(date));
    const request = vi.fn();
    await collect(env, new Date(date), request);
    expect(request).not.toHaveBeenCalled();
    expect((await env.DB.prepare('SELECT * FROM collection_runs').all()).results).toHaveLength(0);
  });
  it('records a source failure without inserting observations or retrying the same slot', async () => {
    const request = vi.fn(async () => new Response('error', { status: 503 }));
    await expect(collect(env, now, request)).rejects.toThrow('source_http_503');
    await collect(env, now, request);
    expect(request).toHaveBeenCalledTimes(1);
    expect((await env.DB.prepare('SELECT * FROM observations').all()).results).toHaveLength(0);
    expect((await env.DB.prepare('SELECT status FROM collection_runs').first())?.status).toBe('failed');
  });
  it('stores partial readings without inventing missing facilities', async () => {
    await collect(env, now, async () => new Response('<div class="occupancy-card"><h2>MAC Fitness Centre</h2><p class="occupancy-count">40%</p></div>', { headers: { 'content-type': 'text/html' } }));
    expect((await env.DB.prepare('SELECT * FROM observations').all()).results).toHaveLength(1);
    expect((await env.DB.prepare('SELECT status FROM collection_runs').first())?.status).toBe('partial');
  });
  it('fetches on the first visit with an empty database and again on refresh', async () => {
    const request = vi.fn(async () => source());
    vi.stubGlobal('fetch', request);
    for (let i = 0; i < 2; i++) {
      const response = await worker.fetch(new Request('http://localhost/api/occupancy'), env);
      const data = await response.json();
      expect(response.status).toBe(200);
      expect(response.headers.get('Cache-Control')).toBe('no-store');
      expect(data.readings.map((r: { percentage: number }) => r.percentage)).toEqual([0,10,20,30,40,50]);
      expect(data.checkedAt).toBe(now.toISOString());
    }
    expect(request).toHaveBeenCalledTimes(2);
    expect((await env.DB.prepare('SELECT * FROM observations').all()).results).toHaveLength(0);
  });
  it.each(['2026-09-11T03:00:00Z','2026-10-12T15:00:00Z'])('does not fetch live data outside the collection policy: %s', async date => {
    vi.setSystemTime(new Date(date));
    const request = vi.fn();
    vi.stubGlobal('fetch', request);
    const data = await (await worker.fetch(new Request('http://localhost/api/occupancy'), env)).json();
    expect(request).not.toHaveBeenCalled();
    expect(data.readings.every((r: { percentage: number | null }) => r.percentage === null)).toBe(true);
    expect(data.checkedAt).toBe(null);
  });
  it('returns unavailable when the live upstream fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('error', { status: 503 })));
    expect((await worker.fetch(new Request('http://localhost/api/occupancy'), env)).status).toBe(503);
  });
  it('does not collect while the operator pause switch is off', async () => {
    const request = vi.fn();
    await collect({ ...env, COLLECTION_ENABLED: 'false' } as Env, now, request);
    expect(request).not.toHaveBeenCalled();
  });
});
