import { useEffect, useState } from 'react';

// Colour tokens. Categorical slots follow a fixed, colour-blind-validated order: a series
// keeps its slot regardless of how many series a chart shows. Dark values are separate,
// validated steps of the same hues, not an automatic inversion.

export interface Tokens {
  page: string;
  surface: string;
  surfaceRaised: string;
  ink: string;
  ink2: string;
  muted: string;
  grid: string;
  axis: string;
  border: string;
  accent: string;
  good: string;
  bad: string;
  warning: string;
  series: string[];
  other: string;
  /** Sequential ramp, low → high. */
  sequential: string[];
}

const LIGHT: Tokens = {
  page: '#f4f4f1',
  surface: '#fcfcfb',
  surfaceRaised: '#ffffff',
  ink: '#0b0b0b',
  ink2: '#52514e',
  muted: '#898781',
  grid: '#e1e0d9',
  axis: '#c3c2b7',
  border: 'rgba(11, 11, 11, 0.10)',
  accent: '#2a78d6',
  good: '#006300',
  bad: '#d03b3b',
  warning: '#fab219',
  series: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'],
  other: '#b5b3ac',
  sequential: ['#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95', '#0d366b'],
};

const DARK: Tokens = {
  page: '#0d0d0d',
  surface: '#1a1a19',
  surfaceRaised: '#222220',
  ink: '#ffffff',
  ink2: '#c3c2b7',
  muted: '#898781',
  grid: '#2c2c2a',
  axis: '#383835',
  border: 'rgba(255, 255, 255, 0.10)',
  accent: '#3987e5',
  good: '#0ca30c',
  bad: '#e66767',
  warning: '#fab219',
  series: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'],
  other: '#5c5b57',
  sequential: ['#184f95', '#1c5cab', '#2a78d6', '#5598e7', '#86b6ef', '#b7d3f6', '#e3eefc'],
};

export type ThemeMode = 'auto' | 'light' | 'dark';
const KEY = 'finndash.theme';

function readMode(): ThemeMode {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'light' || v === 'dark' || v === 'auto') return v;
  } catch {
    // Storage unavailable: fall back to the OS setting.
  }
  return 'auto';
}

const media = () => window.matchMedia('(prefers-color-scheme: dark)');

function apply(tokens: Tokens, dark: boolean) {
  const root = document.documentElement;
  root.dataset.theme = dark ? 'dark' : 'light';
  root.style.colorScheme = dark ? 'dark' : 'light';
  const vars: Record<string, string> = {
    '--page': tokens.page,
    '--surface': tokens.surface,
    '--surface-raised': tokens.surfaceRaised,
    '--ink': tokens.ink,
    '--ink-2': tokens.ink2,
    '--muted': tokens.muted,
    '--grid': tokens.grid,
    '--axis': tokens.axis,
    '--border': tokens.border,
    '--accent': tokens.accent,
    '--good': tokens.good,
    '--bad': tokens.bad,
    '--warning': tokens.warning,
  };
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
}

export function useTheme() {
  const [mode, setModeState] = useState<ThemeMode>(readMode);
  const [osDark, setOsDark] = useState(() => media().matches);

  useEffect(() => {
    const m = media();
    const onChange = () => setOsDark(m.matches);
    m.addEventListener('change', onChange);
    return () => m.removeEventListener('change', onChange);
  }, []);

  const dark = mode === 'dark' || (mode === 'auto' && osDark);
  const tokens = dark ? DARK : LIGHT;

  useEffect(() => apply(tokens, dark), [tokens, dark]);

  const setMode = (m: ThemeMode) => {
    setModeState(m);
    try {
      localStorage.setItem(KEY, m);
    } catch {
      // Not persisted; fine.
    }
  };

  return { mode, setMode, dark, tokens };
}
