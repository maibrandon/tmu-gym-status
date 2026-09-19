import { historicalResponse } from './history';
import { FACILITIES } from '../shared/facilities';
import { collectionWindow } from '../shared/schedule';
import { collect, SLOT_MS, isFresh, readSnapshot, waitForSnapshot } from './collector';
import { refreshAggregates } from './aggregates';
import type { Reading } from '../shared/facilities';

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/api/history') {
      if (request.method !== 'GET') return new Response('Method not allowed', {status:405});
      try { return await historicalResponse(url, env); } catch (error) {
        console.error(JSON.stringify({event:'history_read_failed',error:error instanceof Error?error.message.slice(0,250):'unknown'}));
        return Response.json({error:'Historical context is temporarily unavailable.'},{status:503});
      }
    }
    if (url.pathname !== '/api/occupancy') {
      if (url.pathname.startsWith('/api/')) return new Response('Not found', { status: 404 });
      return env.ASSETS.fetch(request);
    }
    if (request.method !== 'GET') return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET' } });
    const headers = { 'Cache-Control': 'no-store' };
    try {
      const now = new Date();
      const window = env.COLLECTION_ENABLED === 'true' ? collectionWindow(now) : { state: 'paused', reason: 'Collection is paused.' };
      const closedResponse = (state: string, reason: string | null) => Response.json({
          readings: FACILITIES.map(facility => ({ ...facility, percentage: null })),
          checkedAt: null, stale: false, collectionState: state, message: reason,
        }, { headers });
      if (window.state !== 'open') return closedResponse(window.state, window.reason);
      let snapshot = await readSnapshot(env);
      if (!isFresh(snapshot, now)) {
        try {
          const result = await collect(env, now);
          snapshot = await readSnapshot(env);
          const age = snapshot ? Date.now() - Date.parse(snapshot.collected_at) : Infinity;
          if (result === 'busy' && (!snapshot || !Number.isFinite(age) || age < 0 || age > 30*60_000)) {
            snapshot = await waitForSnapshot(env);
          }
        } catch {
          // The collector logs failures and sets the shared retry cooldown.
          snapshot = await readSnapshot(env);
        }
      }
      const afterRefresh = collectionWindow(new Date());
      if (afterRefresh.state !== 'open') return closedResponse(afterRefresh.state, afterRefresh.reason);
      const age = snapshot ? Date.now()-Date.parse(snapshot.collected_at) : Infinity;
      if (!snapshot || !Number.isFinite(age) || age < 0 || age > 30*60_000) {
        return Response.json({readings:FACILITIES.map(f=>({...f,percentage:null})),checkedAt:null,
          stale:false,collectionState:'open',message:'Live occupancy is temporarily unavailable. Please try again shortly.'},{headers});
      }
      const stale = snapshot.refresh_failed === 1 || age >= 10*60_000;
      const readings = JSON.parse(snapshot.readings_json) as Reading[];
      return Response.json({readings,checkedAt:snapshot.collected_at,stale,collectionState:'open',
        message:stale?'Showing the last collected readings; the latest refresh is delayed.':null},{headers});
    } catch (error) {
      console.error(JSON.stringify({ event: 'occupancy_snapshot_read_failed', error: error instanceof Error ? error.message.slice(0,250) : 'unknown' }));
      return Response.json({ error: 'Occupancy is temporarily unavailable. Please try again.' }, { status: 503, headers });
    }
  },
  async scheduled(controller, env) {
    if (controller.cron === '2,32 * * * *') {
      if (env.COLLECTION_ENABLED === 'true') await refreshAggregates(env);
    } else {
      // Allow source latency/jitter without skipping every second five-minute tick.
      await collect(env, new Date(), fetch, SLOT_MS - 15_000);
    }
  },
} satisfies ExportedHandler<Env>;
