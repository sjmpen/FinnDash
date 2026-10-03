// "Asuminen" – dwelling prices, transactions, rents, construction and mortgages.

import type { CategoryTable, Point, Series } from '../../shared/types.ts';
import type { TabBuilder } from '../builder.ts';
import { ecbSeries } from '../sources/ecb.ts';
import { pxQuery, pxSeries, pxSource, pxValue } from '../sources/statfin.ts';
import { pctChange, round, since, trimNulls } from '../periods.ts';

/** Areas shown in the monthly price series (code → label). */
const PRICE_AREAS: Record<string, string> = {
  SSS: 'Koko maa',
  pks: 'Pääkaupunkiseutu',
  msu: 'Muu Suomi',
};

/** Regions (maakunnat) present in the dwelling price statistics. Åland (MK21) is not covered. */
const REGIONS = [
  'MK01',
  'MK02',
  'MK04',
  'MK05',
  'MK06',
  'MK07',
  'MK08',
  'MK09',
  'MK10',
  'MK11',
  'MK12',
  'MK13',
  'MK14',
  'MK15',
  'MK16',
  'MK17',
  'MK18',
  'MK19',
];

/** Areas for the rent comparison. */
const RENT_AREAS = ['SSS', 'pks', 'msu', '091', '049', '092', '837', '853', '564', '179', '398', '297'];

