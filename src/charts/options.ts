// ECharts option builders. Every chart shares the same chrome: hairline solid grid, muted
// axes, 2px lines, ≤24px bars with 4px rounded data ends, one y-axis, and a crosshair
// tooltip that lists every series with the value first.

import type { EChartsCoreOption } from 'echarts/core';
import type { OptionFn } from '../components/EChart.tsx';
import type { CategoryTable, Freq, Series } from '../../shared/types.ts';
import type { Tokens } from '../lib/theme.ts';
import { fmt, fmtUnit, periodToTime, timeLabel } from '../lib/format.ts';

export interface Ctx {
  t: Tokens;
  /** Earliest timestamp to show on time axes. */
  rangeStart: number;
}

export interface Line {
  series: Series | undefined;
  /** Legend / tooltip name (defaults to the series label). */
  name?: string;
  color: string;
  kind?: 'line' | 'bar' | 'step';
}

interface TimeOpts {
  unit: string;
  decimals?: number;
  /**
   * Latest value at the end of the line: 'first' labels only the first (headline) series,
   * 'all' every line – use 'all' only when the lines stay well apart.
   */
  endLabels?: 'first' | 'all';
  /** Force zero into the y range (bars always include zero). */
  includeZero?: boolean;
  stacked?: boolean;
  /** Horizontal reference line, e.g. the ECB 2 % inflation target. */
  reference?: { value: number; label: string };
}

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Map projection: shrink longitudes ≈ cos(64°N) so Finland is not stretched sideways. */
const MAP_ASPECT_SCALE = 0.5;
/** Height/width of Finland's bounding box after the aspect correction (lat 59.7–70.1, lon 19–31.6). */
const MAP_HEIGHT_RATIO = 10.4 / (12.6 * MAP_ASPECT_SCALE);

const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

function baseText(t: Tokens) {
  return { fontFamily: FONT, color: t.ink2, fontSize: 12 };
}

function tooltipBase(t: Tokens) {
  return {
    backgroundColor: t.surfaceRaised,
    borderColor: t.border,
    borderWidth: 1,
    padding: [8, 10],
    textStyle: { ...baseText(t), color: t.ink },
    extraCssText: 'box-shadow: 0 4px 16px rgba(0,0,0,0.18); border-radius: 8px;',
    confine: true,
  };
}

function tooltipRow(color: string, value: string, name: string, kind: 'line' | 'box' = 'line') {
  const key =
    kind === 'line'
      ? `<span style="display:inline-block;width:12px;height:2px;border-radius:1px;background:${color};vertical-align:middle;margin-right:8px"></span>`
      : `<span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:${color};vertical-align:middle;margin-right:8px"></span>`;
  return `<div style="display:flex;align-items:center;gap:0;line-height:1.6">${key}<b style="font-variant-numeric:tabular-nums;margin-right:8px">${esc(value)}</b><span style="opacity:.75">${esc(name)}</span></div>`;
}

function inRange(s: Series | undefined, start: number): [number, number | null][] {
  if (!s) return [];
  return s.data.map(([p, v]) => [periodToTime(p), v] as [number, number | null]).filter(([x]) => x >= start);
}

function axisLabelFormatter(unit: string, decimals: number) {
  return (v: number) => {
    const d = Number.isInteger(v) ? 0 : decimals;
    const n = fmt(v, d);
    return unit === '%' ? `${n} %` : n;
  };
}

