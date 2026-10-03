// "Yleiskatsaus" – headline indicators of the Finnish economy.

import type { CategoryTable, Point, Series } from '../../shared/types.ts';
import type { TabBuilder } from '../builder.ts';
import { ecbSeries } from '../sources/ecb.ts';
import { pxQuery, pxSeries, pxSource, pxValue } from '../sources/statfin.ts';
import { normalisePeriod, pctChange, round, since, trimNulls } from '../periods.ts';

/** CPI main groups (COICOP 2018). Contributions are published from 2026-01 onwards. */
const CPI_MAIN_GROUPS = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12', '13'];

/** Short Finnish names for the COICOP main groups (the official ones are long and upper-case). */
const CPI_GROUP_LABELS: Record<string, string> = {
  '01': 'Elintarvikkeet ja alkoholittomat juomat',
  '02': 'Alkoholijuomat ja tupakka',
  '03': 'Vaatetus ja jalkineet',
  '04': 'Asuminen ja energia',
  '05': 'Kalusteet ja kotitalous',
  '06': 'Terveys',
  '07': 'Liikenne',
  '08': 'Informaatio ja viestintä',
  '09': 'Kulttuuri ja vapaa-aika',
  '10': 'Koulutus',
  '11': 'Ravintolat ja majoitus',
  '12': 'Vakuutus- ja rahoituspalvelut',
  '13': 'Muut tavarat ja palvelut',
};