export async function buildHousing(b: TabBuilder) {
  await b.group('prices', async () => {
    // Monthly statistics (2025 = 100). The series is new in 2026; long history comes below.
    const res = await pxQuery('ashi/15iq', {
      timeperiod_m: 'all',
      alue_43_20260625: Object.keys(PRICE_AREAS),
      talotyyppi_5_20111209: ['0'],
      contentscode: [
        'ashivm_indeksi_vmuutos_2025',
        'ashivm_realindeksi_vmuutos_2025',
        'ashivm_keskineliohinta',
        'ashivm_kauppamaara_kvkl',
        'ashivm_myyntiaika',
      ],
    });
    const series: Series[] = [];
    for (const [code, name] of Object.entries(PRICE_AREAS)) {
      const f = { alue_43_20260625: code };
      const s = (content: string, id: string, label: string, unit: string) => {
        const out = pxSeries(res, { ...f, contentscode: content }, { id, label, unit, freq: 'M' });
        out.data = trimNulls(out.data);
        return out;
      };
      series.push(
        s(
          'ashivm_indeksi_vmuutos_2025',
          `prices.yoy.${code}`,
          `Vanhojen osakeasuntojen hinnat, vuosimuutos – ${name}`,
          '%',
        ),
        s('ashivm_realindeksi_vmuutos_2025', `prices.real_yoy.${code}`, `Reaalihinnat, vuosimuutos – ${name}`, '%'),
        s('ashivm_keskineliohinta', `prices.sqm.${code}`, `Keskimääräinen neliöhinta – ${name}`, '€/m²'),
        s('ashivm_kauppamaara_kvkl', `prices.sales.${code}`, `Kaupat kiinteistönvälittäjien kautta – ${name}`, 'kpl'),
        s('ashivm_myyntiaika', `prices.selltime.${code}`, `Keskimääräinen myyntiaika – ${name}`, 'päivää'),
      );
    }
    return { series };
  });

  await b.group('priceindex', async () => {
    // Chained quarterly index; the 2000 = 100 version has the longest history. Rebased so that
    // the 2015 average is 100, and an annual change computed from it for a long y/y history.
    const res = await pxQuery('ashi/15it', {
      alue_43_20260625: Object.keys(PRICE_AREAS),
      talotyyppi_5_20111209: ['0'],
      huoneluku_1_20111212: ['00'],
      timeperiod_q: 'all',
      contentscode: ['ashivq_indeksi_2000', 'ashivq_realindeksi_2000'],
    });
    const series: Series[] = [];
    for (const [code, name] of Object.entries(PRICE_AREAS)) {
      for (const [content, kind] of [
        ['ashivq_indeksi_2000', 'nominal'],
        ['ashivq_realindeksi_2000', 'real'],
      ] as const) {
        const s = pxSeries(
          res,
          { alue_43_20260625: code, contentscode: content },
          { id: `priceindex.${kind}.${code}`, label: name, unit: 'indeksi 2015 = 100', freq: 'Q' },
        );
        const base = s.data.filter(([p, v]) => p.startsWith('2015') && v !== null).map(([, v]) => v as number);
        if (base.length !== 4) throw new Error(`priceindex ${code}: 2015 base quarters missing`);
        const avg = base.reduce((a, v) => a + v, 0) / 4;
        const rebased = s.data.map(([p, v]): Point => [p, v === null ? null : (v / avg) * 100]);
        s.data = round(trimNulls(since(rebased, '2005-Q1')), 1);
        series.push(s);
        if (kind === 'nominal') {
          series.push({
            ...s,
            id: `priceindex.yoy.${code}`,
            label: name,
            unit: '%',
            data: round(trimNulls(since(pctChange(rebased, 'Q', 4), '2006-Q1')), 1),
          });
        }
      }
    }
    return { series };
  });

  await b.group('regions', async () => {
    const res = await pxQuery('ashi/15is', {
      alue_43_20260625: REGIONS,
      talotyyppi_5_20111209: ['0'],
      huoneluku_1_20111212: ['00'],
      timeperiod_q: { top: 1 },
      contentscode: ['ashivq_keskineliohinta', 'ashivq_indeksi_vmuutos_2025', 'ashivq_kauppamaara_vvero'],
    });
    const period = Object.keys(res.labels.timeperiod_q)[0];
    const table: CategoryTable = {
      id: 'regions.sqm',
      label: 'Vanhojen osakeasuntojen neliöhinnat maakunnittain',
      unit: '€/m²',
      period: period.replace('Q', '-Q'),
      source: pxSource(res),
      columns: {
        sqm: 'Neliöhinta, €/m²',
        yoy: 'Hintojen vuosimuutos, %',
        sales: 'Kaupat (varainsiirtovero), kpl',
      },
      rows: REGIONS.map((code) => {
        const f = { alue_43_20260625: code };
        return {
          key: code,
          label: res.labels.alue_43_20260625[code].replace(/^MK\d+\s+/, ''),
          values: {
            sqm: pxValue(res, { ...f, contentscode: 'ashivq_keskineliohinta' }),
            yoy: pxValue(res, { ...f, contentscode: 'ashivq_indeksi_vmuutos_2025' }),
            sales: pxValue(res, { ...f, contentscode: 'ashivq_kauppamaara_vvero' }),
          },
        };
      }),
    };
    return { tables: [table] };
  });

  await b.group('rents', async () => {
    const res = await pxQuery('asvu/15fa', {
      rahoitus_2_20260101: ['1'],
      huoneluku_5_20260101: ['SSS'],
      alue_44_20260101: RENT_AREAS,
      timeperiod_q: 'all',
      contentscode: ['asvu_keskineliovuokra', 'asvu2025_vm'],
    });
    const quarters = Object.keys(res.labels.timeperiod_q).sort();
    const latest = quarters[quarters.length - 1];
    const table: CategoryTable = {
      id: 'rents.free_market',
      label: 'Vapaarahoitteisten vuokra-asuntojen keskineliövuokrat',
      unit: '€/m²/kk',
      period: latest.replace('Q', '-Q'),
      source: pxSource(res),
      columns: { rent: 'Keskineliövuokra, €/m²/kk', yoy: 'Vuosimuutos, %' },
      rows: RENT_AREAS.map((code) => {
        const f = { alue_44_20260101: code, timeperiod_q: latest };
        return {
          key: code,
          label: res.labels.alue_44_20260101[code].replace(/\s*\(.*\)$/, ''),
          values: {
            rent: pxValue(res, { ...f, contentscode: 'asvu_keskineliovuokra' }),
            yoy: pxValue(res, { ...f, contentscode: 'asvu2025_vm' }),
          },
        };
      }),
    };
    const yoy = pxSeries(
      res,
      { alue_44_20260101: 'SSS', contentscode: 'asvu2025_vm' },
      { id: 'rents.yoy', label: 'Vapaarahoitteiset vuokrat, vuosimuutos – koko maa', unit: '%', freq: 'Q' },
    );
    yoy.data = trimNulls(yoy.data);
    return { tables: [table], series: [yoy] };
  });

  await b.group('construction', async () => {
    const res = await pxQuery('raku/156f', {
      rakennusvaihe_1_20250101: ['1', '2', '3'],
      alue_23_20260101: ['SSS'],
      timeperiod_m: 'all',
      rakennus_6_20180101: ['SSS'],
      contentscode: ['raku-uusiAsuntoLkm_lvs'],
    });
    const stage: Record<string, [string, string]> = {
      '1': ['permits', 'Rakennusluvat'],
      '2': ['starts', 'Aloitetut'],
      '3': ['completions', 'Valmistuneet'],
    };
    const series = Object.entries(stage).map(([code, [id, label]]) => {
      const s = pxSeries(
        res,
        { rakennusvaihe_1_20250101: code },
        { id: `construction.${id}`, label: `${label} uudet asunnot, 12 kk liukuva summa`, unit: 'asuntoa', freq: 'M' },
      );
      s.data = trimNulls(since(s.data, '2000-01'));
      return s;
    });
    return { series };
  });

  await b.group('costs', async () => {
    const res = await pxQuery('rki/13g8', {
      timeperiod_m: 'all',
      perusv_1_20180101: ['2005_100'],
      contentscode: ['rki-vuosimuutos'],
    });
    const s = pxSeries(
      res,
      { contentscode: 'rki-vuosimuutos' },
      { id: 'costs.building_yoy', label: 'Rakennuskustannusindeksi, vuosimuutos', unit: '%', freq: 'M' },
    );
    s.data = trimNulls(since(s.data, '2006-01'));
    return { series: [s] };
  });

  await b.group('mortgages', async () => {
    const rate = await ecbSeries('MIR', 'M.FI.B.A2C.A.R.A.2250.EUR.N', {
      id: 'mortgages.rate',
      label: 'Uusien asuntolainojen keskikorko',
      unit: '%',
      freq: 'M',
      start: '2005-01',
    });
    const volume = await ecbSeries('MIR', 'M.FI.B.A2C.A.B.A.2250.EUR.P', {
      id: 'mortgages.new_volume',
      label: 'Uudet asuntolainat (pl. uudelleenneuvotellut)',
      unit: 'milj. €',
      freq: 'M',
      start: '2014-01',
    });
    const euribor12 = await ecbSeries('FM', 'M.U2.EUR.RT.MM.EURIBOR1YD_.HSTA', {
      id: 'mortgages.euribor12m',
      label: '12 kk Euribor',
      unit: '%',
      freq: 'M',
      start: '2005-01',
    });
    for (const s of [rate, volume, euribor12]) s.data = round(trimNulls(s.data), 3);
    for (const s of [rate, volume]) s.source.name = 'Suomen Pankki / EKP';
    return { series: [rate, volume, euribor12] };
  });
}
