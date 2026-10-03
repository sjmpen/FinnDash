import { useMemo } from 'react';
import type { CategoryTable, TabData } from '../../shared/types.ts';
import { ChartCard } from '../components/ChartCard.tsx';
import { EChart } from '../components/EChart.tsx';
import { KpiTile } from '../components/KpiTile.tsx';
import { barList, stackedAreaChart, timeChart, type Ctx, type Line } from '../charts/options.ts';
import { categoryTable, seriesTable } from '../charts/tables.ts';
import { latest, previous, scaled } from '../lib/data.ts';
import { fmtMillions, periodLong } from '../lib/format.ts';

/** Product groups in their fixed colour order; "other" is always the neutral grey. */
const GROUPS = [
  { id: 'forest', name: 'Metsäteollisuus' },
  { id: 'metals', name: 'Metallit' },
  { id: 'machinery', name: 'Koneet ja laitteet' },
  { id: 'vehicles', name: 'Kuljetusvälineet' },
  { id: 'chemicals', name: 'Kemianteollisuus' },
  { id: 'energy', name: 'Energia' },
  { id: 'food', name: 'Elintarvikkeet' },
];

const BN = 1 / 1000;

/** Partner table in € billions. */
function inBillions(t: CategoryTable | undefined): CategoryTable | undefined {
  if (!t) return undefined;
  return {
    ...t,
    unit: 'mrd. €',
    columns: { ...t.columns, value: '12 kk, mrd. €' },
    rows: t.rows.map((r) => ({
      ...r,
      values: { ...r.values, value: r.values.value === null ? null : r.values.value * BN },
    })),
  };
}

