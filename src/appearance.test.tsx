// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { App } from './App';

const boot = readFileSync('index.html', 'utf8').match(/<script>([\s\S]*?)<\/script>/)![1];
let dark = true;
let listeners: Set<() => void>;
let root: Root | undefined;
const theme = () => document.documentElement.dataset.theme;
async function changeSystem(value: boolean) {
  dark = value;
  await act(async () => { listeners.forEach(listener => listener()); });
}
async function choose(value: string) {
  await act(async () => {
    const select = document.querySelector('select')!;
    select.value = value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
}
async function mount() {
  window.eval(boot);
  root = createRoot(document.getElementById('root')!);
  await act(async () => { root!.render(<App />); });
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  localStorage.clear();
  dark = true;
  listeners = new Set();
  document.head.innerHTML = '<meta name="theme-color" content="#f8fafb">';
  document.body.innerHTML = '<div id="root"></div>';
  vi.stubGlobal('matchMedia', () => ({ get matches() { return dark; }, addEventListener: (_: string, listener: () => void) => listeners.add(listener), removeEventListener: (_: string, listener: () => void) => listeners.delete(listener) }));
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({readings: [], checkedAt: null, stale: false, collectionState: 'open', message: null}))));
  vi.spyOn(console, 'table').mockImplementation(() => {});
});
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it('sets the saved appearance before React mounts', () => {
  localStorage.setItem('tmu-appearance', 'light');
  window.eval(boot);
  expect(theme()).toBe('light');
  expect(document.documentElement.style.colorScheme).toBe('light');
  expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe('#f8fafb');
});
it('tracks system changes, preserves explicit choices, and never refetches for appearance', async () => {
  await mount();
  expect(theme()).toBe('dark');
  await changeSystem(false);
  expect(theme()).toBe('light');
  await choose('dark');
  await changeSystem(true);
  await changeSystem(false);
  expect(theme()).toBe('dark');
  expect(localStorage.getItem('tmu-appearance')).toBe('dark');
  window.eval(boot);
  expect(theme()).toBe('dark');
  await choose('system');
  expect(theme()).toBe('light');
  await changeSystem(true);
  expect(theme()).toBe('dark');
  expect(fetch).toHaveBeenCalledTimes(1);
});
it('works when storage is blocked', async () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
  await mount();
  expect(theme()).toBe('dark');
  await choose('light');
  expect(theme()).toBe('light');
});
it('ignores invalid saved values and syncs another tab’s preference', async () => {
  localStorage.setItem('tmu-appearance', 'invalid');
  await mount();
  expect(document.querySelector('select')?.value).toBe('system');
  await act(async () => { window.dispatchEvent(new StorageEvent('storage', {key: 'tmu-appearance', newValue: 'light'})); });
  expect(theme()).toBe('light');
});