/** Line / bar chart over time, one shared y-axis. */
export function timeChart(ctx: Ctx, lines: Line[], opts: TimeOpts): EChartsCoreOption {
  const { t } = ctx;
  const decimals = opts.decimals ?? 1;
  const present = lines.filter((l) => l.series);
  const firstData = Math.min(...present.map((l) => periodToTime(l.series!.data[0][0])));
  const start = Math.max(ctx.rangeStart, firstData);
  const freqOf = new Map(present.map((l) => [l.name ?? l.series!.label, l.series!.freq] as [string, Freq]));
  const hasBars = present.some((l) => l.kind === 'bar');
  const showLegend = present.length > 1;

  const series = present.map((l, idx) => {
    const name = l.name ?? l.series!.label;
    const endLabel = opts.endLabels === 'all' || (opts.endLabels === 'first' && idx === 0);
    const data = inRange(l.series, start);
    if (l.kind === 'bar') {
      return {
        type: 'bar',
        name,
        stack: opts.stacked ? 'total' : undefined,
        barMaxWidth: 18,
        barCategoryGap: '20%',
        itemStyle: { color: l.color },
        emphasis: { focus: 'none', itemStyle: { opacity: 0.85 } },
        data: data.map(([x, v]) => ({
          value: [x, v],
          itemStyle: { borderRadius: v !== null && v < 0 ? [0, 0, 3, 3] : [3, 3, 0, 0] },
        })),
      };
    }
    return {
      type: 'line',
      name,
      step: l.kind === 'step' ? 'end' : undefined,
      showSymbol: false,
      symbolSize: 8,
      connectNulls: false,
      lineStyle: { width: 2, color: l.color, cap: 'round', join: 'round' },
      itemStyle: { color: l.color, borderColor: t.surface, borderWidth: 2 },
      emphasis: { focus: 'none', scale: false },
      endLabel: endLabel
        ? {
            show: true,
            color: t.ink,
            fontFamily: FONT,
            fontSize: 12,
            fontWeight: 600,
            distance: 6,
            formatter: (p: { value: [number, number | null] }) => fmt(p.value[1], decimals),
          }
        : undefined,
      data,
      markLine: undefined as unknown,
    };
  });

  // Zero baseline and optional reference line ride on the first series.
  const nums = present
    .flatMap((l) => inRange(l.series, start).map(([, v]) => v))
    .filter((v): v is number => v !== null);
  const crossesZero = nums.some((v) => v < 0) && nums.some((v) => v > 0);
  const marks: object[] = [];
  if (crossesZero || hasBars)
    marks.push({ yAxis: 0, lineStyle: { color: t.axis, width: 1, type: 'solid' }, label: { show: false } });
  if (opts.reference)
    marks.push({
      yAxis: opts.reference.value,
      lineStyle: { color: t.muted, width: 1, type: 'solid' },
      label: {
        show: true,
        position: 'insideStartTop',
        formatter: opts.reference.label,
        color: t.muted,
        fontFamily: FONT,
        fontSize: 11,
      },
    });
  if (marks.length && series[0]) {
    (series[0] as { markLine: unknown }).markLine = { silent: true, symbol: 'none', animation: false, data: marks };
  }

  return {
    animation: false,
    textStyle: baseText(t),
    // Long legends (stacked compositions) may wrap to a second row.
    grid: {
      left: 4,
      right: opts.endLabels ? 44 : 12,
      top: !showLegend ? 12 : present.length > 4 ? 58 : 34,
      bottom: 4,
      containLabel: true,
    },
    legend: showLegend
      ? {
          top: 0,
          left: 0,
          itemGap: 16,
          itemWidth: 14,
          itemHeight: 8,
          textStyle: { ...baseText(t), color: t.ink2 },
          inactiveColor: t.axis,
          // Series carry a surface-coloured ring for their markers; keep it off the legend keys.
          itemStyle: { borderWidth: 0 },
          data: present.map((l) => ({
            name: l.name ?? l.series!.label,
            icon: l.kind === 'bar' ? 'roundRect' : 'path://M0,3 L14,3 L14,5 L0,5 Z',
          })),
        }
      : undefined,
    tooltip: {
      ...tooltipBase(t),
      trigger: 'axis',
      axisPointer: { type: 'line', lineStyle: { color: t.muted, width: 1, type: 'solid' }, label: { show: false } },
      formatter: (params: { seriesName: string; color: string; value: [number, number | null] }[]) => {
        if (!params.length) return '';
        const head = timeLabel(params[0].value[0], freqOf.get(params[0].seriesName) ?? 'M');
        const rows = params
          .filter((p) => p.value[1] !== null && p.value[1] !== undefined)
          .map((p) => tooltipRow(p.color, fmtUnit(p.value[1], opts.unit, decimals), p.seriesName));
        if (opts.stacked) {
          const total = params.reduce((a, p) => a + (p.value[1] ?? 0), 0);
          rows.push(
            `<div style="border-top:1px solid ${t.grid};margin-top:4px;padding-top:4px">${tooltipRow('transparent', fmtUnit(total, opts.unit, decimals), 'Yhteensä')}</div>`,
          );
        }
        return `<div style="font-weight:600;margin-bottom:4px">${esc(head)}</div>${rows.join('')}`;
      },
    },
    xAxis: {
      type: 'time',
      min: start,
      axisLine: { lineStyle: { color: t.axis } },
      axisTick: { show: false },
      splitLine: { show: false },
      axisLabel: {
        color: t.muted,
        fontFamily: FONT,
        hideOverlap: true,
        formatter: { year: '{yyyy}', month: '{M}/{yyyy}', day: '{d}.{M}.' },
      },
    },
    yAxis: {
      type: 'value',
      scale: !(opts.includeZero || hasBars),
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: t.grid, width: 1, type: 'solid' } },
      axisLabel: { color: t.muted, fontFamily: FONT, formatter: axisLabelFormatter(opts.unit, decimals) },
    },
    series,
  };
}

