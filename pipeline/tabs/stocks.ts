// "Osakemarkkinat" – Helsinki stock exchange: indices, foreign comparison, sectors, companies
// (Nasdaq) and who owns Finnish listed shares (Statistics Finland financial accounts).

import type { CategoryTable, Point, Series, SourceRef } from '../../shared/types.ts';
import type { TabBuilder } from '../builder.ts';
import {
  HELSINKI_SHARES_UI,
  NORDIC_INDEX_UI,
  US_INDEX_UI,
  helsinkiShares,
  maxHistoryStart,
  nordicCloses,
  shareSummary,
  usIndexCloses,
  type ListedShare,
  type ShareSummary,
} from '../sources/nasdaq.ts';
import { pxQuery, pxSeries } from '../sources/statfin.ts';
import { round, since, trimNulls } from '../periods.ts';

interface IndexDef {
  id: string;
  label: string;
  symbol: string;
  /** Nordic orderbook id; absent for US indices. */
  ob?: string;
}

const HELSINKI: IndexDef[] = [
  { id: 'omxh25', ob: 'IX2165', symbol: 'OMXH25', label: 'OMX Helsinki 25' },
  { id: 'omxhpi', ob: 'IX2158', symbol: 'OMXHPI', label: 'OMX Helsinki (kaikki osakkeet)' },
  { id: 'omxhgi', ob: 'IX2160', symbol: 'OMXHGI', label: 'OMX Helsinki, osingot sijoitettuna' },
];

const MARKETS: IndexDef[] = [
  { id: 'omxs30', ob: 'IX447', symbol: 'OMXS30', label: 'OMX Stockholm 30' },
  { id: 'omxc25', ob: 'IX14474', symbol: 'OMXC25', label: 'OMX Copenhagen 25' },
  { id: 'omxn40', ob: 'IX3434', symbol: 'OMXN40', label: 'OMX Nordic 40' },
  { id: 'ndx', symbol: 'NDX', label: 'Nasdaq-100 (USA)' },
];

/** ICB industries: Nasdaq's English sector name → Finnish label and Helsinki sector index. */
export const SECTORS: Record<string, { label: string; ob: string }> = {
  Technology: { label: 'Teknologia', ob: 'IX3497552' },
  Telecommunications: { label: 'Tietoliikenne', ob: 'IX3497444' },
  'Health Care': { label: 'Terveydenhuolto', ob: 'IX3497468' },
  Financials: { label: 'Rahoitus', ob: 'IX3497528' },
  'Real Estate': { label: 'Kiinteistöt', ob: 'IX3497520' },
  'Consumer Discretionary': { label: 'Kulutustavarat', ob: 'IX3494736' },
  'Consumer Staples': { label: 'Päivittäistavarat', ob: 'IX3494744' },
  Industrials: { label: 'Teollisuus', ob: 'IX3497388' },
  'Basic Materials': { label: 'Perusteollisuus', ob: 'IX3497384' },
  Energy: { label: 'Energia', ob: 'IX3497380' },
  Utilities: { label: 'Yleishyödylliset', ob: 'IX3497440' },
};

/** Holders of Finnish listed shares (financial accounts sectors). */
const HOLDERS: { code: string; id: string; label: string }[] = [
  { code: 'S2', id: 'foreign', label: 'Ulkomaat' },
  { code: 'S14_S15', id: 'households', label: 'Kotitaloudet' },
  { code: 'S13', id: 'government', label: 'Julkisyhteisöt (ml. työeläkelaitokset)' },
  { code: 'S12', id: 'financial', label: 'Rahoitus- ja vakuutuslaitokset' },
  { code: 'S11', id: 'companies', label: 'Yritykset' },
];

const RETURN_COLUMNS = {
  d1: 'Päivä, %',
  w1: 'Viikko, %',
  m1: 'Kuukausi, %',
  ytd: 'Vuoden alusta, %',
  y1: '1 vuosi, %',
  y5: '5 vuotta, %',
};

