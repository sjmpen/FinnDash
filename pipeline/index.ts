// Fetches every dashboard data set and writes public/data/<tab>.json.
// Usage: npm run data            (all tabs)
//        npm run data -- trade   (only the named tabs)

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { TabData } from '../shared/types.ts';
import { TabBuilder } from './builder.ts';
import { buildOverview } from './tabs/overview.ts';
import { buildHousing } from './tabs/housing.ts';
import { buildTrade } from './tabs/trade.ts';
import { buildStocks } from './tabs/stocks.ts';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'data');

const TABS: Record<string, (b: TabBuilder) => Promise<void>> = {
  overview: buildOverview,
  housing: buildHousing,
  trade: buildTrade,
  stocks: buildStocks,
};

async function main() {
  const wanted = process.argv.slice(2);
  const names = wanted.length ? wanted : Object.keys(TABS);
  mkdirSync(OUT_DIR, { recursive: true });

  let failures = 0;
  let total = 0;
  for (const name of names) {
    const build = TABS[name];
    if (!build) throw new Error(`Unknown tab "${name}". Known: ${Object.keys(TABS).join(', ')}`);
    console.log(`\n${name}`);
    const file = join(OUT_DIR, `${name}.json`);
    const b = new TabBuilder(name, file);
    await build(b);
    const data = b.result();
    const changed = writeIfChanged(file, data);
    const n = Object.keys(data.series).length + Object.keys(data.tables).length;
    total += n;
    failures += data.errors.length;
    console.log(`  → ${file} (${n} items, ${data.errors.length} failed groups, ${changed ? 'updated' : 'unchanged'})`);
  }

  // Every group failing means something systemic (network, API change): fail the CI job so it
  // gets noticed. Partial failures keep the previous values and are flagged in the UI instead.
  if (total === 0) {
    console.error('\nNo data at all was produced.');
    process.exit(1);
  }
  if (failures) console.warn(`\n${failures} group(s) failed; previous values were kept for them.`);
}

/**
 * Write the tab file only when its content changed (ignoring the generation timestamp), so the
 * scheduled job commits – and the dashboard's "päivitetty" time moves – only on new data.
 */
function writeIfChanged(file: string, data: TabData): boolean {
  const content = (d: TabData) => JSON.stringify({ series: d.series, tables: d.tables, errors: d.errors });
  if (existsSync(file)) {
    try {
      const prev = JSON.parse(readFileSync(file, 'utf8')) as TabData;
      if (content(prev) === content(data)) return false;
    } catch {
      // Unreadable previous file: overwrite.
    }
  }
  writeFileSync(file, serialise(data));
  return true;
}

/** Pretty-printed JSON with one data point per line: readable, and small diffs in git. */
function serialise(data: TabData): string {
  return JSON.stringify(data, null, 1).replace(/\[\s*("[^"]*"),\s*(-?[\d.eE+-]+|null)\s*\]/g, '[$1, $2]') + '\n';
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
