import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { ComputerDesktopIcon, MoonIcon, SunIcon } from '@heroicons/react/24/outline';

export type ThemePref = 'system' | 'light' | 'dark';
const KEY = 'aravalli:theme';

const readPref = (): ThemePref => {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' || v === 'system' ? v : 'light'; // light is the default
  } catch {
    return 'light';
  }
};

const prefersDark = () => window.matchMedia('(prefers-color-scheme: dark)').matches;

function apply(pref: ThemePref) {
  const dark = pref === 'dark' || (pref === 'system' && prefersDark());
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}

interface ThemeCtx { pref: ThemePref; setPref: (p: ThemePref) => void }
const ThemeContext = createContext<ThemeCtx | null>(null);

/** Light by default; a saved choice (Light, Dark or System) overrides it. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [pref, setPrefState] = useState<ThemePref>(readPref);

  useEffect(() => {
    apply(pref);
    if (pref !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => apply('system');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [pref]);

  const setPref = useCallback((p: ThemePref) => {
    // fade the colours for a moment (the CSS for .theme-fade is switched off when the system asks for reduced motion)
    document.documentElement.classList.add('theme-fade');
    setTimeout(() => document.documentElement.classList.remove('theme-fade'), 400);
    setPrefState(p);
    try {
      localStorage.setItem(KEY, p);
    } catch {
      /* private mode: the choice just will not persist */
    }
  }, []);

  const value = useMemo(() => ({ pref, setPref }), [pref, setPref]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const c = useContext(ThemeContext);
  if (!c) throw new Error('useTheme outside ThemeProvider');
  return c;
}

const OPTIONS: { value: ThemePref; label: string; Icon: typeof SunIcon }[] = [
  { value: 'system', label: 'System', Icon: ComputerDesktopIcon },
  { value: 'light', label: 'Light', Icon: SunIcon },
  { value: 'dark', label: 'Dark', Icon: MoonIcon },
];

/** Three-way switch: System, Light, Dark. */
export function ThemeToggle() {
  const { pref, setPref } = useTheme();
  return (
    <div role="radiogroup" aria-label="Colour theme" className="inline-flex rounded-lg border border-line p-0.5">
      {OPTIONS.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={pref === value}
          aria-label={label}
          title={label}
          onClick={() => setPref(value)}
          className={`flex h-7 w-8 items-center justify-center rounded-md transition-colors duration-150 ${
            pref === value ? 'bg-surface-2 text-fg' : 'text-subtle hover:text-fg'
          }`}
        >
          <Icon className="h-4 w-4" aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}
