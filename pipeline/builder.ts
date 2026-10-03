import { existsSync, readFileSync } from 'node:fs';
import type { CategoryTable, FetchError, Series, TabData } from '../shared/types.ts';

export interface GroupResult {
  series?: Series[];
  tables?: CategoryTable[];
}

/**
 * Collects the series and tables of one dashboard tab. Each group of items is fetched
 * independently; if a group fails, the previous values of every item whose id starts with
 * "<group>." are carried over from the last published file, and the error is recorded so
 * the UI can flag it. One flaky API therefore never blanks the dashboard.
 */
export class TabBuilder {
  private readonly prev?: TabData;
  private readonly data: TabData;

  constructor(
    tab: string,
    readonly file: string,
  ) {
    if (existsSync(file)) {
      try {
        this.prev = JSON.parse(readFileSync(file, 'utf8')) as TabData;
      } catch {
        // Corrupt previous file: start from scratch.
      }
    }
    this.data = { tab, generated: new Date().toISOString(), series: {}, tables: {}, errors: [] };
  }

  async group(name: string, fn: () => Promise<GroupResult>): Promise<void> {
    const t0 = Date.now();
    try {
      const res = await fn();
      for (const s of res.series ?? []) this.add('series', name, s);
      for (const t of res.tables ?? []) this.add('tables', name, t);
      console.log(`  ✓ ${name} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.warn(`  ✗ ${name}: ${message}`);
      this.data.errors.push({ id: name, message } satisfies FetchError);
      const keep = (id: string) => id.startsWith(`${name}.`);
      for (const [id, s] of Object.entries(this.prev?.series ?? {})) if (keep(id)) this.data.series[id] = s;
      for (const [id, t] of Object.entries(this.prev?.tables ?? {})) if (keep(id)) this.data.tables[id] = t;
    }
  }

  private add(kind: 'series' | 'tables', group: string, item: Series | CategoryTable) {
    if (!item.id.startsWith(`${group}.`)) throw new Error(`Item id "${item.id}" must start with "${group}."`);
    if (kind === 'series') {
      const s = item as Series;
      if (!s.data.some(([, v]) => v !== null)) throw new Error(`Series ${s.id} has no values`);
      this.data.series[s.id] = s;
    } else {
      this.data.tables[item.id] = item as CategoryTable;
    }
  }

  result(): TabData {
    return this.data;
  }
}
