import { FACILITIES, SOURCE_URL } from '../shared/facilities';

const MAX_BYTES = 512 * 1024;
async function boundedHtml(response: Response): Promise<string> {
  if (!response.ok) throw new Error(`source_http_${response.status}`);
  if (!response.headers.get('content-type')?.includes('text/html')) throw new Error('source_not_html');
  if (!response.body) throw new Error('source_empty');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let size = 0, text = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) { await reader.cancel(); throw new Error('source_too_large'); }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally { reader.releaseLock(); }
}


export async function fetchLiveReadings(request: typeof fetch = fetch) {
  const response = await request(SOURCE_URL, {
    redirect: 'manual', signal: AbortSignal.timeout(15_000),
    headers: { 'Accept': 'text/html', 'User-Agent': 'TMU-Gym-Status/1.0 (+https://github.com/maibrandon/tmu-gym-status)' },
  });
  return parseSourceHtml(await boundedHtml(response));
}

// Native parsing avoids building a JavaScript DOM for the entire portal page.
export async function parseSourceHtml(html: string) {
  type Card = { name: string; count: string; hasName: boolean; hasCount: boolean };
  const cards: Card[] = [];
  let card: Card | undefined;
  let heading: Card | undefined;
  let count: Card | undefined;
  const rewriter = new HTMLRewriter()
    .on('.occupancy-card', { element(element) {
      card = { name: '', count: '', hasName: false, hasCount: false };
      cards.push(card);
      element.onEndTag(() => { card = undefined; });
    } })
    .on('.occupancy-card h2', {
      element(element) {
        if (!card || card.hasName) return;
        heading = card; card.hasName = true;
        element.onEndTag(() => { heading = undefined; });
      },
      text(chunk) { if (heading) heading.name += chunk.text; },
    })
    .on('.occupancy-card .occupancy-count', {
      element(element) {
        if (!card || card.hasCount) return;
        count = card; card.hasCount = true;
        element.onEndTag(() => { count = undefined; });
      },
      text(chunk) { if (count) count.count += chunk.text; },
    });
  // HTMLRewriter is lazy: consume the bounded response to run all handlers.
  await rewriter.transform(new Response(html)).arrayBuffer();
  const normalize = (value: string) => value
    .replace(/&(?:amp|#38|#x26);/gi, '&').replace(/&(?:nbsp|#160|#xa0);/gi, ' ')
    .replace(/\s+/g, ' ').trim().toLowerCase();
  const readings = FACILITIES.map(facility => {
    const text = cards.find(item => normalize(item.name) === normalize(facility.name))?.count.trim() ?? '';
    const match = /^(\d+(?:\.\d+)?)\s*%$/.exec(text);
    const value = match ? Number(match[1]) : NaN;
    return { ...facility, percentage: Number.isFinite(value) && value >= 0 && value <= 100 ? value : null };
  });
  if (readings.every(reading => reading.percentage === null)) throw new Error('source_no_readings');
  return readings;
}
