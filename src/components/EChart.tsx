import { useEffect, useRef, useState } from 'react';
import * as echarts from 'echarts/core';
import { BarChart, LineChart, MapChart, TreemapChart } from 'echarts/charts';
import {
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  TooltipComponent,
  VisualMapComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { EChartsCoreOption } from 'echarts/core';

echarts.use([
  BarChart,
  LineChart,
  MapChart,
  TreemapChart,
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  TooltipComponent,
  VisualMapComponent,
  CanvasRenderer,
]);

export { echarts };

export type OptionFn = (size: { width: number; height: number }) => EChartsCoreOption;

interface Props {
  /** A fixed option, or one computed from the chart's pixel size (e.g. map layout). */
  option: EChartsCoreOption | OptionFn;
  /** Accessible description of what the chart shows. */
  label: string;
}

/** Thin wrapper: one ECharts instance per element, resized with its container. */
export function EChart({ option, label }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const chart = useRef<echarts.ECharts | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    const inst = echarts.init(el, undefined, { renderer: 'canvas' });
    chart.current = inst;
    const ro = new ResizeObserver(() => {
      inst.resize();
      setSize((prev) =>
        prev.width === el.clientWidth && prev.height === el.clientHeight
          ? prev
          : { width: el.clientWidth, height: el.clientHeight },
      );
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      inst.dispose();
      chart.current = null;
    };
  }, []);

  const sizeKey = typeof option === 'function' ? `${size.width}x${size.height}` : '';
  useEffect(() => {
    if (!chart.current) return;
    if (typeof option === 'function') {
      if (size.width === 0 || size.height === 0) return;
      chart.current.setOption(option(size), { notMerge: true });
    } else {
      chart.current.setOption(option, { notMerge: true });
    }
    // `size` is read through sizeKey so fixed options do not re-render on every resize.
  }, [option, sizeKey]);

  return <div ref={ref} className="echart" role="img" aria-label={label} />;
}
