// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { useHistory } from './useHistory';

it('waits for initial occupancy and uses timestamp values rather than Date object identity',async()=>{
 vi.useFakeTimers();vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
 const request=vi.fn(async()=>Response.json({facilities:[]}));vi.stubGlobal('fetch',request);
 const container=document.createElement('div');const root=createRoot(container);
 const stamp='2026-09-17T17:00:00Z';
 function Harness({enabled,refresh}:{enabled:boolean;refresh?:Date}){useHistory('now',undefined,undefined,refresh,enabled);return null;}
 try {
  await act(async()=>{root.render(<Harness enabled={false}/>);});
  await act(async()=>{await vi.advanceTimersByTimeAsync(250);});
  expect(request).not.toHaveBeenCalled();
  await act(async()=>{root.render(<Harness enabled refresh={new Date(stamp)}/>);});
  await act(async()=>{await vi.advanceTimersByTimeAsync(250);});
  expect(request).toHaveBeenCalledTimes(1);
  await act(async()=>{root.render(<Harness enabled refresh={new Date(stamp)}/>);});
  await act(async()=>{await vi.advanceTimersByTimeAsync(250);});
  expect(request).toHaveBeenCalledTimes(1);
  await act(async()=>{root.render(<Harness enabled refresh={new Date('2026-09-17T17:05:00Z')}/>);});
  await act(async()=>{await vi.advanceTimersByTimeAsync(250);});
  expect(request).toHaveBeenCalledTimes(2);
 } finally {await act(async()=>root.unmount());vi.useRealTimers();vi.unstubAllGlobals();}
});
