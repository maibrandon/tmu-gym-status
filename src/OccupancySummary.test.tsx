import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { OccupancySummary } from './OccupancySummary';
it('distinguishes a supported zero from unavailable and loading readings',()=>{
 const render=(percentage:number|null,loading=false)=>renderToStaticMarkup(<OccupancySummary name="MAC" percentage={percentage} loading={loading}/>);
 expect(render(0)).toContain('aria-valuenow="0"');
 expect(render(null)).not.toContain('role="meter"');
 expect(render(null)).toContain('Unavailable');
 expect(render(null,true)).toContain('Checking');
});
it('keeps the bar and status aligned at both color boundaries',()=>{
 for(const [percentage,level] of [[34,'low'],[35,'moderate'],[64,'moderate'],[65,'high']] as const){
  const html=renderToStaticMarkup(<OccupancySummary name="MAC" percentage={percentage}/>);
  expect(html.match(new RegExp(`data-level="${level}"`,'g'))).toHaveLength(2);
  expect(html).toContain(`aria-valuenow="${percentage}"`);
 }
});

it('shows women’s hours alongside occupancy without replacing its status', () => {
 const html=renderToStaticMarkup(<OccupancySummary name="RAC" percentage={20} womensHours/>);
 expect(html).toContain('womens-hours-badge');
 expect(html).toContain('Quiet');
 expect(html).toContain('aria-valuenow="20"');
 expect(renderToStaticMarkup(<OccupancySummary name="MAC" percentage={20}/>)).not.toContain('womens-hours-badge');
});
