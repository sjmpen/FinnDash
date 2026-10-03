// Data contract between the pipeline (writes public/data/*.json) and the web app.

/** Time resolution of a series. */
export type Freq = 'D' | 'M' | 'Q' | 'A';

/**
 * Period keys are normalised so that they sort lexically:
 *   D → "2026-10-03", M → "2026-08", Q → "2026-Q2", A → "2026".
 */
export type Period = string;

export type Point = [Period, number | null];

export interface SourceRef {
  /** Publisher shown in the UI, e.g. "Tilastokeskus". */
  name: string;
  /** Table / dataset identifier, e.g. "khi/15b5". */
  table: string;
  /** Link to the source table for humans. */
  url: string;
  /** When the publisher last updated the table (ISO timestamp), if known. */
  updated?: string;
}

export interface Series {
  id: string;
  label: string;
  unit: string;
  freq: Freq;
  source: SourceRef;
  data: Point[];
}

/** A cross-section, e.g. one value per country or region for a single period. */
export interface CategoryTable {
  id: string;
  label: string;
  unit: string;
  /** Period the values refer to, e.g. "2026-Q2" or "2025-08..2026-07" for rolling sums. */
  period: string;
  source: SourceRef;
  /** Value column ids → Finnish column labels. */
  columns: Record<string, string>;
  /** `group` optionally nests rows, e.g. companies within a sector. */
  rows: { key: string; label: string; group?: string; values: Record<string, number | null> }[];
}

export interface FetchError {
  id: string;
  message: string;
}

export interface TabData {
  tab: string;
  generated: string;
  series: Record<string, Series>;
  tables: Record<string, CategoryTable>;
  /** Items whose refresh failed; the previous values were kept. */
  errors: FetchError[];
}