export async function buildStocks(b: TabBuilder) {
  const from = maxHistoryStart();

  await b.group('helsinki', async () => {
    const out = [];
    for (const d of HELSINKI) out.push({ def: d, closes: await nordicCloses(d.ob!, 'INDEXES', from) });
    return indexOutputs('helsinki', out);
  });

  await b.group('markets', async () => {
    const out = [];
    for (const d of MARKETS) {
      const closes = d.ob ? await nordicCloses(d.ob, 'INDEXES', from) : await usIndexCloses(d.symbol, from);
      out.push({ def: d, closes });
    }
    return indexOutputs('markets', out);
  });

  await b.group('sectors', async () => {
    const start = `${new Date().getUTCFullYear() - 1}-01-01`;
    const rows: CategoryTable['rows'] = [];
    let asOf = '';
    for (const [key, s] of Object.entries(SECTORS)) {
      const closes = await nordicCloses(s.ob, 'INDEXES', start);
      asOf = closes[closes.length - 1][0] > asOf ? closes[closes.length - 1][0] : asOf;
      const r = returns(closes);
      rows.push({ key, label: s.label, values: { m1: r.m1, ytd: r.ytd, y1: r.y1 } });
    }
    const table: CategoryTable = {
      id: 'sectors.returns',
      label: 'Toimialaindeksien tuotot',
      unit: '%',
      period: asOf,
      source: nasdaqSource('Helsingin toimialaindeksit (PI)', HELSINKI_SHARES_UI, asOf),
      columns: { m1: RETURN_COLUMNS.m1, ytd: RETURN_COLUMNS.ytd, y1: RETURN_COLUMNS.y1 },
      rows,
    };
    return { tables: [table] };
  });

  await b.group('companies', async () => {
    const shares = await helsinkiShares();
    if (shares.length < 100) throw new Error(`Only ${shares.length} Helsinki shares listed`);
    const summaries = new Map<string, ShareSummary>();
    let failed = 0;
    // Each request takes ~2 s, so fetch a few at a time (requests are still paced per host).
    await mapLimit(shares, 4, async (s) => {
      try {
        summaries.set(s.orderbookId, await shareSummary(s.orderbookId));
      } catch (e) {
        failed++;
        console.warn(`    summary ${s.symbol}: ${e instanceof Error ? e.message : e}`);
      }
    });
    if (failed > shares.length * 0.2) throw new Error(`${failed}/${shares.length} share summaries failed`);

    // A company may have several share series (e.g. Kesko A and B): add up market values and
    // report the returns of its most traded series.
    const companies = new Map<string, { name: string; series: ListedShare[] }>();
    for (const s of shares) {
      const name = companyName(s.fullName);
      const c = companies.get(name) ?? { name, series: [] };
      c.series.push(s);
      companies.set(name, c);
    }
    const rows: CategoryTable['rows'] = [];
    for (const c of companies.values()) {
      const main = [...c.series].sort((a, z) => (z.turnover ?? 0) - (a.turnover ?? 0))[0];
      const sum = summaries.get(main.orderbookId);
      const mcap = c.series.reduce((acc, s) => acc + (summaries.get(s.orderbookId)?.marketCap ?? 0), 0);
      if (!sum || mcap === 0) continue;
      rows.push({
        key: main.symbol,
        label: c.name,
        group: SECTORS[main.sector]?.label ?? 'Muut',
        values: {
          mcap: Math.round(mcap / 1e5) / 10, // € millions, one decimal
          price: main.price,
          d1: main.changePct,
          w1: sum.week,
          m1: sum.month,
          ytd: sum.ytd,
          y1: sum.year,
        },
      });
    }
    rows.sort((a, z) => (z.values.mcap ?? 0) - (a.values.mcap ?? 0));
    // Date the snapshot by the last trading day (from the OMXH25 index), not the fetch date.
    const recent = new Date(Date.now() - 14 * 86_400_000).toISOString().slice(0, 10);
    const asOf = lastDate(await nordicCloses(HELSINKI[0].ob!, 'INDEXES', recent));
    const table: CategoryTable = {
      id: 'companies.all',
      label: 'Helsingin pörssin yhtiöt',
      unit: 'milj. €',
      period: asOf,
      source: nasdaqSource('Nasdaq Helsinki, päälista', HELSINKI_SHARES_UI, asOf),
      columns: {
        mcap: 'Markkina-arvo, milj. €',
        price: 'Kurssi, €',
        d1: RETURN_COLUMNS.d1,
        w1: RETURN_COLUMNS.w1,
        m1: RETURN_COLUMNS.m1,
        ytd: RETURN_COLUMNS.ytd,
        y1: RETURN_COLUMNS.y1,
      },
      rows,
    };
    return { tables: [table] };
  });

  await b.group('ownership', async () => {
    const res = await pxQuery('rtp/11n9', {
      varojenluokitus_5_20180101: ['F511'],
      'sektoriluokitus_7_20230101-rtp-sektori': ['S0', ...HOLDERS.map((h) => h.code)],
      'sektoriluokitus_7_20230101-vastinsektori': ['S1'],
      timeperiod_q: 'all',
      contentscode: ['rtp-K'],
    });
    const holder = (code: string) =>
      pxSeries(
        res,
        { 'sektoriluokitus_7_20230101-rtp-sektori': code },
        { id: 'x', label: '', unit: 'milj. €', freq: 'Q' },
      );
    const total = holder('S0');
    const totals = new Map(total.data);
    const series: Series[] = HOLDERS.map((h) => {
      const s = holder(h.code);
      const share = s.data.map(([p, v]): Point => {
        const t = totals.get(p);
        return [p, v === null || !t ? null : (v / t) * 100];
      });
      return {
        ...s,
        id: `ownership.${h.id}`,
        label: h.label,
        unit: '%',
        data: round(trimNulls(since(share, '2000-Q1')), 2),
      };
    });
    const value: Series = {
      ...total,
      id: 'ownership.total_value',
      label: 'Suomalaisten pörssiosakkeiden markkina-arvo',
      data: trimNulls(since(total.data, '2000-Q1')),
    };
    return { series: [...series, value] };
  });
}