export async function buildOverview(b: TabBuilder) {
  await b.group('cpi', async () => {
    const res = await pxQuery('khi/15b5', {
      timeperiod_m: 'all',
      coicop_46_20231201: ['SSS', ...CPI_MAIN_GROUPS],
      contentscode: ['vm_khi', 'vv_khi'],
    });
    const yoy = pxSeries(
      res,
      { coicop_46_20231201: 'SSS', contentscode: 'vm_khi' },
      { id: 'cpi.yoy', label: 'Inflaatio (kuluttajahintaindeksin vuosimuutos)', unit: '%', freq: 'M' },
    );
    yoy.data = trimNulls(since(yoy.data, '2000-01'));

    // Contribution of each main group to the latest annual change (percentage points).
    const latest = yoy.data[yoy.data.length - 1][0].replace('-', 'M');
    const contrib: CategoryTable = {
      id: 'cpi.contrib',
      label: 'Hyödykeryhmien vaikutus inflaatioon',
      unit: '%-yks.',
      period: normalisePeriod(latest),
      source: pxSource(res),
      columns: { contrib: 'Vaikutus vuosimuutokseen, %-yks.', yoy: 'Ryhmän hintojen vuosimuutos, %' },
      rows: CPI_MAIN_GROUPS.map((code) => {
        const f = { coicop_46_20231201: code, timeperiod_m: latest };
        return {
          key: code,
          label: CPI_GROUP_LABELS[code],
          values: {
            contrib: pxValue(res, { ...f, contentscode: 'vv_khi' }),
            yoy: pxValue(res, { ...f, contentscode: 'vm_khi' }),
          },
        };
      }),
    };
    return { series: [yoy], tables: [contrib] };
  });

  await b.group('hicp', async () => {
    const res = await pxQuery('khi/15b7', {
      timeperiod_m: 'all',
      coicop_46_20231201: ['SSS'],
      contentscode: ['vm_ykhi'],
    });
    const hicp = pxSeries(
      res,
      { contentscode: 'vm_ykhi' },
      { id: 'hicp.yoy', label: 'Yhdenmukaistettu kuluttajahintaindeksi (YKHI), vuosimuutos', unit: '%', freq: 'M' },
    );
    hicp.data = trimNulls(since(hicp.data, '2000-01'));

    const flashRes = await pxQuery('khi/15b9', {
      timeperiod_m: 'all',
      coicop_46_20231201: ['SSS'],
      contentscode: ['vm_ykhi_ennakko'],
    });
    const flash = pxSeries(
      flashRes,
      { contentscode: 'vm_ykhi_ennakko' },
      { id: 'hicp.flash', label: 'YKHI-ennakkotieto, vuosimuutos', unit: '%', freq: 'M' },
    );
    flash.data = trimNulls(flash.data);
    return { series: [hicp, flash] };
  });

  await b.group('labour', async () => {
    const res = await pxQuery('tyti/135z', {
      timeperiod_m: 'all',
      contentscode: [
        'tyottaste_trendi',
        'Tyottaste_kausi',
        'Tyollaste_20_64_trendi',
        'Tyollaste_20_64_kausi',
        'Tyottaste_15_24_trendi',
      ],
    });
    const s = (code: string, id: string, label: string) => {
      const out = pxSeries(res, { contentscode: code }, { id, label, unit: '%', freq: 'M' });
      out.data = trimNulls(out.data);
      return out;
    };
    return {
      series: [
        s('tyottaste_trendi', 'labour.unemp_trend', 'Työttömyysaste, trendi (15–74 v)'),
        s('Tyottaste_kausi', 'labour.unemp_sa', 'Työttömyysaste, kausitasoitettu (15–74 v)'),
        s('Tyottaste_15_24_trendi', 'labour.youth_unemp_trend', 'Nuorten työttömyysaste, trendi (15–24 v)'),
        s('Tyollaste_20_64_trendi', 'labour.emp_trend', 'Työllisyysaste, trendi (20–64 v)'),
        s('Tyollaste_20_64_kausi', 'labour.emp_sa', 'Työllisyysaste, kausitasoitettu (20–64 v)'),
      ],
    };
  });

  await b.group('gdp', async () => {
    const res = await pxQuery('ntp/132h', {
      timeperiod_q: 'all',
      taloustoimi_1_20180101: ['B1GMH'],
      contentscode: ['vol_vv_kausitvv2015', 'vol_kk_kausitvv2015'],
    });
    const yoy = pxSeries(
      res,
      { contentscode: 'vol_vv_kausitvv2015' },
      { id: 'gdp.yoy', label: 'BKT:n volyymin muutos vuodentakaisesta (kausitasoitettu)', unit: '%', freq: 'Q' },
    );
    const qoq = pxSeries(
      res,
      { contentscode: 'vol_kk_kausitvv2015' },
      {
        id: 'gdp.qoq',
        label: 'BKT:n volyymin muutos edellisestä neljänneksestä (kausitasoitettu)',
        unit: '%',
        freq: 'Q',
      },
    );
    yoy.data = trimNulls(since(yoy.data, '2005-Q1'));
    qoq.data = trimNulls(since(qoq.data, '2005-Q1'));
    return { series: [yoy, qoq] };
  });

  await b.group('output', async () => {
    const res = await pxQuery('ktkk/132f', {
      timeperiod_m: 'all',
      toimiala_79_20180101: ['SSS'],
      contentscode: ['vol_muutos_edvv_tyop', 'ind_trendi_2015'],
    });
    const yoy = pxSeries(
      res,
      { contentscode: 'vol_muutos_edvv_tyop' },
      {
        id: 'output.yoy',
        label: 'Tuotannon suhdannekuvaaja, muutos vuodentakaisesta (työpäiväkorjattu)',
        unit: '%',
        freq: 'M',
      },
    );
    const trend = pxSeries(
      res,
      { contentscode: 'ind_trendi_2015' },
      { id: 'output.trend', label: 'Tuotannon suhdannekuvaaja, trendi (2015 = 100)', unit: 'indeksi', freq: 'M' },
    );
    // Annual change of the trend series: a smooth monthly companion to quarterly GDP.
    const trendYoy: Series = {
      ...trend,
      id: 'output.trend_yoy',
      label: 'Tuotannon suhdannekuvaaja, trendin muutos vuodentakaisesta',
      unit: '%',
      data: round(trimNulls(since(pctChange(trend.data, 'M', 12), '2005-01')), 1),
    };
    yoy.data = trimNulls(since(yoy.data, '2005-01'));
    trend.data = trimNulls(since(trend.data, '2005-01'));
    return { series: [yoy, trend, trendYoy] };
  });

  await b.group('confidence', async () => {
    const res = await pxQuery('kbar/11cc', { timeperiod_m: 'all', contentscode: ['CCI_A1'] });
    const s = pxSeries(
      res,
      { contentscode: 'CCI_A1' },
      { id: 'confidence.consumer', label: 'Kuluttajien luottamusindikaattori', unit: 'saldoluku', freq: 'M' },
    );
    s.data = trimNulls(since(s.data, '2000-01'));
    return { series: [s] };
  });

  await b.group('wages', async () => {
    const res = await pxQuery('ati/14um', {
      tyonantajasekt_3_20190528: ['SSS'],
      palk_muo_2_20120101: ['0'],
      sukupuoli_9_20180101: ['SSS'],
      timeperiod_q: 'all',
      contentscode: ['ati_vuosimuutosprosentti', 'real_vuosimuutosprosentti'],
    });
    const nominal = pxSeries(
      res,
      { contentscode: 'ati_vuosimuutosprosentti' },
      { id: 'wages.nominal_yoy', label: 'Ansiotasoindeksi, vuosimuutos', unit: '%', freq: 'Q' },
    );
    const real = pxSeries(
      res,
      { contentscode: 'real_vuosimuutosprosentti' },
      { id: 'wages.real_yoy', label: 'Reaaliansioindeksi, vuosimuutos', unit: '%', freq: 'Q' },
    );
    nominal.data = trimNulls(since(nominal.data, '2005-Q1'));
    real.data = trimNulls(since(real.data, '2005-Q1'));
    return { series: [nominal, real] };
  });

  await b.group('bankruptcies', async () => {
    const res = await pxQuery('kony/13fb', { timeperiod_m: 'all', contentscode: ['kony-ylkm_sum', 'kylkm'] });
    const rolling = pxSeries(
      res,
      { contentscode: 'kony-ylkm_sum' },
      { id: 'bankruptcies.rolling12', label: 'Konkurssit, 12 kk liukuva summa', unit: 'yritystä', freq: 'M' },
    );
    const monthly = pxSeries(
      res,
      { contentscode: 'kylkm' },
      { id: 'bankruptcies.monthly', label: 'Vireille pannut konkurssit', unit: 'yritystä', freq: 'M' },
    );
    rolling.data = trimNulls(since(rolling.data, '2005-01'));
    monthly.data = trimNulls(since(monthly.data, '2005-01'));
    return { series: [rolling, monthly] };
  });

  await b.group('debt', async () => {
    const res = await pxQuery('jyev/12sy', { timeperiod_q: 'all', contentscode: ['debt_GDP'] });
    const s = pxSeries(
      res,
      { contentscode: 'debt_GDP' },
      { id: 'debt.gdp_ratio', label: 'Julkisyhteisöjen EDP-velka suhteessa BKT:hen', unit: '%', freq: 'Q' },
    );
    s.data = trimNulls(s.data);
    return { series: [s] };
  });

  await b.group('rates', async () => {
    const start = '2005-01';
    const euribor3 = await ecbSeries('FM', 'M.U2.EUR.RT.MM.EURIBOR3MD_.HSTA', {
      id: 'rates.euribor3m',
      label: '3 kk Euribor',
      unit: '%',
      freq: 'M',
      start,
    });
    const euribor12 = await ecbSeries('FM', 'M.U2.EUR.RT.MM.EURIBOR1YD_.HSTA', {
      id: 'rates.euribor12m',
      label: '12 kk Euribor',
      unit: '%',
      freq: 'M',
      start,
    });
    const bond10 = await ecbSeries('IRS', 'M.FI.L.L40.CI.0000.EUR.N.Z', {
      id: 'rates.fi10y',
      label: 'Suomen valtion 10 v obligaatio',
      unit: '%',
      freq: 'M',
      start,
    });
    // Deposit facility rate is published as a list of change dates; turn it into a monthly
    // series (rate in force at the end of each month) so it sits on the same axis.
    const dfrChanges = await ecbSeries('FM', 'B.U2.EUR.4F.KR.DFR.LEV', {
      id: 'rates.ecb_deposit',
      label: 'EKP:n talletuskorko',
      unit: '%',
      freq: 'D',
      start: '1999-01',
    });
    const dfr: Series = { ...dfrChanges, freq: 'M', data: monthlyStep(dfrChanges.data, start) };
    for (const s of [euribor3, euribor12, bond10]) s.data = round(trimNulls(s.data), 3);
    return { series: [dfr, euribor3, euribor12, bond10] };
  });
}

/** Daily change list → value in force at the end of each month from `start` to the current month. */
function monthlyStep(changes: Point[], start: string): Point[] {
  const out: Point[] = [];
  const now = new Date();
  const end = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  let [y, m] = start.split('-').map(Number);
  let i = 0;
  let current: number | null = null;
  for (;;) {
    const key = `${y}-${String(m).padStart(2, '0')}`;
    if (key > end) break;
    while (i < changes.length && changes[i][0].slice(0, 7) <= key) current = changes[i++][1];
    out.push([key, current]);
    if (++m > 12) {
      m = 1;
      y++;
    }
  }
  return trimNulls(out);
}
