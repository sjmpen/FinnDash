import { useMemo } from 'react';
import type { CategoryTable, TabData } from '../../shared/types.ts';
import { ChartCard, type TableView } from '../components/ChartCard.tsx';
import { EChart } from '../components/EChart.tsx';
import { KpiTile } from '../components/KpiTile.tsx';
import { barList, marketMap, stackedAreaChart, timeChart, type Ctx, type Line } from '../charts/options.ts';
import { categoryTable, seriesTable } from '../charts/tables.ts';
import { rebased } from '../lib/data.ts';
import { fmt, fmtMillions, periodLong, periodToTime } from '../lib/format.ts';

/** How many of the largest companies the table and the market map show. */
const TOP_TABLE = 25;
const TOP_MAP = 50;

const signed = (v: number | null | undefined) => (v === null || v === undefined ? '–' : `${fmt(v, 1, true)} %`);

export function Stocks({ data, ctx }: { data: TabData; ctx: Ctx }) {
  const s = data.series;
  const tb = data.tables;
  const c = ctx.t.series;
  const companies = tb['companies.all'];
  const returns = useMemo(() => mergeTables(tb['helsinki.returns'], tb['markets.returns']), [tb]);
  const ret = (key: string) => returns?.rows.find((r) => r.key === key)?.values;

  const charts = useMemo(() => {
    // Rebase every line to 100 at a common start: the selected range start, or the latest
    // first observation if some series is shorter.
    const indexed = (lines: Line[]) => {
      const firsts = lines.map((l) => (l.series ? periodToTime(l.series.data[0][0]) : 0));
      const start = Math.max(ctx.rangeStart, ...firsts);
      return lines.map((l) => ({ ...l, series: rebased(l.series, start, periodToTime) }));
    };
    const helsinki = indexed([
      { series: s['helsinki.omxh25'], name: 'OMX Helsinki 25', color: c[0] },
      { series: s['helsinki.omxhpi'], name: 'Kaikki osakkeet', color: c[1] },
      { series: s['helsinki.omxhgi'], name: 'Kaikki osakkeet + osingot', color: c[2] },
    ]);
    const markets = indexed([
      { series: s['helsinki.omxh25'], name: 'Helsinki (OMXH25)', color: c[0] },
      { series: s['markets.omxs30'], name: 'Tukholma (OMXS30)', color: c[1] },
      { series: s['markets.omxc25'], name: 'Kööpenhamina (OMXC25)', color: c[2] },
      { series: s['markets.ndx'], name: 'USA (Nasdaq-100)', color: c[3] },
    ]);
    const owners: Line[] = [
      { series: s['ownership.foreign'], name: 'Ulkomaat', color: c[0] },
      { series: s['ownership.households'], name: 'Kotitaloudet', color: c[1] },
      { series: s['ownership.government'], name: 'Julkisyhteisöt', color: c[2] },
      { series: s['ownership.financial'], name: 'Rahoituslaitokset', color: c[3] },
      { series: s['ownership.companies'], name: 'Yritykset', color: c[4] },
    ];
    return {
      helsinki: { lines: helsinki, option: timeChart(ctx, helsinki, { unit: 'indeksi', endLabels: 'all' }) },
      markets: { lines: markets, option: timeChart(ctx, markets, { unit: 'indeksi', endLabels: 'first' }) },
      owners: { lines: owners, option: stackedAreaChart({ ...ctx, rangeStart: 0 }, owners, { unit: '%', max: 100 }) },
      sectors: barList(ctx, tb['sectors.returns'], { column: 'y1', unit: '%', extra: { ytd: '%', m1: '%' } }),
      map: marketMap(ctx, companies, {
        size: 'mcap',
        color: 'd1',
        range: 3,
        maxItems: TOP_MAP,
        extra: { mcap: 'milj. €', price: '€', d1: '%', ytd: '%', y1: '%' },
      }),
    };
  }, [s, tb, c, ctx, companies]);

  const top = companies?.rows.slice(0, TOP_TABLE) ?? [];
  const totalCap = companies?.rows.reduce((a, r) => a + (r.values.mcap ?? 0), 0) ?? null;
  const largest30 = companies?.rows.slice(0, 30).filter((r) => r.values.y1 !== null) ?? [];
  const best = [...largest30].sort((a, b) => (b.values.y1 ?? 0) - (a.values.y1 ?? 0))[0];
  const worst = [...largest30].sort((a, b) => (a.values.y1 ?? 0) - (b.values.y1 ?? 0))[0];
  const asOf = companies ? periodLong(companies.period) : '';

  return (
    <>
      <div className="kpis">
        <KpiTile
          label="OMX Helsinki 25"
          series={s['helsinki.omxh25']}
          decimals={2}
          change="pct"
          lag={1}
          lagLabel="edellisestä päivästä"
          good="up"
          sparkPoints={250}
        />
        <KpiTile
          label="OMXH25, vuoden alusta"
          series={s['helsinki.omxh25']}
          change="none"
          valueText={signed(ret('omxh25')?.ytd)}
          detail={`kaikki osakkeet ${signed(ret('omxhpi')?.ytd)}`}
          sparkPoints={190}
        />
        <KpiTile
          label="OMXH25, 1 vuosi"
          series={s['helsinki.omxh25']}
          change="none"
          valueText={signed(ret('omxh25')?.y1)}
          detail={`kaikki osakkeet ${signed(ret('omxhpi')?.y1)}`}
          sparkPoints={250}
        />
        <KpiTile
          label="Kokonaistuotto, 5 vuotta"
          series={s['helsinki.omxhgi']}
          change="none"
          valueText={signed(ret('omxhgi')?.y5)}
          detail="osingot sijoitettuna"
          sparkPoints={400}
        />
        <KpiTile
          label="Pörssin markkina-arvo"
          series={undefined}
          valueText={fmtMillions(totalCap)}
          detail={`${companies?.rows.length ?? 0} yhtiötä, päälista`}
          periodText={asOf}
        />
        <KpiTile
          label="Suurin yhtiö"
          series={undefined}
          valueText={top[0]?.label ?? '–'}
          detail={top[0] ? fmtMillions(top[0].values.mcap) : undefined}
          periodText={asOf}
        />
        <KpiTile
          label="Paras 1 v"
          note="30 suurinta"
          series={undefined}
          valueText={best?.label ?? '–'}
          detail={best ? signed(best.values.y1) : undefined}
          periodText={asOf}
        />
        <KpiTile
          label="Heikoin 1 v"
          note="30 suurinta"
          series={undefined}
          valueText={worst?.label ?? '–'}
          detail={worst ? signed(worst.values.y1) : undefined}
          periodText={asOf}
        />
        <KpiTile label="Ulkomaalaisomistus" series={s['ownership.foreign']} good="neutral" sparkPoints={40} />
        <KpiTile label="Kotitalouksien omistus" series={s['ownership.households']} good="neutral" sparkPoints={40} />
      </div>

      <div className="grid">
        <ChartCard
          className="span-3 rows-2"
          title="Pörssikartta"
          subtitle={`${TOP_MAP} suurinta yhtiötä toimialoittain · koko = markkina-arvo · väri = kurssimuutos ${asOf}`}
          sources={[companies?.source]}
          table={categoryTable(companies, { mcap: 0, price: 2 })}
        >
          <EChart
            option={charts.map}
            label="Pörssikartta: yhtiöt markkina-arvon mukaan, väri päivän muutoksen mukaan"
          />
          <DivergingLegend ctx={ctx} range={3} />
        </ChartCard>

        <ChartCard
          className="span-3"
          title="Helsingin pörssi"
          subtitle="Indeksit, aikavälin alku = 100"
          sources={[s['helsinki.omxh25']?.source]}
          table={returnsTable(tb['helsinki.returns'])}
        >
          <EChart option={charts.helsinki.option} label="Helsingin pörssin indeksit" />
        </ChartCard>

        <ChartCard
          className="span-3"
          title="Helsinki ja muut markkinat"
          subtitle="Paikallisessa valuutassa, aikavälin alku = 100"
          sources={[s['markets.omxs30']?.source]}
          table={returnsTable(returns)}
        >
          <EChart option={charts.markets.option} label="Helsingin, Tukholman, Kööpenhaminan ja USA:n indeksit" />
        </ChartCard>

        <ChartCard
          className="span-3 rows-2"
          title="Suurimmat yhtiöt"
          subtitle={`Markkina-arvon mukaan, kurssit ${asOf}`}
          sources={[companies?.source]}
        >
          <CompanyTable rows={top} />
        </ChartCard>

        <ChartCard
          className="span-3"
          title="Toimialat"
          subtitle="Toimialaindeksien muutos 12 kuukaudessa, %"
          sources={[tb['sectors.returns']?.source]}
          table={categoryTable(tb['sectors.returns'])}
        >
          <EChart option={charts.sectors} label="Toimialaindeksien muutos vuodessa" />
        </ChartCard>

        <ChartCard
          className="span-3"
          title="Kuka omistaa pörssiyhtiöt"
          subtitle="Suomalaisten pörssiosakkeiden omistus sektoreittain, % markkina-arvosta"
          sources={[s['ownership.foreign']?.source]}
          table={seriesTable(charts.owners.lines, { rows: 24 })}
        >
          <EChart option={charts.owners.option} label="Pörssiosakkeiden omistus sektoreittain" />
        </ChartCard>
      </div>
    </>
  );
}