export function Trade({ data, ctx }: { data: TabData; ctx: Ctx }) {
  const s = data.series;
  const tb = data.tables;
  const c = ctx.t.series;

  // Change in exports by product group: latest 12 months vs the 12 months before.
  const exportChange: CategoryTable | undefined = useMemo(() => {
    const first = s['products.exports.forest'];
    if (!first) return undefined;
    const rows = [...GROUPS, { id: 'other', name: 'Muut' }].map((g) => {
      const ser = s[`products.exports.${g.id}`];
      const now = latest(ser)?.[1] ?? null;
      const before = previous(ser, 12)?.[1] ?? null;
      return {
        key: g.id,
        label: g.name,
        values: {
          change: now !== null && before ? (now / before - 1) * 100 : null,
          value: now === null ? null : now * BN,
        },
      };
    });
    const last = latest(first)?.[0] ?? '';
    return {
      id: 'products.export_change',
      label: 'Viennin muutos tuoteryhmittäin',
      unit: '%',
      period: last,
      source: first.source,
      columns: { change: 'Muutos edellisestä 12 kk:sta, %', value: '12 kk, mrd. €' },
      rows,
    };
  }, [s]);

  const charts = useMemo(() => {
    const productLines = (flow: 'exports' | 'imports'): Line[] => [
      ...GROUPS.map((g, i) => ({
        series: scaled(s[`products.${flow}.${g.id}`], BN, 'mrd. €'),
        name: g.name,
        color: c[i],
      })),
      { series: scaled(s[`products.${flow}.other`], BN, 'mrd. €'), name: 'Muut', color: ctx.t.other },
    ];
    const goods = [
      { series: scaled(s['goods.exports_12m'], BN, 'mrd. €'), name: 'Vienti', color: c[0] },
      { series: scaled(s['goods.imports_12m'], BN, 'mrd. €'), name: 'Tuonti', color: c[1] },
    ];
    const services = [
      { series: scaled(s['bop.services_exports_12m'], BN, 'mrd. €'), name: 'Palveluvienti', color: c[0] },
      { series: scaled(s['bop.services_imports_12m'], BN, 'mrd. €'), name: 'Palvelutuonti', color: c[1] },
    ];
    const balances = [
      { series: scaled(s['goods.balance_12m'], BN, 'mrd. €'), name: 'Tavarakaupan tase (Tulli)', color: c[0] },
      { series: scaled(s['bop.current_account_12m'], BN, 'mrd. €'), name: 'Vaihtotase', color: c[2] },
    ];
    const exp = productLines('exports');
    const imp = productLines('imports');
    return {
      goods: { lines: goods, option: timeChart(ctx, goods, { unit: 'mrd. €', endLabels: 'first' }) },
      services: {
        lines: services,
        option: timeChart(ctx, services, { unit: 'mrd. €', endLabels: 'first', includeZero: true }),
      },
      balances: { lines: balances, option: timeChart(ctx, balances, { unit: 'mrd. €', endLabels: 'first' }) },
      exp: { lines: exp, option: stackedAreaChart(ctx, exp, { unit: 'mrd. €' }) },
      imp: { lines: imp, option: stackedAreaChart(ctx, imp, { unit: 'mrd. €' }) },
      expPartners: barList(ctx, inBillions(tb['partners.exports']), {
        column: 'value',
        unit: 'mrd. €',
        extra: { yoy: '%' },
      }),
      impPartners: barList(ctx, inBillions(tb['partners.imports']), {
        column: 'value',
        unit: 'mrd. €',
        extra: { yoy: '%' },
      }),
      change: barList(ctx, exportChange, { column: 'change', unit: '%', extra: { value: 'mrd. €' } }),
    };
  }, [s, tb, c, ctx, exportChange]);

  const topExport = tb['partners.exports']?.rows[0];
  const topImport = tb['partners.imports']?.rows[0];
  const partnersPeriod = tb['partners.exports'] ? periodLong(tb['partners.exports'].period) : '';

  return (
    <>
      <div className="kpis">
        <KpiTile label="Tavaravienti, kuukausi" series={s['goods.exports']} change="pct" good="up" />
        <KpiTile label="Tavaratuonti, kuukausi" series={s['goods.imports']} change="pct" good="neutral" />
        <KpiTile label="Kauppatase, kuukausi" series={s['goods.balance']} good="up" />
        <KpiTile label="Vienti, 12 kk" series={s['goods.exports_12m']} change="pct" good="up" />
        <KpiTile label="Tuonti, 12 kk" series={s['goods.imports_12m']} change="pct" good="neutral" />
        <KpiTile label="Kauppatase, 12 kk" series={s['goods.balance_12m']} good="up" />
        <KpiTile label="Palveluvienti, 12 kk" series={s['bop.services_exports_12m']} change="pct" good="up" />
        <KpiTile label="Vaihtotase, 12 kk" series={s['bop.current_account_12m']} good="up" />
        <KpiTile
          label="Suurin vientimaa"
          series={undefined}
          valueText={topExport?.label ?? '–'}
          detail={topExport ? `${fmtMillions(topExport.values.value)} / 12 kk` : undefined}
          periodText={partnersPeriod}
        />
        <KpiTile
          label="Suurin tuontimaa"
          series={undefined}
          valueText={topImport?.label ?? '–'}
          detail={topImport ? `${fmtMillions(topImport.values.value)} / 12 kk` : undefined}
          periodText={partnersPeriod}
        />
      </div>

      <div className="grid">
        <ChartCard
          className="span-3"
          title="Tavarakauppa"
          subtitle="Vienti ja tuonti, 12 kuukauden liukuva summa, mrd. €"
          sources={[s['goods.exports']?.source]}
          table={seriesTable(charts.goods.lines)}
        >
          <EChart option={charts.goods.option} label="Tavaroiden vienti ja tuonti" />
        </ChartCard>

        <ChartCard
          className="span-3"
          title="Vienti tuoteryhmittäin"
          subtitle="12 kuukauden liukuva summa, mrd. €"
          sources={[s['products.exports.forest']?.source]}
          table={seriesTable(charts.exp.lines)}
        >
          <EChart option={charts.exp.option} label="Vienti tuoteryhmittäin" />
        </ChartCard>

        <ChartCard
          className="span-3"
          title="Suurimmat vientimaat"
          subtitle={`Tavaravienti, mrd. €, ${partnersPeriod}`}
          sources={[tb['partners.exports']?.source]}
          table={categoryTable(inBillions(tb['partners.exports']))}
        >
          <EChart option={charts.expPartners} label="Suurimmat vientimaat" />
        </ChartCard>

        <ChartCard
          className="span-3"
          title="Viennin muutos tuoteryhmittäin"
          subtitle="Viimeiset 12 kk verrattuna edelliseen 12 kuukauteen, %"
          sources={[s['products.exports.forest']?.source]}
          table={categoryTable(exportChange)}
        >
          <EChart option={charts.change} label="Viennin muutos tuoteryhmittäin" />
        </ChartCard>

        <ChartCard
          className="span-3"
          title="Kauppatase ja vaihtotase"
          subtitle="12 kuukauden liukuva summa, mrd. €"
          sources={[s['goods.balance_12m']?.source, s['bop.current_account_12m']?.source]}
          table={seriesTable(charts.balances.lines)}
        >
          <EChart option={charts.balances.option} label="Kauppatase ja vaihtotase" />
        </ChartCard>

        <ChartCard
          className="span-3"
          title="Tuonti tuoteryhmittäin"
          subtitle="12 kuukauden liukuva summa, mrd. €"
          sources={[s['products.imports.forest']?.source]}
          table={seriesTable(charts.imp.lines)}
        >
          <EChart option={charts.imp.option} label="Tuonti tuoteryhmittäin" />
        </ChartCard>

        <ChartCard
          className="span-3"
          title="Suurimmat tuontimaat"
          subtitle={`Tavaratuonti, mrd. €, ${partnersPeriod}`}
          sources={[tb['partners.imports']?.source]}
          table={categoryTable(inBillions(tb['partners.imports']))}
        >
          <EChart option={charts.impPartners} label="Suurimmat tuontimaat" />
        </ChartCard>

        <ChartCard
          className="span-3"
          title="Palvelukauppa"
          subtitle="Palveluiden vienti ja tuonti, 12 kuukauden liukuva summa, mrd. €"
          sources={[s['bop.services_exports_12m']?.source]}
          table={seriesTable(charts.services.lines)}
        >
          <EChart option={charts.services.option} label="Palveluiden vienti ja tuonti" />
        </ChartCard>
      </div>
    </>
  );
}
