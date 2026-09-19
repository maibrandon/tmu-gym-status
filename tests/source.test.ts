import { beforeAll, afterAll, expect, it } from 'vitest';
import { createSourceRuntime } from './source-runtime';
import { FACILITIES } from '../shared/facilities';
let parser: Awaited<ReturnType<typeof createSourceRuntime>>;
beforeAll(async () => { parser = await createSourceRuntime(); });
afterAll(async () => { await parser.dispose(); });
const response = (html: string) => new Response(html, {headers:{'content-type':'text/html'}});
it('parses nested names, encoded ampersands, first mobile/desktop percentages, and zero', async () => {
  const html = FACILITIES.map((facility, i) => `<div class="occupancy-card"><h2><span>${facility.name.replace('&','&amp;')}</span></h2>
    <canvas data-occupancy="999"></canvas><p class="occupancy-count"><b>${i*10}</b>%</p><p class="occupancy-count">99%</p></div>`).join('');
  expect(await parser.parse(response(html))).toEqual(FACILITIES.map((f,i)=>({...f,percentage:i*10})));
});
it('leaves invalid percentages unavailable without borrowing other cards', async () => {
  const html = FACILITIES.map((f,i)=>`<div class="occupancy-card"><h2>${f.name}</h2><p class="occupancy-count">${['101%','-1%','unknown','10 people','0%','12.5%'][i]}</p></div>`).join('');
  expect(await parser.parse(response(html))).toEqual(FACILITIES.map((f,i)=>({...f,percentage:[null,null,null,null,0,12.5][i]})));
});
it('rejects missing readings, non-HTML, source errors, and oversized pages', async () => {
  await expect(parser.parse(response('<html>maintenance</html>'))).rejects.toThrow('source_no_readings');
  await expect(parser.parse(new Response('{}',{headers:{'content-type':'application/json'}}))).rejects.toThrow('source_not_html');
  await expect(parser.parse(new Response('error',{status:503}))).rejects.toThrow('source_http_503');
  await expect(parser.parse(response('x'.repeat(512*1024+1)))).rejects.toThrow('source_too_large');
});
