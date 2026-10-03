import { useState, type ReactNode } from 'react';
import type { SourceRef } from '../../shared/types.ts';
import { dateOnly } from '../lib/format.ts';

export interface TableView {
  columns: string[];
  rows: (string | number)[][];
}

interface Props {
  title: string;
  subtitle?: string;
  sources: (SourceRef | undefined)[];
  /** Grid placement classes, e.g. "span-3 rows-2". */
  className?: string;
  /** Table twin of the chart (every value reachable without hovering). */
  table?: TableView;
  children: ReactNode;
}

export function ChartCard({ title, subtitle, sources, className, table, children }: Props) {
  const [showTable, setShowTable] = useState(false);
  const uniq = dedupe(sources.filter((s): s is SourceRef => !!s));
  return (
    <section className={`card chart-card ${className ?? ''}`}>
      <header className="card-head">
        <div>
          <h2>{title}</h2>
          {subtitle && <p className="subtitle">{subtitle}</p>}
        </div>
        {table && (
          <button
            type="button"
            className="ghost-btn"
            aria-pressed={showTable}
            onClick={() => setShowTable((v) => !v)}
            title={showTable ? 'Näytä kaavio' : 'Näytä taulukkona'}
          >
            {showTable ? 'Kaavio' : 'Taulukko'}
          </button>
        )}
      </header>
      <div className="card-body">{showTable && table ? <DataTable table={table} /> : children}</div>
      <footer className="card-foot">
        Lähde:{' '}
        {uniq.map((s, i) => (
          <span key={s.url + s.table}>
            {i > 0 && ', '}
            <a href={s.url} target="_blank" rel="noreferrer" title={s.table}>
              {s.name}
            </a>
            {s.updated && <span className="muted"> (päivitetty {dateOnly(s.updated)})</span>}
          </span>
        ))}
      </footer>
    </section>
  );
}

function dedupe(sources: SourceRef[]) {
  const seen = new Map<string, SourceRef>();
  for (const s of sources) {
    const key = s.name;
    const prev = seen.get(key);
    if (!prev || (s.updated && (!prev.updated || s.updated > prev.updated))) seen.set(key, s);
  }
  return [...seen.values()];
}

function DataTable({ table }: { table: TableView }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {table.columns.map((c) => (
              <th key={c}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
