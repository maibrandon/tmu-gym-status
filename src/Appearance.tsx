import { useEffect, useState } from 'react';

type Appearance = 'system' | 'light' | 'dark';
const preference = (value: string | null | undefined): Appearance => value === 'light' || value === 'dark' ? value : 'system';

export function Appearance() {
  const [appearance, setAppearance] = useState<Appearance>(() => preference(document.documentElement.dataset.appearance));

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = appearance === 'dark' || (appearance === 'system' && media.matches);
      const root = document.documentElement;
      root.dataset.appearance = appearance;
      root.dataset.theme = dark ? 'dark' : 'light';
      root.style.colorScheme = dark ? 'dark' : 'light';
      root.style.backgroundColor = dark ? '#15181d' : '#f8fafb';
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#15181d' : '#f8fafb');
    };
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [appearance]);

  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key === 'tmu-appearance' || event.key === null) setAppearance(preference(event.newValue));
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);

  return (
    <label className="appearance-control">
      <span>Appearance</span>
      <select value={appearance} onChange={event => {
        const next = preference(event.target.value);
        setAppearance(next);
        try { localStorage.setItem('tmu-appearance', next); } catch { /* This session still works without storage. */ }
      }}>
        <option value="system">System</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    </label>
  );
}
