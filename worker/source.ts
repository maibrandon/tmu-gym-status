import { SOURCE_URL } from '../shared/facilities';
import { parseOccupancy } from '../shared/parser';

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
  return parseOccupancy(await boundedHtml(response));
}
