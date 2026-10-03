// European Central Bank Data Portal, SDMX REST API (CSV output).
// Docs: https://data.ecb.europa.eu/help/api/overview

import { fetchText } from '../http.ts';
import type { Freq, Point, Series } from '../../shared/types.ts';
import { normalisePeriod } from '../periods.ts';

const API = 'https://data-api.ecb.europa.eu/service/data/';

/** Parse RFC 4180-style CSV (quoted fields may contain commas, quotes and newlines). */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  const [header, ...body] = rows.filter((r) => r.length > 1 || r[0] !== '');
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
}

/**
 * Fetch one ECB series, e.g. ecbSeries('FM', 'M.U2.EUR.RT.MM.EURIBOR3MD_.HSTA', …).
 * `scale` multiplies values (e.g. 1e-3 to turn € millions into € billions).
 */
export async function ecbSeries(
  flow: string,
  key: string,
  meta: { id: string; label: string; unit: string; freq: Freq; start: string; scale?: number },
): Promise<Series> {
  const url = `${API}${flow}/${key}?format=csvdata&detail=dataonly&startPeriod=${meta.start}`;
  const recs = parseCsv(await fetchText(url));
  if (recs.length === 0) throw new Error(`ECB ${flow}.${key}: empty response`);
  const data: Point[] = recs
    .map((r): Point => {
      const v = r.OBS_VALUE === '' ? null : Number(r.OBS_VALUE);
      return [normalisePeriod(r.TIME_PERIOD), v === null || Number.isNaN(v) ? null : v * (meta.scale ?? 1)];
    })
    .sort((a, b) => (a[0] < b[0] ? -1 : 1));
  return {
    id: meta.id,
    label: meta.label,
    unit: meta.unit,
    freq: meta.freq,
    source: {
      name: 'Euroopan keskuspankki',
      table: `${flow}.${key}`,
      url: `https://data.ecb.europa.eu/data/datasets/${flow}/${flow}.${key}`,
    },
    data,
  };
}