/** Stacked area over time (composition of a total), separated by 2px surface-coloured gaps. */
export function stackedAreaChart(
  ctx: Ctx,
  lines: Line[],
  opts: { unit: string; decimals?: number },
): EChartsCoreOption {
  const base = timeChart(ctx, lines, { ...opts, includeZero: true, stacked: true }) as {
    series: Record<string, unknown>[];
    legend: Record<string, unknown>;
  } & EChartsCoreOption;
  base.series = base.series.map((s, i) => ({
    ...s,
    stack: 'total',
    lineStyle: { width: 1.5, color: ctx.t.surface },
    areaStyle: { color: lines[i].color, opacity: 0.9 },
    markLine: undefined,
  }));
  if (base.legend) {
    base.legend.data = lines.map((l) => ({ name: l.name ?? l.series?.label, icon: 'roundRect' }));
  }
  return base;
}

/** Horizontal bars for one column of a category table, largest first. */
export function barList(
  ctx: Ctx,
  table: CategoryTable | undefined,
  opts: {
    column: string;
    unit: string;
    decimals?: number;
    /** Extra columns shown in the tooltip: column id → unit. */
    extra?: Record<string, string>;
    /** Row keys drawn in the neutral colour (aggregates such as "Koko maa"). */
    muted?: string[];
    sort?: boolean;
    color?: string;
  },
): EChartsCoreOption {
  const { t } = ctx;
  if (!table) return {};
  const decimals = opts.decimals ?? 1;
  const rows = [...table.rows].filter((r) => r.values[opts.column] !== null);
  if (opts.sort !== false) rows.sort((a, b) => (b.values[opts.column] ?? 0) - (a.values[opts.column] ?? 0));
  const muted = new Set(opts.muted ?? []);
  const color = opts.color ?? t.series[0];

  return {
    animation: false,
    textStyle: baseText(t),
    grid: { left: 4, right: 64, top: 4, bottom: 4, containLabel: true },
    tooltip: {
      ...tooltipBase(t),
      trigger: 'item',
      formatter: (p: { dataIndex: number }) => {
        const r = rows[p.dataIndex];
        const lines = [
          tooltipRow(
            muted.has(r.key) ? t.other : color,
            fmtUnit(r.values[opts.column], opts.unit, decimals),
            table.columns[opts.column],
            'box',
          ),
          ...Object.entries(opts.extra ?? {}).map(([col, unit]) =>
            tooltipRow('transparent', fmtUnit(r.values[col], unit, 1, unit === '%'), table.columns[col]),
          ),
        ];
        return `<div style="font-weight:600;margin-bottom:4px">${esc(r.label)}</div>${lines.join('')}`;
      },
    },
    xAxis: {
      type: 'value',
      // Leave room beyond negative bars for their value labels.
      min: (e: { min: number; max: number }) =>
        e.min < 0 ? niceFloor(e.min - (Math.max(e.max, 0) - e.min) * 0.15, e.max - e.min) : 0,
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: t.grid, width: 1 } },
      axisLabel: {
        color: t.muted,
        fontFamily: FONT,
        hideOverlap: true,
        formatter: axisLabelFormatter(opts.unit, decimals),
      },
    },
    yAxis: {
      type: 'category',
      inverse: true,
      data: rows.map((r) => r.label),
      axisLine: { lineStyle: { color: t.axis } },
      axisTick: { show: false },
      axisLabel: { color: t.ink2, fontFamily: FONT, fontSize: 12 },
    },
    series: [
      {
        type: 'bar',
        barMaxWidth: 16,
        barCategoryGap: '30%',
        emphasis: { focus: 'none', itemStyle: { opacity: 0.85 } },
        label: {
          show: true,
          position: 'right',
          color: t.ink2,
          fontFamily: FONT,
          fontSize: 11,
          formatter: (p: { value: number }) => fmt(p.value, decimals),
        },
        data: rows.map((r) => {
          const v = r.values[opts.column] as number;
          return {
            value: v,
            label: { position: v < 0 ? 'left' : 'right' },
            itemStyle: {
              color: muted.has(r.key) ? t.other : color,
              borderRadius: v < 0 ? [3, 0, 0, 3] : [0, 3, 3, 0],
            },
          };
        }),
      },
    ],
  };
}

