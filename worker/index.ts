import { historicalResponse } from './history';
import { FACILITIES } from '../shared/facilities';
import { collectionWindow } from '../shared/schedule';
import { collect } from './collector';
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
      if (window.state !== 'open') {
        return Response.json({
          readings: FACILITIES.map(facility => ({ ...facility, percentage: null })),
          checkedAt: null, stale: false, collectionState: window.state, message: window.reason,
        }, { headers });
      }
      const snapshot = await env.DB.prepare('SELECT collected_at, readings_json, refresh_failed FROM latest_snapshot WHERE id = 1')
        .first<{collected_at:string;readings_json:string;refresh_failed:number}>();
      const age = snapshot ? now.getTime()-Date.parse(snapshot.collected_at) : Infinity;
      if (!snapshot || !Number.isFinite(age) || age < 0 || age > 30*60_000) {
        return Response.json({readings:FACILITIES.map(f=>({...f,percentage:null})),checkedAt:null,
          stale:false,collectionState:'open',message:'Occupancy is awaiting a successful scheduled update.'},{headers});
      }
      const stale = snapshot.refresh_failed === 1 || age >= 10*60_000;
      const readings = JSON.parse(snapshot.readings_json) as Reading[];
      return Response.json({readings,checkedAt:snapshot.collected_at,stale,collectionState:'open',
        message:stale?'Showing the last collected readings; the scheduled update is delayed.':null},{headers});
    } catch (error) {
      console.error(JSON.stringify({ event: 'occupancy_snapshot_read_failed', error: error instanceof Error ? error.message.slice(0,250) : 'unknown' }));
      return Response.json({ error: 'Occupancy is temporarily unavailable. Please try again.' }, { status: 503, headers });
    }
  },
  async scheduled(_controller, env) { await collect(env); },
} satisfies ExportedHandler<Env>;
