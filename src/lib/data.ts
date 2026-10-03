import { useEffect, useState } from 'react';
import type { Point, Series, TabData } from '../../shared/types.ts';

const REFRESH_MS = 30 * 60 * 1000;

export type TabId = 'overview' | 'housing' | 'trade' | 'stocks';

/** Loads public/data/<tab>.json and re-checks it every 30 minutes (the page is left open). */
export function useTabData(tab: TabId) {
  const [data, setData] = useState<TabData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        // Cache-bust per 10 minutes so a fresh deploy shows up without a hard reload.
        const res = await fetch(`data/${tab}.json?v=${Math.floor(Date.now() / 600_000)}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as TabData;
        if (alive) {
          setData(json);
          setError(null);
        }
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      }
    };
    void load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [tab]);

  return { data, error };
}

/** Last non-null point. */
export function latest(s: Series | undefined): Point | undefined {
  if (!s) return undefined;
  for (let i = s.data.length - 1; i >= 0; i--) if (s.data[i][1] !== null) return s.data[i];
  return undefined;
}

/** Last non-null point on or before a period key (dates compare lexically). */
export function pointAtOrBefore(s: Series | undefined, period: string): Point | undefined {
  if (!s) return undefined;
  for (let i = s.data.length - 1; i >= 0; i--) if (s.data[i][0] <= period && s.data[i][1] !== null) return s.data[i];
  return undefined;
}

/** Same date one year earlier, "2026-10-02" → "2025-10-02". */
export function yearEarlier(date: string): string {
  return `${Number(date.slice(0, 4)) - 1}${date.slice(4)}`;
}

/**
 * Series rebased to 100 at its first point on or after `startTime` (ms), dropping earlier
 * points – for comparing the performance of series with different levels.
 */
export function rebased(s: Series | undefined, startTime: number, toTime: (p: string) => number): Series | undefined {
  if (!s) return undefined;
  const pts = s.data.filter(([p, v]) => v !== null && toTime(p) >= startTime);
  if (!pts.length) return undefined;
  const base = pts[0][1] as number;
  return { ...s, unit: 'indeksi', data: pts.map(([p, v]) => [p, ((v as number) / base) * 100] as Point) };
}

/** Value `lag` observations before the latest non-null one. */
export function previous(s: Series | undefined, lag = 1): Point | undefined {
  if (!s) return undefined;
  const pts = s.data.filter(([, v]) => v !== null);
  return pts[pts.length - 1 - lag];
}

/** Observations per year for a frequency. */
export const perYear = (s: Series) => ({ M: 12, Q: 4, A: 1, D: 365 })[s.freq];

export function lastN(s: Series | undefined, n: number): number[] {
  if (!s) return [];
  return s.data
    .filter(([, v]) => v !== null)
    .slice(-n)
    .map(([, v]) => v as number);
}

/** Same series in another unit, e.g. € millions → € billions. */
export function scaled(s: Series | undefined, factor: number, unit: string): Series | undefined {
  if (!s) return undefined;
  return { ...s, unit, data: s.data.map(([p, v]) => [p, v === null ? null : v * factor] as Point) };
}
