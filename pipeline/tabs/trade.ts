// "Ulkomaankauppa" – goods trade (Finnish Customs) and services / current account (Statistics Finland).

import type { CategoryTable, Point, Series, SourceRef } from '../../shared/types.ts';
import type { TabBuilder } from '../builder.ts';
import { fetchJson } from '../http.ts';
import { pxQuery, pxSeries } from '../sources/statfin.ts';
import { CUBES, UI_URL, uljasQuery, type UljasRow } from '../sources/uljas.ts';
import { normalisePeriod, rollingSum, round, since, trimNulls } from '../periods.ts';

const customs = (table: string): SourceRef => ({ name: 'Tulli', table, url: UI_URL });

/** Non-overlapping SITC product groups (Customs' own "SITC Tuoteluokitus" aggregates). */
export const PRODUCT_GROUPS: { code: string; id: string; label: string }[] = [
  { code: '24+25+63+64', id: 'forest', label: 'Metsäteollisuuden tuotteet' },
  { code: '67+68+69', id: 'metals', label: 'Metallit ja metallituotteet' },
  { code: '71+72+73+74+75+76+77', id: 'machinery', label: 'Koneet ja laitteet' },
  { code: '78+79', id: 'vehicles', label: 'Kuljetusvälineet' },
  { code: '5', id: 'chemicals', label: 'Kemianteollisuuden tuotteet' },
  { code: '3', id: 'energy', label: 'Energia (öljy, kaasu, sähkö)' },
  { code: '0+1', id: 'food', label: 'Elintarvikkeet ja juomat' },
];

const FLOW = { exports: '2', imports: '1' } as const;

const toMillions = (v: number | null) => (v === null ? null : v / 1e6);