/** Choropleth of a category table on a registered map. */
export function choropleth(
  ctx: Ctx,
  table: CategoryTable | undefined,
  opts: { map: string; column: string; unit: string; decimals?: number; extra?: Record<string, string> },
): OptionFn {
  const { t } = ctx;
  if (!table) return () => ({});
  const vals = table.rows.map((r) => r.values[opts.column]).filter((v): v is number => v !== null);
  const byName = new Map(table.rows.map((r) => [r.label, r]));
  const lo = Math.floor(Math.min(...vals) / 100) * 100;
  const hi = Math.ceil(Math.max(...vals) / 100) * 100;
  return ({ width, height }) => {
    // Keep the map's proportions: fit its height/width ratio into the space right of the scale.
    const left = 72;
    const availW = Math.max(width - left - 8, 50);
    const availH = Math.max(height - 16, 50);
    const mapH = Math.min(availH, availW * MAP_HEIGHT_RATIO);
    return {
      animation: false,
      textStyle: baseText(t),
      tooltip: {
        ...tooltipBase(t),
        trigger: 'item',
        formatter: (p: { name: string }) => {
          const r = byName.get(p.name);
          if (!r) return `<div style="font-weight:600">${esc(p.name)}</div><div style="opacity:.75">Ei tietoa</div>`;
          const rows = [
            tooltipRow(
              'transparent',
              fmtUnit(r.values[opts.column], opts.unit, opts.decimals ?? 0),
              table.columns[opts.column],
            ),
            ...Object.entries(opts.extra ?? {}).map(([col, unit]) =>
              tooltipRow(
                'transparent',
                fmtUnit(r.values[col], unit, unit === '%' ? 1 : 0, unit === '%'),
                table.columns[col],
              ),
            ),
          ];
          return `<div style="font-weight:600;margin-bottom:4px">${esc(r.label)}</div>${rows.join('')}`;
        },
      },
      visualMap: {
        type: 'continuous',
        min: lo,
        max: hi,
        inRange: { color: t.sequential },
        orient: 'vertical',
        left: 4,
        bottom: 8,
        itemHeight: 120,
        itemWidth: 10,
        calculable: false,
        text: [fmtUnit(Math.max(...vals), opts.unit, 0), fmtUnit(Math.min(...vals), opts.unit, 0)],
        textStyle: { color: t.ink2, fontFamily: FONT, fontSize: 11 },
        formatter: (v: number) => fmt(v, 0),
      },
      series: [
        {
          type: 'map',
          map: opts.map,
          roam: false,
          layoutCenter: [left + availW / 2, height / 2],
          layoutSize: mapH,
          aspectScale: MAP_ASPECT_SCALE,
          selectedMode: false,
          itemStyle: { borderColor: t.surface, borderWidth: 1, areaColor: t.grid },
          emphasis: {
            label: {
              show: true,
              color: t.ink,
              fontFamily: FONT,
              fontWeight: 600,
              textBorderColor: t.surface,
              textBorderWidth: 3,
            },
            itemStyle: { borderColor: t.ink, borderWidth: 1.5 },
          },
          label: { show: false },
          // Hover keeps the region's own fill (ECharts would otherwise paint it yellow).
          data: table.rows.map((r) => {
            const v = r.values[opts.column];
            return {
              name: r.label,
              value: v,
              emphasis: {
                itemStyle: { areaColor: v === null ? t.grid : rampColor(t.sequential, (v - lo) / (hi - lo || 1)) },
              },
            };
          }),
        },
      ],
    };
  };
}

/** Linear interpolation along a colour ramp (same mapping as a continuous visualMap). */
function rampColor(ramp: string[], f: number): string {
  const x = Math.min(1, Math.max(0, f)) * (ramp.length - 1);
  const i = Math.min(ramp.length - 2, Math.floor(x));
  const k = x - i;
  const a = hexRgb(ramp[i]);
  const b = hexRgb(ramp[i + 1]);
  const mix = a.map((c, j) => Math.round(c + (b[j] - c) * k));
  return `rgb(${mix.join(',')})`;
}

function hexRgb(hex: string): number[] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Round down to a tidy axis value relative to the data range. */
function niceFloor(v: number, range: number): number {
  const step = 10 ** Math.floor(Math.log10(Math.max(range, 1e-9))) / 2;
  return Math.floor(v / step) * step;
}
