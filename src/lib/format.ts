import type { Freq } from '../../shared/types.ts';

const MONTHS = [
  'tammikuu',
  'helmikuu',
  'maaliskuu',
  'huhtikuu',
  'toukokuu',
  'kesäkuu',
  'heinäkuu',
  'elokuu',
  'syyskuu',
  'lokakuu',
  'marraskuu',
  'joulukuu',
];
const MONTHS_SHORT = [
  'tammi',
  'helmi',
  'maalis',
  'huhti',
  'touko',
  'kesä',
  'heinä',
  'elo',
  'syys',
  'loka',
  'marras',
  'joulu',
];

const nfCache = new Map<string, Intl.NumberFormat>();
function nf(min: number, max: number, signed = false) {
  const key = `${min}-${max}-${signed}`;
  let f = nfCache.get(key);
  if (!f) {
    f = new Intl.NumberFormat('fi-FI', {
      minimumFractionDigits: min,
      maximumFractionDigits: max,
      signDisplay: signed ? 'exceptZero' : 'auto',
    });
    nfCache.set(key, f);
  }
  return f;
}

/** Finnish number formatting: 1 234,5 and a real minus sign. */
export function fmt(v: number | null | undefined, decimals = 1, signed = false): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '–';
  // Avoid "−0,00" when a tiny negative value rounds to zero.
  const x = Math.abs(v) < 0.5 * 10 ** -decimals ? 0 : v;
  return nf(decimals, decimals, signed).format(x).replace('-', '−');
}

/** Compact euro amounts given in millions: 950 milj. €, 12,3 mrd. €. */
export function fmtMillions(v: number | null | undefined, signed = false): string {
  if (v === null || v === undefined) return '–';
  if (Math.abs(v) >= 1000) return `${fmt(v / 1000, 1, signed)} mrd. €`;
  return `${fmt(v, 0, signed)} milj. €`;
}

/** Number and unit separately, so the unit can be typeset smaller. */
export function fmtParts(v: number | null | undefined, unit: string, decimals = 1): { num: string; unit: string } {
  if (v === null || v === undefined) return { num: '–', unit: '' };
  if (unit === 'milj. €') {
    return Math.abs(v) >= 1000 ? { num: fmt(v / 1000, 1), unit: 'mrd. €' } : { num: fmt(v, 0), unit: 'milj. €' };
  }
  if (unit.startsWith('indeksi') || unit === 'saldoluku') return { num: fmt(v, decimals), unit: '' };
  return { num: fmt(v, decimals), unit };
}

export function fmtUnit(v: number | null | undefined, unit: string, decimals = 1, signed = false): string {
  if (unit === 'milj. €') return fmtMillions(v, signed);
  const n = fmt(v, decimals, signed);
  if (n === '–') return n;
  if (unit === '%') return `${n} %`;
  if (unit === '%-yks.') return `${n} %-yks.`;
  if (unit === 'indeksi' || unit.startsWith('indeksi') || unit === 'saldoluku') return n;
  return `${n} ${unit}`;
}

/** Period key → long Finnish label: "elokuu 2026", "2. neljännes 2026", "2026". */
export function periodLong(p: string): string {
  let m: RegExpMatchArray | null;
  if ((m = p.match(/^(\d{4})-(\d{2})$/))) return `${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
  if ((m = p.match(/^(\d{4})-Q(\d)$/))) return `${m[2]}. neljännes ${m[1]}`;
  if ((m = p.match(/^(\d{4})-(\d{2})-(\d{2})$/))) return `${Number(m[3])}.${Number(m[2])}.${m[1]}`;
  if ((m = p.match(/^(\d{4})-(\d{2})\.\.(\d{4})-(\d{2})$/)))
    return `${MONTHS_SHORT[Number(m[2]) - 1]}kuu ${m[1]} – ${MONTHS_SHORT[Number(m[4]) - 1]}kuu ${m[3]}`;
  return p;
}

/** Period key → short label: "8/2026", "Q2/2026". */
export function periodShort(p: string): string {
  let m: RegExpMatchArray | null;
  if ((m = p.match(/^(\d{4})-(\d{2})$/))) return `${Number(m[2])}/${m[1]}`;
  if ((m = p.match(/^(\d{4})-Q(\d)$/))) return `Q${m[2]}/${m[1]}`;
  return p;
}

/** Period key → timestamp at the middle of the period, so mixed frequencies line up. */
export function periodToTime(p: string): number {
  let m: RegExpMatchArray | null;
  if ((m = p.match(/^(\d{4})-(\d{2})$/))) return Date.UTC(Number(m[1]), Number(m[2]) - 1, 15);
  if ((m = p.match(/^(\d{4})-Q(\d)$/))) return Date.UTC(Number(m[1]), (Number(m[2]) - 1) * 3 + 1, 15);
  if ((m = p.match(/^(\d{4})-(\d{2})-(\d{2})$/))) return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if ((m = p.match(/^(\d{4})$/))) return Date.UTC(Number(m[1]), 6, 1);
  return NaN;
}

/** Timestamp → label for a point of the given frequency (used in tooltips). */
export function timeLabel(t: number, freq: Freq): string {
  const d = new Date(t);
  const y = d.getUTCFullYear();
  if (freq === 'Q') return `${Math.floor(d.getUTCMonth() / 3) + 1}. neljännes ${y}`;
  if (freq === 'A') return String(y);
  if (freq === 'D') return `${d.getUTCDate()}.${d.getUTCMonth() + 1}.${y}`;
  return `${MONTHS[d.getUTCMonth()]} ${y}`;
}

export function dateTime(iso: string | undefined): string {
  if (!iso) return '–';
  const d = new Date(iso);
  return d.toLocaleString('fi-FI', {
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Helsinki',
  });
}

export function dateOnly(iso: string | undefined): string {
  if (!iso) return '–';
  return new Date(iso).toLocaleDateString('fi-FI', {
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
    timeZone: 'Europe/Helsinki',
  });
}
