import { useEffect, useMemo, useState } from 'react';
import type { TabData } from '../../shared/types.ts';
import { ChartCard } from '../components/ChartCard.tsx';
import { EChart, echarts } from '../components/EChart.tsx';
import { KpiTile } from '../components/KpiTile.tsx';
import { barList, choropleth, timeChart, type Ctx } from '../charts/options.ts';
import { categoryTable, seriesTable } from '../charts/tables.ts';
import { periodLong } from '../lib/format.ts';

const AREAS = [
  { code: 'SSS', name: 'Koko maa' },
  { code: 'pks', name: 'Pääkaupunkiseutu' },
  { code: 'msu', name: 'Muu Suomi' },
];

function useRegionMap() {
  const [ready, setReady] = useState(() => !!echarts.getMap('maakunnat'));
  useEffect(() => {
    if (ready) return;
    fetch('geo/maakunnat.json')
      .then((r) => r.json())
      .then((geo) => {
        echarts.registerMap('maakunnat', geo);
        setReady(true);
      })
      .catch(() => setReady(false));
  }, [ready]);
  return ready;
}

export function Housing({ data, ctx }: { data: TabData; ctx: Ctx }) {
  const s = data.series;
  const tb = data.tables;
  const c = ctx.t.series;
  const mapReady = useRegionMap();

  const charts = useMemo(() => {
    const index = AREAS.map((a, i) => ({ series: s[`priceindex.nominal.${a.code}`], name: a.name, color: c[i] }));
    const yoy = AREAS.map((a, i) => ({ series: s[`priceindex.yoy.${a.code}`], name: a.name, color: c[i] }));
    const sales = [
      { series: s['prices.sales.pks'], name: 'Pääkaupunkiseutu', color: c[1], kind: 'bar' as const },
      { series: s['prices.sales.msu'], name: 'Muu Suomi', color: c[2], kind: 'bar' as const },
    ];
    const loans = [
      { series: s['mortgages.rate'], name: 'Uusien asuntolainojen keskikorko', color: c[0] },
      { series: s['mortgages.euribor12m'], name: '12 kk Euribor', color: c[1] },
    ];
    const building = [
      { series: s['construction.permits'], name: 'Luvat', color: c[0] },
      { series: s['construction.starts'], name: 'Aloitukset', color: c[1] },
      { series: s['construction.completions'], name: 'Valmistuneet', color: c[2] },
    ];
    return {
      index: { lines: index, option: timeChart(ctx, index, { unit: 'indeksi', endLabels: 'all' }) },
      yoy: { lines: yoy, option: timeChart(ctx, yoy, { unit: '%' }) },
      sales: {
        lines: sales,
        option: timeChart({ ...ctx, rangeStart: 0 }, sales, { unit: 'kpl', decimals: 0, stacked: true }),
      },
      loans: {
        lines: loans,
        option: timeChart(ctx, loans, { unit: '%', decimals: 2, endLabels: 'first', includeZero: true }),
      },
      building: {
        lines: building,
        option: timeChart(ctx, building, { unit: 'asuntoa', decimals: 0, includeZero: true }),
      },
      rents: barList(ctx, tb['rents.free_market'], {
        column: 'rent',
        unit: '€/m²',
        decimals: 2,
        extra: { yoy: '%' },
        muted: ['SSS', 'pks', 'msu'],
      }),
      map: choropleth(ctx, tb['regions.sqm'], {
        map: 'maakunnat',
        column: 'sqm',
        unit: '€/m²',
        extra: { yoy: '%', sales: 'kpl' },
      }),
    };
  }, [s, tb, c, ctx]);

  return (
    <>
      <div className="kpis">
        <KpiTile
          label="Asuntohinnat, koko maa"
          series={s['prices.yoy.SSS']}
          change="none"
          detail="vuosimuutos"
          sparkPoints={12}
        />
        <KpiTile
          label="Asuntohinnat, PKS"
          series={s['prices.yoy.pks']}
          change="none"
          detail="vuosimuutos"
          sparkPoints={12}
        />
        <KpiTile
          label="Reaalihinnat, koko maa"
          series={s['prices.real_yoy.SSS']}
          change="none"
          detail="vuosimuutos, inflaatiokorjattu"
          sparkPoints={12}
        />
        <KpiTile
          label="Keskineliöhinta"
          series={s['prices.sqm.SSS']}
          decimals={0}
          change="pct"
          note="koko maa"
          good="neutral"
        />
        <KpiTile label="Kaupat välittäjien kautta" series={s['prices.sales.SSS']} decimals={0} change="pct" good="up" />
        <KpiTile label="Myyntiaika" series={s['prices.selltime.SSS']} decimals={0} change="diff" good="down" />
        <KpiTile label="Vuokrien vuosimuutos" series={s['rents.yoy']} change="none" detail="vapaarahoitteiset" />
        <KpiTile label="Asuntolainojen korko" series={s['mortgages.rate']} decimals={2} good="down" />
        <KpiTile label="Uudet asuntolainat" series={s['mortgages.new_volume']} decimals={0} change="pct" good="up" />
        <KpiTile
          label="Aloitetut asunnot, 12 kk"
          series={s['construction.starts']}
          decimals={0}
          change="pct"
          good="up"
        />
        <KpiTile label="Rakennuskustannukset" series={s['costs.building_yoy']} change="none" detail="vuosimuutos" />
      </div>

      <div className="grid">
        <ChartCard
          className="span-3 rows-2"
          title="Neliöhinnat maakunnittain"
          subtitle={`Vanhat osakeasunnot, €/m², ${tb['regions.sqm'] ? periodLong(tb['regions.sqm'].period) : ''}`}
          sources={[tb['regions.sqm']?.source]}
          table={categoryTable(tb['regions.sqm'], { sqm: 0, sales: 0 })}
        >
          {mapReady ? (
            <EChart option={charts.map} label="Neliöhinnat maakunnittain kartalla" />
          ) : (
            <div className="loading">Ladataan karttaa…</div>
          )}
        </ChartCard>

        <ChartCard
          className="span-3"
          title="Asuntojen hintakehitys"
          subtitle="Vanhojen osakeasuntojen hintaindeksi, 2015 = 100"
          sources={[s['priceindex.nominal.SSS']?.source]}
          table={seriesTable(charts.index.lines)}
        >
          <EChart option={charts.index.option} label="Asuntojen hintaindeksi" />
        </ChartCard>

        <ChartCard
          className="span-3"
          title="Hintojen vuosimuutos"
          subtitle="Vanhat osakeasunnot, muutos vuodentakaisesta neljänneksestä, %"
          sources={[s['priceindex.yoy.SSS']?.source]}
          table={seriesTable(charts.yoy.lines)}
        >
          <EChart option={charts.yoy.option} label="Asuntojen hintojen vuosimuutos" />
        </ChartCard>

        <ChartCard
          className="span-3"
          title="Asuntolainojen korot"
          subtitle="Uusien asuntolainojen keskikorko ja 12 kk Euribor, %"
          sources={[s['mortgages.rate']?.source, s['mortgages.euribor12m']?.source]}
          table={seriesTable(charts.loans.lines, { decimals: 2 })}
        >
          <EChart option={charts.loans.option} label="Asuntolainojen korot" />
        </ChartCard>

        <ChartCard
          className="span-3"
          title="Asuntokaupat"
          subtitle="Vanhojen osakeasuntojen kaupat kiinteistönvälittäjien kautta, kpl/kk"
          sources={[s['prices.sales.SSS']?.source]}
          table={seriesTable(charts.sales.lines, { decimals: 0 })}
        >
          <EChart option={charts.sales.option} label="Asuntokaupat kuukausittain" />
        </ChartCard>

        <ChartCard
          className="span-3"
          title="Vuokrat"
          subtitle={`Vapaarahoitteiset vuokra-asunnot, keskineliövuokra €/m²/kk, ${tb['rents.free_market'] ? periodLong(tb['rents.free_market'].period) : ''}`}
          sources={[tb['rents.free_market']?.source]}
          table={categoryTable(tb['rents.free_market'], { rent: 2 })}
        >
          <EChart option={charts.rents} label="Keskineliövuokrat kaupungeittain" />
        </ChartCard>

        <ChartCard
          className="span-3"
          title="Asuntotuotanto"
          subtitle="Uudet asunnot, 12 kuukauden liukuva summa"
          sources={[s['construction.starts']?.source]}
          table={seriesTable(charts.building.lines, { decimals: 0 })}
        >
          <EChart option={charts.building.option} label="Asuntotuotanto" />
        </ChartCard>
      </div>
    </>
  );
}
