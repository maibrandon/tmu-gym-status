// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { RevealRow } from './RevealRow';

it('reveals on mouse hover, supports touch click and Escape, and hides collapsed content from accessibility',async()=>{
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
 const container=document.createElement('div');document.body.append(container);
 const root=createRoot(container);
 try {
  await act(async()=>{root.render(<ul><RevealRow label="MAC alternative times" summary="MAC Fitness Centre"><p>8:00 PM — 30%</p></RevealRow></ul>);});
  const button=container.querySelector('button')!;
  const row=container.querySelector('li')!;
  const details=container.querySelector('.facility-reveal')!;
  expect(button.getAttribute('aria-expanded')).toBe('false');
  expect(details.getAttribute('aria-hidden')).toBe('true');
  const pointer=(type:string,pointerType:string)=>{const e=new Event(type,{bubbles:true});Object.defineProperty(e,'pointerType',{value:pointerType});row.dispatchEvent(e);};
  await act(async()=>pointer('pointerover','touch'));
  expect(button.getAttribute('aria-expanded')).toBe('false');
  await act(async()=>pointer('pointerover','mouse'));
  expect(button.getAttribute('aria-expanded')).toBe('true');
  await act(async()=>pointer('pointerout','mouse'));
  expect(button.getAttribute('aria-expanded')).toBe('false');
  await act(async()=>button.click());
  expect(button.getAttribute('aria-expanded')).toBe('true');
  await act(async()=>button.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
  expect(button.getAttribute('aria-expanded')).toBe('false');
 } finally {await act(async()=>root.unmount());container.remove();vi.unstubAllGlobals();}
});
