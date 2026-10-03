import type { Series } from '../../shared/types.ts';
import { latest, lastN, previous } from '../lib/data.ts';
import { fmtParts, fmtUnit, periodLong } from '../lib/format.ts';

export type Good = 'up' | 'down' | 'neutral';

interface Props {
  label: string;
  series: Series | undefined;
  /** Decimals for the value. */
  decimals?: number;
  /**
   * How to describe the change: 'diff' = difference vs the comparison period in the series'
   * own unit (percentage points for rates), 'pct' = percent change.
   */
  change?: 'diff' | 'pct' | 'none';
  /** Compare with this many observations earlier (default: one year earlier). */
  lag?: number;
  /** Text for the comparison period, e.g. "vuodentakaisesta". */
  lagLabel?: string;
  good?: Good;
  /** Override for the displayed value (e.g. a country name). */
  valueText?: string;
  /** Qualifier shown after the label, e.g. "koko maa". */
  note?: string;
  /** Text for the change row when there is no change to show. */
  detail?: string;
  /** Override for the period line (when there is no series). */
  periodText?: string;
  sparkPoints?: number;
}

const PER_YEAR = { M: 12, Q: 4, A: 1, D: 365 } as const;

export function KpiTile({
  label,
  series,
  decimals = 1,
  change = 'diff',
  lag,
  lagLabel,
  good = 'neutral',
  valueText,
  note,
  detail,
  periodText,
  sparkPoints = 36,
}: Props) {
  const last = latest(series);
  const effLag = lag ?? (series ? PER_YEAR[series.freq] : 12);
  const prev = previous(series, effLag);
  const value = last?.[1] ?? null;
  const prevValue = prev?.[1] ?? null;

  let delta: number | null = null;
  if (value !== null && prevValue !== null && change !== 'none') {
    delta = change === 'pct' ? (prevValue !== 0 ? (value / prevValue - 1) * 100 : null) : value - prevValue;
  }
  const deltaUnit = change === 'pct' ? '%' : series?.unit === '%' ? '%-yks.' : (series?.unit ?? '');
  const tone =
    delta === null || Math.abs(delta) < 1e-9 || good === 'neutral'
      ? 'neutral'
      : delta > 0 === (good === 'up')
        ? 'good'
        : 'bad';
  const arrow = delta === null || Math.abs(delta) < 1e-9 ? '→' : delta > 0 ? '▲' : '▼';
  const comparison = lagLabel ?? (effLag === (series ? PER_YEAR[series.freq] : 12) ? 'vuodessa' : 'edellisestä');
  const parts = valueText !== undefined ? { num: valueText, unit: '' } : fmtParts(value, series?.unit ?? '', decimals);

  return (
    <div className="card kpi" title={series ? `${series.label}\nLähde: ${series.source.name}` : undefined}>
      <div className="kpi-label">
        {label}
        {note && <span className="muted"> · {note}</span>}
      </div>
      <div className="kpi-value">
        {parts.num}
        {parts.unit && <span className="kpi-unit">{parts.unit}</span>}
      </div>
      <div className="kpi-meta">
        {delta !== null ? (
          <span className={`delta ${tone}`}>
            <span aria-hidden="true">{arrow}</span> {fmtUnit(delta, deltaUnit, decimals, true)}{' '}
            <span className="muted">{comparison}</span>
          </span>
        ) : (
          detail && <span className="muted">{detail}</span>
        )}
      </div>
      <div className="kpi-foot">
        <span className="muted">{periodText ?? (last ? periodLong(last[0]) : 'ei tietoa')}</span>
        {series && <Sparkline values={lastN(series, sparkPoints)} />}
      </div>
    </div>
  );
}

/** Minimal trend line: de-emphasised stroke, current value marked with the accent. */
function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const w = 72;
  const h = 26;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * (w - 6) + 1, h - 3 - ((v - min) / span) * (h - 6)]);
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const [lx, ly] = pts[pts.length - 1];
  return (
    <svg className="spark" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <path d={d} fill="none" stroke="var(--muted)" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lx} cy={ly} r="3.5" fill="var(--accent)" stroke="var(--surface)" strokeWidth="1.5" />
    </svg>
  );
}
