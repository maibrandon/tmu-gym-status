import { readFileSync, readdirSync } from 'node:fs';
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
  const statements = readdirSync('migrations').filter(f=>f.endsWith('.sql')).sort().flatMap(f=>readFileSync(`migrations/${f}`, 'utf8').split(';').map(s=>s.trim()).filter(Boolean));
  for (const statement of statements) await db.prepare(statement).run();
  env = { DB: db, COLLECTION_ENABLED: 'true' } as Env;
}, 30000);
afterAll(async () => { await runtime?.dispose(); });
beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM history_daily_buckets'), env.DB.prepare('DELETE FROM latest_snapshot'), env.DB.prepare('DELETE FROM history_aggregates'),
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
    const data=await (await worker.fetch(new Request('http://localhost/api/occupancy'),env)).json();
    expect(data.readings.map((r:{percentage:number|null})=>r.percentage)).toEqual([40,null,null,null,null,null]);
  });
  it('serves 100 cold requests without contacting TMU or writing observations', async () => {
    const request = vi.fn(); vi.stubGlobal('fetch',request);
    const responses = await Promise.all(Array.from({length:100},()=>worker.fetch(new Request('http://localhost/api/occupancy'),env)));
    for (const response of responses) {
      const data = await response.json();
      expect(data.checkedAt).toBeNull();
      expect(data.readings.every((r:{percentage:number|null})=>r.percentage===null)).toBe(true);
    }
    expect(request).not.toHaveBeenCalled();
    expect((await env.DB.prepare('SELECT * FROM observations').all()).results).toHaveLength(0);
  });
  it('serves 100 warm requests from one collection without changing timestamps or history', async()=>{
    const upstream=vi.fn(async()=>source());
    await collect(env,now,upstream);
    const request=vi.fn();vi.stubGlobal('fetch',request);
    const responses=await Promise.all(Array.from({length:100},()=>worker.fetch(new Request('http://localhost/api/occupancy'),env)));
    for(const response of responses) expect((await response.json()).checkedAt).toBe(now.toISOString());
    expect(upstream).toHaveBeenCalledTimes(1);expect(request).not.toHaveBeenCalled();
    expect((await env.DB.prepare('SELECT * FROM observations').all()).results).toHaveLength(6);
  });
  it.each([[9.999,false,true],[10,true,true],[30,true,true],[30.001,false,false]])('enforces snapshot age %s minutes',async(minutes,stale,available)=>{
    await collect(env,now,async()=>source());
    vi.setSystemTime(new Date(now.getTime()+Number(minutes)*60000));
    const data=await (await worker.fetch(new Request('http://localhost/api/occupancy'),env)).json();
    expect(data.stale).toBe(stale);
    expect(data.checkedAt).toBe(available?now.toISOString():null);
  });
  it('preserves the snapshot when a later collection fails',async()=>{
    await collect(env,now,async()=>source());
    const later=new Date(now.getTime()+5*60000);vi.setSystemTime(later);
    await expect(collect(env,later,async()=>new Response('error',{status:503}))).rejects.toThrow();
    const data=await (await worker.fetch(new Request('http://localhost/api/occupancy'),env)).json();
    expect(data.checkedAt).toBe(now.toISOString());expect(data.stale).toBe(true);
    expect((await env.DB.prepare('SELECT * FROM observations').all()).results).toHaveLength(6);
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
  it('does not contact a failing upstream on visitor requests', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('error', { status: 503 })));
    expect((await worker.fetch(new Request('http://localhost/api/occupancy'), env)).status).toBe(200);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('does not collect while the operator pause switch is off', async () => {
    const request = vi.fn();
    await collect({ ...env, COLLECTION_ENABLED: 'false' } as Env, now, request);
    expect(request).not.toHaveBeenCalled();
  });
});

