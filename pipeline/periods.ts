import type { Freq, Point } from '../shared/types.ts';

/**
 * Normalise publisher period codes to sortable keys:
 * "2026M08" | "202608" | "2026-08" → "2026-08", "2026Q2" | "2026-Q2" → "2026-Q2",
 * "2026" → "2026", "2026-10-03" → "2026-10-03".
 */
export function normalisePeriod(raw: string): string {
  const s = raw.trim().replace(/\*$/, '');
  let m: RegExpMatchArray | null;
  if ((m = s.match(/^(\d{4})M(\d{2})$/))) return `${m[1]}-${m[2]}`;
  if ((m = s.match(/^(\d{4})(\d{2})$/))) return `${m[1]}-${m[2]}`;
  if ((m = s.match(/^(\d{4})-?Q([1-4])$/))) return `${m[1]}-Q${m[2]}`;
  if (/^\d{4}(-\d{2}){0,2}$/.test(s)) return s;
  throw new Error(`Unrecognised period "${raw}"`);
}

/** Previous period key of the same frequency, `lag` steps back. */
export function shiftPeriod(p: string, freq: Freq, lag: number): string {
  if (freq === 'M') {
    const [y, m] = p.split('-').map(Number);
    const t = y * 12 + (m - 1) - lag;
    return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
  }
  if (freq === 'Q') {
    const [y, q] = p.split('-Q').map(Number);
    const t = y * 4 + (q - 1) - lag;
    return `${Math.floor(t / 4)}-Q${(t % 4) + 1}`;
  }
  if (freq === 'A') return String(Number(p) - lag);
  throw new Error('shiftPeriod: daily not supported');
}

/** Rolling sum over `window` consecutive periods; null unless the full window is present. */
export function rollingSum(data: Point[], freq: Freq, window: number): Point[] {
  const byKey = new Map(data);
  return data.map(([p]) => {
    let sum = 0;
    for (let i = 0; i < window; i++) {
      const v = byKey.get(shiftPeriod(p, freq, i));
      if (v === undefined || v === null) return [p, null];
      sum += v;
    }
    return [p, sum];
  });
}

/** Percent change versus `lag` periods earlier. */
export function pctChange(data: Point[], freq: Freq, lag: number): Point[] {
  const byKey = new Map(data);
  return data.map(([p, v]) => {
    const prev = byKey.get(shiftPeriod(p, freq, lag));
    if (v === null || prev === undefined || prev === null || prev === 0) return [p, null];
    return [p, (v / prev - 1) * 100];
  });
}

export function since(data: Point[], start: string): Point[] {
  return data.filter(([p]) => p >= start);
}

export function round(data: Point[], decimals: number): Point[] {
  const f = 10 ** decimals;
  return data.map(([p, v]) => [p, v === null ? null : Math.round(v * f) / f]);
}

/** Drop trailing/leading nulls (publishers often return empty future cells). */
export function trimNulls(data: Point[]): Point[] {
  let a = 0;
  let b = data.length;
  while (a < b && data[a][1] === null) a++;
  while (b > a && data[b - 1][1] === null) b--;
  return data.slice(a, b);
}
