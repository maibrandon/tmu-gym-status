import { expect, it } from 'vitest';
import { selectHistory, type HistoricalBucket } from './history';
const row=(minute:number,percentage:number):HistoricalBucket=>({facilityId:'mac-fitness',minute,percentage,dates:1,observations:6,firstDate:'2026-09-10',lastDate:'2026-09-10',updatedAt:'2026-09-10T23:00:00Z'});
const future=(rows:HistoricalBucket[],minute=1080)=>selectHistory('mac-fitness',rows,'2026-09-17',minute,new Date('2026-09-11T02:00:00Z'),'later');
it('allows exactly three hours but rejects times beyond that even with lower occupancy',()=>{
 expect(future([row(1080,80),row(1260,20),row(1290,0)]).alternatives.map(b=>b.minute)).toEqual([1260]);
});
it('does not fall back to distant times when the selected time has no baseline',()=>{
 const result=future([row(1080,50),row(1200,30)],600);
 expect(result.baseline).toBeNull();
 expect(result.alternatives).toEqual([]);
});
it('never rolls past times into next week',()=>{
 const result=selectHistory('mac-fitness',[row(1080,35)],'2026-09-10',1320,new Date('2026-09-11T02:00:00Z'),'now');
 expect(result.alternatives).toEqual([]);
});
it('requires five percentage points improvement when a baseline exists',()=>{
 expect(future([row(1080,30),row(1110,26),row(1140,25)]).alternatives.map(b=>b.minute)).toEqual([1140]);
});
it('ranks the greatest reduction first and breaks ties by shortest time shift',()=>{
 expect(future([row(1080,80),row(1110,40),row(1200,20),row(1260,20)]).alternatives.map(b=>b.minute)).toEqual([1200,1260,1110]);
});
it('offers only later times for now and respects the exact selected minute',()=>{
 const result=selectHistory('mac-fitness',[row(1080,0),row(1110,80),row(1260,20),row(1320,0)],'2026-09-10',1118,new Date('2026-09-10T22:38:00Z'),'now');
 expect(result.alternatives.map(b=>b.minute)).toEqual([1260]);
});
it('allows nearby earlier times when planning a future date',()=>{
 expect(future([row(1080,80),row(1020,20)]).alternatives[0]).toMatchObject({minute:1020,date:'2026-09-17'});
});

it('keeps live candidates even when they are above the historical current baseline',()=>{
 const result=selectHistory('mac-fitness',[row(780,20),row(900,41)],'2026-09-17',780,new Date('2026-09-17T17:00:00Z'),'now');
 expect(result.alternatives.map(b=>b.percentage)).toEqual([41]);
});