/** Series (daily for the last two years, weekly before that) plus a returns table. */
function indexOutputs(group: string, items: { def: IndexDef; closes: Point[] }[]) {
  const series: Series[] = items.map(({ def, closes }) => ({
    id: `${group}.${def.id}`,
    label: def.label,
    unit: 'pistettä',
    freq: 'D',
    source: nasdaqSource(def.symbol, def.ob ? NORDIC_INDEX_UI(def.symbol) : US_INDEX_UI(def.symbol), lastDate(closes)),
    data: thin(closes, 2),
  }));
  const asOf =
    items
      .map((i) => lastDate(i.closes))
      .sort()
      .pop() ?? '';
  const table: CategoryTable = {
    id: `${group}.returns`,
    label: 'Indeksien tuotot',
    unit: '%',
    period: asOf,
    source: series[0].source,
    columns: RETURN_COLUMNS,
    rows: items.map(({ def, closes }) => ({ key: def.id, label: def.label, values: returns(closes) })),
  };
  return { series, tables: [table] };
}

function nasdaqSource(table: string, url: string, asOf: string): SourceRef {
  return { name: 'Nasdaq', table, url, updated: asOf ? `${asOf}T16:30:00Z` : undefined };
}

const lastDate = (closes: Point[]) => closes[closes.length - 1]?.[0] ?? '';

/** "Kesko Oyj B" → "Kesko", "Nordea Bank Abp" → "Nordea Bank". */
export function companyName(fullName: string): string {
  let name = fullName.trim().replace(/\s+(A|B|K|R|I|II)$/, '');
  // Strip legal forms, possibly several ("Wärtsilä Oyj Abp").
  for (;;) {
    const next = name.replace(/\s+(Oyj|Abp|Oy|Ab|AB \(publ\)|AB|ASA|plc|Plc|AG|SE|S\.A\.|N\.V\.)$/, '');
    if (next === name) return name;
    name = next;
  }
}

/** Run `fn` over `items` with at most `limit` calls in flight. */
async function mapLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length) await fn(items[next++]);
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

/** Keep every close for the last `years`, and only each week's last close before that. */
function thin(closes: Point[], years: number): Point[] {
  const cut = new Date();
  cut.setUTCFullYear(cut.getUTCFullYear() - years);
  const cutoff = cut.toISOString().slice(0, 10);
  const out: Point[] = [];
  for (let i = 0; i < closes.length; i++) {
    const [d] = closes[i];
    if (d >= cutoff) out.push(closes[i]);
    else {
      const next = closes[i + 1]?.[0];
      if (!next || weekKey(next) !== weekKey(d) || next >= cutoff) out.push(closes[i]);
    }
  }
  return out;
}

/** Monday of the ISO week of a YYYY-MM-DD date. */
function weekKey(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

/** Last close on or before `date`. */
function closeAt(closes: Point[], date: string): number | null {
  for (let i = closes.length - 1; i >= 0; i--) if (closes[i][0] <= date && closes[i][1] !== null) return closes[i][1];
  return null;
}

function shiftDate(date: string, years: number, months = 0, days = 0): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() + years, d.getUTCMonth() + months, d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Percentage returns over standard horizons, measured from the latest close. */
export function returns(closes: Point[]): Record<keyof typeof RETURN_COLUMNS, number | null> {
  const [last, value] = closes[closes.length - 1];
  const pct = (base: number | null) =>
    value === null || base === null || base === 0 ? null : Math.round((value / base - 1) * 1000) / 10;
  const prevClose = closes.length > 1 ? closes[closes.length - 2][1] : null;
  return {
    d1: pct(prevClose),
    w1: pct(closeAt(closes, shiftDate(last, 0, 0, -7))),
    m1: pct(closeAt(closes, shiftDate(last, 0, -1))),
    ytd: pct(closeAt(closes, `${Number(last.slice(0, 4)) - 1}-12-31`)),
    y1: pct(closeAt(closes, shiftDate(last, -1))),
    y5: closes[0][0] <= shiftDate(last, -5) ? pct(closeAt(closes, shiftDate(last, -5))) : null,
  };
}