// Historical queries execute against the same isolated D1 runtime as collection tests.
import { historicalResponse as cachedHistoricalResponse } from '../worker/history';
import { refreshAggregates } from '../worker/aggregates';
async function historicalResponse(url:URL, bindings:Env, date:Date) {
  await refreshAggregates(bindings,date);
  return cachedHistoricalResponse(url,bindings,date);
}
import { localInstant } from '../shared/history';
async function seedDay(date: string, minute: number, percentage: number, count: number) {
  for(let i=0;i<count;i++) {
    const instant=localInstant(date,minute+i*5);
    const slot=Math.floor(instant.getTime()/300000);
    await env.DB.prepare("INSERT OR IGNORE INTO collection_runs(slot,started_at,status) VALUES (?,?,'success')").bind(slot,instant.toISOString()).run();
    await env.DB.prepare('INSERT INTO observations(facility_id,slot,collected_at,percentage,local_date,weekday,minute_of_day,source_url) VALUES (?,?,?,?,?,?,?,?)').bind('mac-fitness',slot,instant.toISOString(),percentage,date,new Date(`${date}T12:00:00Z`).getUTCDay(),minute+i*5,'fixture').run();
  }
}
it('weights days equally and excludes sparse buckets, with supported quieter alternatives', async()=>{
  await seedDay('2026-09-10',1080,20,3);
  await seedDay('2026-09-17',1080,80,6);
  await seedDay('2026-09-17',1110,20,3);
  await seedDay('2026-09-17',1140,0,2);
  const response=await historicalResponse(new URL('http://test/api/history?date=2026-09-24&time=18:00'),env,new Date('2026-09-18T18:00:00Z'));
  const data=await response.json();
  expect(data.facilities[0].baseline).toMatchObject({percentage:50,dates:2,observations:9});
  expect(data.facilities[0].alternatives.map((b:{minute:number})=>b.minute)).toEqual([1110]);
  expect(data.facilities[1].baseline).toBeNull();
});
it('supports one completed day without pretending it is multi-week coverage', async()=>{
  await seedDay('2026-09-10',1080,0,3);
  const data=await (await historicalResponse(new URL('http://test/api/history?date=2026-09-17&time=18:00'),env,new Date('2026-09-10T23:00:00Z'))).json();
  expect(data.facilities[0].baseline).toMatchObject({percentage:0,dates:1});
});
it('does not estimate holidays, past times, invalid dates, or stale history', async()=>{
  await seedDay('2026-09-10',1080,30,3);
  const current=new Date('2026-10-09T18:00:00Z');
  const query=(params:string)=>historicalResponse(new URL(`http://test/api/history?${params}`),env,current);
  expect((await (await query('date=2026-10-12&time=18:00')).json()).state).toBe('holiday');
  expect((await query('date=2026-02-30&time=18:00')).status).toBe(400);
  expect((await query('date=2026-09-10&time=18:00')).status).toBe(400);
  expect((await (await query('date=2026-10-15&time=18:00')).json()).facilities[0].baseline).toBeNull();
});
it('converts Toronto winter and summer planning times correctly',()=>{
  expect(localInstant('2026-09-17',1080).toISOString()).toBe('2026-09-17T22:00:00.000Z');
  expect(localInstant('2026-12-17',1080).toISOString()).toBe('2026-12-17T23:00:00.000Z');
});
it('uses other weekday averages for missing Wednesday buckets and prefers matching Wednesday data',async()=>{
 await seedDay('2026-09-14',1140,20,3);
 await seedDay('2026-09-15',1140,40,6);
 await seedDay('2026-09-14',1170,5,3);
 await seedDay('2026-09-16',1170,65,3);
 const data=await (await historicalResponse(new URL('http://test/api/history?date=2026-09-23&time=19:00'),env,new Date('2026-09-17T18:00:00Z'))).json();
 expect(data.facilities[0].baseline).toMatchObject({percentage:30,dates:2,observations:9,basis:'weekday'});
 // Wednesday's 65% beats Monday's 5% as the appropriate reference; it isn't a quieter alternative.
 expect(data.facilities[0].alternatives).toEqual([]);
 const exact=await (await historicalResponse(new URL('http://test/api/history?date=2026-09-23&time=19:30'),env,new Date('2026-09-17T18:00:00Z'))).json();
 expect(exact.facilities[0].baseline).toMatchObject({percentage:65,dates:1,basis:'matching-weekday'});
});
it('does not borrow weekday readings for weekend suggestions',async()=>{
 await seedDay('2026-09-14',1080,20,3);
 const data=await (await historicalResponse(new URL('http://test/api/history?date=2026-09-19&time=18:00'),env,new Date('2026-09-17T18:00:00Z'))).json();
 expect(data.facilities[0].baseline).toBeNull();
 expect(data.facilities[0].alternatives).toEqual([]);
});