function mergeTables(a: CategoryTable | undefined, b: CategoryTable | undefined): CategoryTable | undefined {
  if (!a) return b;
  if (!b) return a;
  return { ...a, rows: [...a.rows, ...b.rows] };
}

function returnsTable(t: CategoryTable | undefined): TableView | undefined {
  if (!t) return undefined;
  const cols = Object.keys(t.columns);
  return {
    columns: ['Indeksi', ...cols.map((k) => t.columns[k].replace(', %', ''))],
    rows: t.rows.map((r) => [r.label, ...cols.map((k) => signed(r.values[k]))]),
  };
}

function CompanyTable({ rows }: { rows: CategoryTable['rows'] }) {
  const tone = (v: number | null) => (v === null || Math.abs(v) < 0.05 ? '' : v > 0 ? 'pos' : 'neg');
  return (
    <div className="table-wrap">
      <table className="company-table">
        <thead>
          <tr>
            <th>Yhtiö</th>
            <th title="Markkina-arvo">Arvo</th>
            <th>Kurssi</th>
            <th>Päivä</th>
            <th title="Vuoden alusta">YTD</th>
            <th>1 v</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <td>
                <div className="co-name">{r.label}</div>
                <div className="co-sector">{r.group}</div>
              </td>
              <td>{fmtMillions(r.values.mcap)}</td>
              <td>{fmt(r.values.price, 2)}</td>
              {(['d1', 'ytd', 'y1'] as const).map((k) => (
                <td key={k} className={tone(r.values[k])}>
                  {signed(r.values[k])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Colour key for the market map: the diverging scale with its end values. */
function DivergingLegend({ ctx, range }: { ctx: Ctx; range: number }) {
  const { neg, mid, pos } = ctx.t.diverging;
  return (
    <div className="div-legend" aria-hidden="true">
      <span>−{fmt(range, 0)} %</span>
      <span className="div-bar" style={{ background: `linear-gradient(90deg, ${neg}, ${mid}, ${pos})` }} />
      <span>+{fmt(range, 0)} %</span>
    </div>
  );
}
