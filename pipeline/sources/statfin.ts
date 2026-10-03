// Statistics Finland (Tilastokeskus) StatFin database, PxWeb API v1, JSON-stat2 responses.
// Docs: https://stat.fi/org/avoindata/pxweb.html

import { fetchJson } from '../http.ts';
import type { Freq, Point, Series } from '../../shared/types.ts';
import { normalisePeriod } from '../periods.ts';

const API = 'https://pxdata.stat.fi/PxWeb/api/v1/fi/StatFin/';
const UI = 'https://pxdata.stat.fi/PxWeb/pxweb/fi/StatFin/';

/** Values to select for one variable: explicit codes, every value, or the newest N (time). */
export type Selection = string[] | 'all' | { top: number };

interface JsonStat2 {
  id: string[];
  size: number[];
  value: (number | null)[];
  updated?: string;
  role?: { time?: string[] };
  dimension: Record<
    string,
    { label: string; category: { index: Record<string, number> | string[]; label?: Record<string, string> } }
  >;
}

export interface PxRow {
  key: Record<string, string>;
  value: number | null;
}

export interface PxResult {
  /** "db/table", e.g. "khi/15b5". */
  table: string;
  updated?: string;
  timeDim?: string;
  labels: Record<string, Record<string, string>>;
  rows: PxRow[];
}

/** "khi/15b5" → API and UI urls. */
function tableUrls(table: string) {
  const [db, id] = table.split('/');
  return {
    api: `${API}${db}/${id}.px`,
    ui: `${UI}StatFin__${db}/${id}.px/`,
  };
}

export async function pxQuery(table: string, selections: Record<string, Selection>): Promise<PxResult> {
  const query = Object.entries(selections).map(([code, sel]) => ({
    code,
    selection:
      sel === 'all'
        ? { filter: 'all', values: ['*'] }
        : Array.isArray(sel)
          ? { filter: 'item', values: sel }
          : { filter: 'top', values: [String(sel.top)] },
  }));
  const ds = await fetchJson<JsonStat2>(tableUrls(table).api, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, response: { format: 'json-stat2' } }),
  });
  return parseJsonStat2(table, ds);
}

function parseJsonStat2(table: string, ds: JsonStat2): PxResult {
  const codesByDim = ds.id.map((dim) => {
    const idx = ds.dimension[dim].category.index;
    if (Array.isArray(idx)) return idx;
    const codes: string[] = [];
    for (const [code, i] of Object.entries(idx)) codes[i] = code;
    return codes;
  });
  const labels: PxResult['labels'] = {};
  ds.id.forEach((dim, d) => {
    const lab = ds.dimension[dim].category.label ?? {};
    labels[dim] = Object.fromEntries(codesByDim[d].map((c) => [c, lab[c] ?? c]));
  });

  const rows: PxRow[] = [];
  const n = ds.value.length;
  const coord = new Array(ds.id.length).fill(0);
  for (let flat = 0; flat < n; flat++) {
    const key: Record<string, string> = {};
    ds.id.forEach((dim, d) => (key[dim] = codesByDim[d][coord[d]]));
    const v = ds.value[flat];
    rows.push({ key, value: typeof v === 'number' ? v : null });
    // Row-major increment (last dimension varies fastest).
    for (let d = ds.id.length - 1; d >= 0; d--) {
      if (++coord[d] < ds.size[d]) break;
      coord[d] = 0;
    }
  }

  const timeDim =
    ds.role?.time?.[0] ?? ds.id.find((d) => d.startsWith('timeperiod') || d === 'Vuosi' || d === 'Kuukausi');
  return { table, updated: ds.updated, timeDim, labels, rows };
}

/** Pick one time series out of a query result by fixing every non-time dimension. */
export function pxSeries(
  res: PxResult,
  filter: Record<string, string>,
  meta: { id: string; label: string; unit: string; freq: Freq; scale?: number },
): Series {
  if (!res.timeDim) throw new Error(`${res.table}: no time dimension`);
  const timeDim = res.timeDim;
  const data: Point[] = res.rows
    .filter((r) => Object.entries(filter).every(([k, v]) => r.key[k] === v))
    .map((r): Point => [normalisePeriod(r.key[timeDim]), r.value === null ? null : r.value * (meta.scale ?? 1)])
    .sort((a, b) => (a[0] < b[0] ? -1 : 1));
  if (data.length === 0) throw new Error(`${res.table}: no rows for ${JSON.stringify(filter)}`);
  return {
    id: meta.id,
    label: meta.label,
    unit: meta.unit,
    freq: meta.freq,
    source: {
      name: 'Tilastokeskus',
      table: `StatFin ${res.table}`,
      url: tableUrls(res.table).ui,
      updated: res.updated,
    },
    data,
  };
}

/** Value for one cell (all dimensions fixed). */
export function pxValue(res: PxResult, filter: Record<string, string>): number | null {
  const row = res.rows.find((r) => Object.entries(filter).every(([k, v]) => r.key[k] === v));
  return row ? row.value : null;
}

export function pxSource(res: PxResult) {
  return { name: 'Tilastokeskus', table: `StatFin ${res.table}`, url: tableUrls(res.table).ui, updated: res.updated };
}
