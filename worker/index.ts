import { FACILITIES } from '../shared/facilities';
import { collectionWindow } from '../shared/schedule';
import { collect } from './collector';
import { fetchLiveReadings } from './source';

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
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
      // Each page load/refresh fetches live data until shared caching ships in #4.
      // Visitor traffic never writes historical observations.
      const checkedAt = new Date().toISOString();
      const readings = await fetchLiveReadings();
      return Response.json({ readings, checkedAt, stale: false, collectionState: 'open', message: null }, { headers });
    } catch {
      console.error(JSON.stringify({ event: 'occupancy_read_failed' }));
      return Response.json({ error: 'Occupancy is temporarily unavailable. Please try again.' }, { status: 503, headers });
    }
  },
  async scheduled(_controller, env) { await collect(env); },
} satisfies ExportedHandler<Env>;