it('averages matching weekday dates equally across weeks',async()=>{
 await seedDay('2026-09-09',1140,20,3);
 await seedDay('2026-09-16',1140,40,6);
 await seedDay('2026-09-15',1140,95,6);
 const data=await (await historicalResponse(new URL('http://test/api/history?date=2026-09-23&time=19:00'),env,new Date('2026-09-17T18:00:00Z'))).json();
 expect(data.facilities[0].baseline).toMatchObject({percentage:30,dates:2,observations:9,basis:'matching-weekday'});
});

it('reads historical aggregates without rebuilding on visitor requests and expires them',async()=>{
 await seedDay('2026-09-10',1080,40,3);
 const built=new Date('2026-09-10T23:00:00Z');
 await refreshAggregates(env,built);
 // Removing raw rows proves visitor reads use stored aggregates, not observations.
 await env.DB.prepare('DELETE FROM observations').run();
 const url=new URL('http://test/api/history?date=2026-09-17&time=18:00');
 for(let i=0;i<3;i++) expect((await (await cachedHistoricalResponse(url,env,built)).json()).facilities[0].baseline.percentage).toBe(40);
 expect((await (await cachedHistoricalResponse(url,env,new Date(built.getTime()+86400001))).json()).state).toBe('unavailable');
});
it('keeps successful snapshots and observations if aggregation fails',async()=>{
 await env.DB.prepare('DROP TABLE history_aggregates').run();
 try {
  await collect(env,now,async()=>source());
  expect((await env.DB.prepare('SELECT status FROM collection_runs').first())?.status).toBe('success');
  expect((await env.DB.prepare('SELECT * FROM latest_snapshot').first())?.collected_at).toBe(now.toISOString());
 } finally {
  await env.DB.prepare('CREATE TABLE history_aggregates (weekday INTEGER PRIMARY KEY, generated_at TEXT NOT NULL, buckets_json TEXT NOT NULL)').run();
 }
});

it('rolls back observations if snapshot publication fails',async()=>{
 await env.DB.prepare(`CREATE TRIGGER block_snapshot BEFORE INSERT ON latest_snapshot BEGIN SELECT RAISE(ABORT,'fixture write failure'); END`).run();
 try {
  await expect(collect(env,now,async()=>source())).rejects.toThrow();
  expect((await env.DB.prepare('SELECT * FROM observations').all()).results).toHaveLength(0);
  expect((await env.DB.prepare('SELECT * FROM latest_snapshot').all()).results).toHaveLength(0);
  expect((await env.DB.prepare('SELECT status FROM collection_runs').first())?.status).toBe('failed');
 } finally { await env.DB.prepare('DROP TRIGGER block_snapshot').run(); }
});
it('clears failure state after the next successful scheduled collection',async()=>{
 await collect(env,now,async()=>source());
 const failed=new Date(now.getTime()+300000);vi.setSystemTime(failed);
 await expect(collect(env,failed,async()=>new Response('error',{status:503}))).rejects.toThrow();
 const recovered=new Date(now.getTime()+600000);vi.setSystemTime(recovered);
 await collect(env,recovered,async()=>source());
 const data=await (await worker.fetch(new Request('http://localhost/api/occupancy'),env)).json();
 expect(data.stale).toBe(false);expect(data.checkedAt).toBe(recovered.toISOString());
});

it('retains prior daily summaries while updating newly completed buckets',async()=>{
 await seedDay('2026-09-10',1080,20,3);
 await refreshAggregates(env,new Date('2026-09-10T23:00:00Z'));
 await refreshAggregates(env,new Date('2026-09-11T23:00:00Z'));
 // A subsequent refresh must reuse this older day's saved summary.
 await env.DB.prepare('DELETE FROM observations').run();
 await seedDay('2026-09-17',1080,80,6);
 await refreshAggregates(env,new Date('2026-09-17T23:00:00Z'));
 const data=await (await cachedHistoricalResponse(new URL('http://test/api/history?date=2026-09-24&time=18:00'),env,new Date('2026-09-17T23:00:00Z'))).json();
 expect(data.facilities[0].baseline).toMatchObject({percentage:50,dates:2});
});
