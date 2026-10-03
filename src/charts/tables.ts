import type { CategoryTable, Series } from '../../shared/types.ts';
import type { TableView } from '../components/ChartCard.tsx';
import { fmt, periodShort } from '../lib/format.ts';

/** Table twin for time-series charts: newest periods first. */
export function seriesTable(
  lines: { series: Series | undefined; name?: string }[],
  opts: { rows?: number; decimals?: number } = {},
): TableView {
  const present = lines.filter((l) => l.series);
  const periods = [...new Set(present.flatMap((l) => l.series!.data.map(([p]) => p)))].sort().reverse();
  const maps = present.map((l) => new Map(l.series!.data));
  return {
    columns: ['Ajanjakso', ...present.map((l) => `${l.name ?? l.series!.label} (${l.series!.unit})`)],
    rows: periods
      .slice(0, opts.rows ?? 36)
      .map((p) => [periodShort(p), ...maps.map((m) => fmt(m.get(p) ?? null, opts.decimals ?? 1))]),
  };
}

/** Table twin for category charts. */
export function categoryTable(
  t: CategoryTable | undefined,
  decimals: Record<string, number> = {},
): TableView | undefined {
  if (!t) return undefined;
  const cols = Object.keys(t.columns);
  return {
    columns: ['', ...cols.map((c) => t.columns[c])],
    rows: t.rows.map((r) => [r.label, ...cols.map((c) => fmt(r.values[c], decimals[c] ?? 1))]),
  };
}
