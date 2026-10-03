import { useMemo } from 'react';
import type { TabData } from '../../shared/types.ts';
import { ChartCard } from '../components/ChartCard.tsx';
import { EChart } from '../components/EChart.tsx';
import { KpiTile } from '../components/KpiTile.tsx';
import { barList, timeChart, type Ctx } from '../charts/options.ts';
import { categoryTable, seriesTable } from '../charts/tables.ts';
import { latest } from '../lib/data.ts';
import { fmt, periodLong } from '../lib/format.ts';

export function Overview({ data, ctx }: { data: TabData; ctx: Ctx }) {
  const s = data.series;
  const tb = data.tables;
  const c = ctx.t.series;

  // Show the HICP flash estimate only when it is newer than the regular CPI release.
  const flash = latest(s['hicp.flash']);
  const cpiLatest = latest(s['cpi.yoy']);
  const flashIsNewer = flash && cpiLatest && flash[0] > cpiLatest[0];

  // Long-run average of the confidence indicator (since 2000) as a reference line.
  const confidenceAvg = useMemo(() => {
    const v = (s['confidence.consumer']?.data ?? []).map(([, x]) => x).filter((x): x is number => x !== null);
    return v.length ? v.reduce((a, x) => a + x, 0) / v.length : null;
  }, [s]);

  const charts = useMemo(() => {
    const inflation = [
      { series: s['cpi.yoy'], name: 'Kuluttajahintaindeksi', color: c[0] },
      { series: s['hicp.yoy'], name: 'YKHI (EU-vertailukelpoinen)', color: c[1] },
    ];
    const growth = [
      { series: s['gdp.yoy'], name: 'BKT, neljännesvuosi', color: c[0], kind: 'bar' as const },
      { series: s['output.trend_yoy'], name: 'Tuotannon suhdannekuvaaja (trendi), kuukausi', color: c[1] },
    ];
    const labour = [
      { series: s['labour.unemp_trend'], name: 'Työttömyysaste, trendi', color: c[0] },
      { series: s['labour.unemp_sa'], name: 'Kausitasoitettu', color: ctx.t.other },
    ];
    const rates = [
      { series: s['rates.ecb_deposit'], name: 'EKP:n talletuskorko', color: c[0], kind: 'step' as const },
      { series: s['rates.euribor3m'], name: '3 kk Euribor', color: c[1] },
      { series: s['rates.euribor12m'], name: '12 kk Euribor', color: c[2] },
      { series: s['rates.fi10y'], name: 'Valtion 10 v korko', color: c[3] },
    ];
    const confidence = [{ series: s['confidence.consumer'], name: 'Kuluttajien luottamus', color: c[0] }];
    const wages = [
      { series: s['wages.nominal_yoy'], name: 'Ansiotaso', color: c[0] },
      { series: s['wages.real_yoy'], name: 'Reaaliansiot', color: c[1] },
    ];
    const bankruptcies = [{ series: s['bankruptcies.rolling12'], name: 'Konkurssit, 12 kk', color: c[0] }];
    return {
      inflation: {
        lines: inflation,
        option: timeChart(ctx, inflation, {
          unit: '%',
          endLabels: 'first',
          reference: { value: 2, label: 'EKP:n tavoite 2 %' },
        }),
      },
      contrib: barList(ctx, tb['cpi.contrib'], { column: 'contrib', unit: '%-yks.', decimals: 2, extra: { yoy: '%' } }),
      growth: { lines: growth, option: timeChart(ctx, growth, { unit: '%' }) },
      labour: { lines: labour, option: timeChart(ctx, labour, { unit: '%', endLabels: 'first' }) },
      rates: { lines: rates, option: timeChart(ctx, rates, { unit: '%', decimals: 2, includeZero: true }) },
      confidence: {
        lines: confidence,
        option: timeChart(ctx, confidence, {
          unit: 'saldoluku',
          endLabels: 'first',
          includeZero: true,
          reference:
            confidenceAvg === null ? undefined : { value: confidenceAvg, label: `Keskiarvo ${fmt(confidenceAvg, 1)}` },
        }),
      },
      wages: { lines: wages, option: timeChart(ctx, wages, { unit: '%', endLabels: 'all' }) },
      bankruptcies: {
        lines: bankruptcies,
        option: timeChart(ctx, bankruptcies, { unit: 'yritystä', decimals: 0, endLabels: 'first', includeZero: true }),
      },
    };
  }, [s, tb, c, ctx, confidenceAvg]);

  return (
    <>
      <div className="kpis">
        <KpiTile label="Inflaatio" series={s['cpi.yoy']} good="neutral" />
        {flashIsNewer ? (
          <KpiTile label="Inflaatio, YKHI-ennakko" series={s['hicp.flash']} good="neutral" />
        ) : (
          <KpiTile label="YKHI-inflaatio" series={s['hicp.yoy']} good="neutral" />
        )}
        <KpiTile label="Työttömyysaste (trendi)" series={s['labour.unemp_trend']} good="down" />
        <KpiTile label="Työllisyysaste 20–64 v" series={s['labour.emp_trend']} good="up" />
        <KpiTile label="BKT, vuosimuutos" series={s['gdp.yoy']} good="up" sparkPoints={16} />
        <KpiTile label="Tuotanto, vuosimuutos" series={s['output.yoy']} good="up" />
        <KpiTile label="12 kk Euribor" series={s['rates.euribor12m']} decimals={2} good="neutral" />
        <KpiTile label="Kuluttajien luottamus" series={s['confidence.consumer']} good="up" />
        <KpiTile label="Reaaliansiot, vuosimuutos" series={s['wages.real_yoy']} good="up" sparkPoints={16} />
        <KpiTile label="Konkurssit, 12 kk" series={s['bankruptcies.rolling12']} decimals={0} change="pct" good="down" />
        <KpiTile label="Julkinen velka / BKT" series={s['debt.gdp_ratio']} good="down" sparkPoints={20} />
      </div>

      <div className="grid">
        <ChartCard
          className="span-3"
          title="Inflaatio"
          subtitle="Kuluttajahintojen vuosimuutos, %"
          sources={[s['cpi.yoy']?.source, s['hicp.yoy']?.source]}
          table={seriesTable(charts.inflation.lines)}
        >
          <EChart option={charts.inflation.option} label="Inflaatio kuukausittain" />
        </ChartCard>

        <ChartCard
          className="span-3"
          title="Mistä inflaatio koostuu"
          subtitle={`Hyödykeryhmien vaikutus vuosimuutokseen, %-yksikköä, ${tb['cpi.contrib'] ? periodLong(tb['cpi.contrib'].period) : ''}`}
          sources={[tb['cpi.contrib']?.source]}
          table={categoryTable(tb['cpi.contrib'], { contrib: 2 })}
        >
          <EChart option={charts.contrib} label="Hyödykeryhmien vaikutus inflaatioon" />
        </ChartCard>

        <ChartCard
          className="span-3"
          title="Talouskasvu"
          subtitle="Volyymin muutos vuodentakaisesta, %"
          sources={[s['gdp.yoy']?.source, s['output.yoy']?.source]}
          table={seriesTable(charts.growth.lines)}
        >
          <EChart option={charts.growth.option} label="BKT:n ja tuotannon muutos" />
        </ChartCard>

        <ChartCard
          className="span-3"
          title="Työttömyys"
          subtitle="Työttömyysaste 15–74-vuotiaat, %"
          sources={[s['labour.unemp_trend']?.source]}
          table={seriesTable(charts.labour.lines)}
        >
          <EChart option={charts.labour.option} label="Työttömyysaste" />
        </ChartCard>

        <ChartCard
          className="span-3"
          title="Korot"
          subtitle="Kuukausikeskiarvot, %"
          sources={[s['rates.euribor12m']?.source, s['rates.fi10y']?.source]}
          table={seriesTable(charts.rates.lines, { decimals: 2 })}
        >
          <EChart option={charts.rates.option} label="Korot" />
        </ChartCard>

        <ChartCard
          className="span-3"
          title="Kuluttajien luottamus"
          subtitle="Luottamusindikaattori, saldoluku"
          sources={[s['confidence.consumer']?.source]}
          table={seriesTable(charts.confidence.lines)}
        >
          <EChart option={charts.confidence.option} label="Kuluttajien luottamus" />
        </ChartCard>

        <ChartCard
          className="span-3"
          title="Palkat"
          subtitle="Ansiotasoindeksin ja reaaliansioiden vuosimuutos, %"
          sources={[s['wages.nominal_yoy']?.source]}
          table={seriesTable(charts.wages.lines)}
        >
          <EChart option={charts.wages.option} label="Palkkojen vuosimuutos" />
        </ChartCard>

        <ChartCard
          className="span-3"
          title="Konkurssit"
          subtitle="Vireille pannut konkurssit, 12 kuukauden liukuva summa"
          sources={[s['bankruptcies.rolling12']?.source]}
          table={seriesTable(charts.bankruptcies.lines, { decimals: 0 })}
        >
          <EChart option={charts.bankruptcies.option} label="Konkurssit" />
        </ChartCard>
      </div>
    </>
  );
}