export async function buildTrade(b: TabBuilder) {
  await b.group('goods', async () => {
    const rows = await uljasQuery(CUBES.tradeBalance, [
      ['Aika', '=ALL'],
      ['Maa', 'AA'],
      ['Indikaattorit', ['V5', 'V1', 'V9']],
    ]);
    const mk = (idx: number, id: string, label: string): Series => ({
      id,
      label,
      unit: 'milj. €',
      freq: 'M',
      source: customs('Uljas: Kauppatase (ULJAS_KAUPPATASE)'),
      data: round(
        trimNulls(
          rows
            .map((r): Point => [normalisePeriod(r.keys[0]), toMillions(r.vals[idx])])
            .sort((a, b) => (a[0] < b[0] ? -1 : 1)),
        ),
        1,
      ),
    });
    const exp = mk(0, 'goods.exports', 'Tavaroiden vienti');
    const imp = mk(1, 'goods.imports', 'Tavaroiden tuonti');
    const bal = mk(2, 'goods.balance', 'Kauppatase (vienti – tuonti)');
    const roll = (s: Series, id: string, label: string): Series => ({
      ...s,
      id,
      label,
      data: round(trimNulls(rollingSum(s.data, 'M', 12)), 1),
    });
    return {
      series: [
        exp,
        imp,
        bal,
        roll(exp, 'goods.exports_12m', 'Tavaroiden vienti, 12 kk liukuva summa'),
        roll(imp, 'goods.imports_12m', 'Tavaroiden tuonti, 12 kk liukuva summa'),
        roll(bal, 'goods.balance_12m', 'Kauppatase, 12 kk liukuva summa'),
      ],
    };
  });

  await b.group('partners', async () => {
    // 24 newest months for every country → last 12 months vs the 12 before.
    const rows = await uljasQuery(CUBES.tradeBalance, [
      ['Aika', '=FIRST*;24'],
      ['Maa', '=ALL'],
      ['Indikaattorit', ['V5', 'V1']],
    ]);
    const months = [...new Set(rows.map((r) => normalisePeriod(r.keys[0])))].sort();
    if (months.length < 24) throw new Error(`Expected 24 months, got ${months.length}`);
    const recent = new Set(months.slice(12));
    const sums = new Map<string, { exp: number; imp: number; expPrev: number; impPrev: number }>();
    for (const r of rows) {
      const country = r.keys[1];
      if (country === 'AA') continue;
      const s = sums.get(country) ?? { exp: 0, imp: 0, expPrev: 0, impPrev: 0 };
      const isRecent = recent.has(normalisePeriod(r.keys[0]));
      const [e, i] = [r.vals[0] ?? 0, r.vals[1] ?? 0];
      if (isRecent) {
        s.exp += e;
        s.imp += i;
      } else {
        s.expPrev += e;
        s.impPrev += i;
      }
      sums.set(country, s);
    }
    const names = await countryNames();
    const period = `${months[12]}..${months[23]}`;
    const top = (flow: 'exp' | 'imp', id: string, label: string): CategoryTable => {
      const prevKey = flow === 'exp' ? 'expPrev' : 'impPrev';
      const ranked = [...sums.entries()].sort((a, b) => b[1][flow] - a[1][flow]).slice(0, 15);
      return {
        id,
        label,
        unit: 'milj. €',
        period,
        source: customs('Uljas: Kauppatase (ULJAS_KAUPPATASE)'),
        columns: { value: '12 kk, milj. €', yoy: 'Muutos edellisestä 12 kk:sta, %' },
        rows: ranked.map(([code, s]) => ({
          key: code,
          label: names.get(code) ?? code,
          values: {
            value: Math.round(s[flow] / 1e5) / 10,
            yoy: s[prevKey] > 0 ? Math.round((s[flow] / s[prevKey] - 1) * 1000) / 10 : null,
          },
        })),
      };
    };
    return {
      tables: [
        top('exp', 'partners.exports', 'Suurimmat vientimaat'),
        top('imp', 'partners.imports', 'Suurimmat tuontimaat'),
      ],
    };
  });

  await b.group('products', async () => {
    // The Customs cubes were split on 30.3.2026: history (…2025) and current (2025/2026→).
    const query = (cube: string, classifier: string, codes: string[]) =>
      uljasQuery(cube, [
        [classifier, codes],
        ['Aika', '=ALL'],
        ['Maa', 'AA'],
        ['Suunta', [FLOW.exports, FLOW.imports]],
        ['Indikaattorit', 'V1'],
      ]);
    const codes = PRODUCT_GROUPS.map((g) => g.code);
    const [histGroups, curGroups, histTotal, curTotal] = [
      await query(CUBES.sitcHistory, 'SITC Tuoteluokitus', codes),
      await query(CUBES.sitc, 'SITC Tuoteluokitus', codes),
      await query(CUBES.sitcHistory, 'Tavaraluokitus SITC1', ['0-9']),
      await query(CUBES.sitc, 'Tavaraluokitus SITC1', ['0-9']),
    ];
    const CUTOVER = '2026-01';
    // keys: [product, time, country, flow]
    const spliced = (hist: UljasRow[], cur: UljasRow[], product: string, flow: string): Point[] => {
      const pick = (rows: UljasRow[], keep: (p: string) => boolean) =>
        rows
          .filter((r) => r.keys[0] === product && r.keys[3] === flow)
          .map((r): Point => [normalisePeriod(r.keys[1]), r.vals[0]])
          .filter(([p]) => keep(p));
      return [...pick(hist, (p) => p < CUTOVER), ...pick(cur, (p) => p >= CUTOVER)].sort((a, b) =>
        a[0] < b[0] ? -1 : 1,
      );
    };

    const series: Series[] = [];
    for (const [flowName, flow] of Object.entries(FLOW)) {
      const total = new Map(spliced(histTotal, curTotal, '0-9', flow));
      const other = new Map(total);
      for (const g of PRODUCT_GROUPS) {
        const data = spliced(histGroups, curGroups, g.code, flow);
        for (const [p, v] of data) {
          const o = other.get(p);
          other.set(p, o === undefined || o === null || v === null ? null : o - v);
        }
        series.push(productSeries(`products.${flowName}.${g.id}`, g.label, data));
      }
      series.push(productSeries(`products.${flowName}.other`, 'Muut tavarat', [...other.entries()]));
    }
    return { series };
  });

  await b.group('bop', async () => {
    const res = await pxQuery('mata/12gf', {
      timeperiod_m: 'all',
      taloustoimi_1_20180101: ['CA', 'S'],
      contentscode: ['C12', 'D12', 'B12'],
    });
    const s = (item: string, content: string, id: string, label: string) => {
      const out = pxSeries(
        res,
        { taloustoimi_1_20180101: item, contentscode: content },
        { id, label, unit: 'milj. €', freq: 'M' },
      );
      out.data = trimNulls(out.data);
      return out;
    };
    return {
      series: [
        s('S', 'C12', 'bop.services_exports_12m', 'Palveluiden vienti, 12 kk liukuva summa'),
        s('S', 'D12', 'bop.services_imports_12m', 'Palveluiden tuonti, 12 kk liukuva summa'),
        s('CA', 'B12', 'bop.current_account_12m', 'Vaihtotase, 12 kk liukuva summa'),
      ],
    };
  });
}

function productSeries(id: string, label: string, monthly: Point[]): Series {
  const sorted = [...monthly].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  const rolling = rollingSum(
    sorted.map(([p, v]): Point => [p, v === null ? null : v / 1e6]),
    'M',
    12,
  );
  return {
    id,
    label,
    unit: 'milj. €',
    freq: 'M',
    source: customs('Uljas: SITC (ULJAS_SITC, ULJAS_SITC2)'),
    data: round(trimNulls(since(rolling, '2010-01')), 1),
  };
}

let countryCache: Map<string, string> | undefined;

/** Country code → Finnish name, from the cube's classification metadata. */
async function countryNames(): Promise<Map<string, string>> {
  if (countryCache) return countryCache;
  const url =
    'https://uljas.tulli.fi/uljas/graph/api.aspx?lang=fi&atype=class&konv=json&class=Maa&ifile=' +
    '/DATABASE/01*;ULKOMAANKAUPPATILASTOT/06*;KAUPPATASE/ULJAS_KAUPPATASE';
  const d = await fetchJson<{ classification: { class: { code: string; text: string }[] }[] }>(url);
  countryCache = new Map(d.classification[0].class.map((c) => [c.code, c.text.replace(/^\([^)]*\)\s*/, '')]));
  return countryCache;
}
