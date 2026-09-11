import { expect, it } from 'vitest';
import { selectHistory, type HistoricalBucket } from './history';
const row=(minute:number,percentage:number):HistoricalBucket=>({facilityId:'mac-fitness',minute,percentage,dates:1,observations:6,firstDate:'2026-09-10',lastDate:'2026-09-10',updatedAt:'2026-09-10T23:00:00Z'});
it('offers measured times without a baseline, including options outside two hours',()=>{
 const result=selectHistory('mac-fitness',[row(1080,50),row(1200,30)],'2026-09-17',600,new Date('2026-09-11T02:00:00Z'),'later');
 expect(result.baseline).toBeNull();
 expect(result.alternatives.map(b=>b.minute)).toEqual([1200,1080]);
});
it('labels next-week options when the only measured times have already passed',()=>{
 const result=selectHistory('mac-fitness',[row(1080,35)],'2026-09-10',1320,new Date('2026-09-11T02:00:00Z'),'now');
 expect(result.alternatives[0]).toMatchObject({date:'2026-09-17',minute:1080,percentage:35});
});
it('still requires an improvement when a supported baseline exists',()=>{
 const result=selectHistory('mac-fitness',[row(1080,30),row(1110,25),row(1140,15)],'2026-09-17',1080,new Date('2026-09-11T02:00:00Z'),'later');
 expect(result.alternatives.map(b=>b.minute)).toEqual([1140]);
});
