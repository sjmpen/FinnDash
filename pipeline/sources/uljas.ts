// Finnish Customs (Tulli) Uljas statistical database, "Verti" open data API.
// Docs: https://tilastot.tulli.fi/en/uljas-statistical-database/uljas-api
//
// Query quirks (from the API manual):
//  - spaces and Nordic letters in names/values are written as *; *228; *246; …
//  - several values for one classifier are separated by a double quote (")
//  - "=ALL", "=FIRST*;N", "=LAST*;N" select ranges; time classifiers are listed newest first
//  - one response is limited to 50 000 cells

import { fetchText } from '../http.ts';

const API = 'https://uljas.tulli.fi/uljas/graph/api.aspx';

export const UI_URL = 'https://uljas.tulli.fi/v3rti/';

const SPECIAL: Record<string, string> = {
  ' ': '*;',
  ä: '*228;',
  ö: '*246;',
  å: '*229;',
  Ä: '*196;',
  Ö: '*214;',
  Å: '*197;',
};

function verti(s: string): string {
  return [...s].map((c) => SPECIAL[c] ?? c).join('');
}

/** URL-encode after Verti escaping, keeping its own * ; = markers readable. */
function enc(s: string): string {
  return encodeURIComponent(verti(s)).replace(/%2A/g, '*').replace(/%3B/g, ';').replace(/%3D/g, '=');
}

export interface UljasRow {
  keys: string[];
  vals: (number | null)[];
}

/**
 * Run a data query. `selections` are [classifier name, value] pairs in the cube's dimension
 * order, with the indicator ("Indikaattorit") classifier last. Values may be arrays.
 */
export async function uljasQuery(ifile: string, selections: [string, string | string[]][]): Promise<UljasRow[]> {
  const parts = ['lang=fi', 'atype=data', 'konv=json', 'Select=Codes', `ifile=${enc(ifile).replace(/%2F/g, '/')}`];
  for (const [name, value] of selections) {
    parts.push(`${enc(name)}=${enc(Array.isArray(value) ? value.join('"') : value)}`);
  }
  const text = await fetchText(`${API}?${parts.join('&')}`);
  if (text.trimStart().startsWith('<')) {
    const reason = text.match(/<i>\((.*?)\)<\/i>/)?.[1];
    throw new Error(
      `Uljas query failed: ${reason ? decodeURIComponent(reason.replace(/\+/g, ' ')) : text.slice(0, 200)}`,
    );
  }
  return JSON.parse(text) as UljasRow[];
}

export const CUBES = {
  /** Monthly exports/imports/balance by country, 2002→. */
  tradeBalance: '/DATABASE/01 ULKOMAANKAUPPATILASTOT/06 KAUPPATASE/ULJAS_KAUPPATASE',
  /** SITC rev4, current cube (exports 2025→, imports 2026→). */
  sitc: '/DATABASE/01 ULKOMAANKAUPPATILASTOT/02 SITC/ULJAS_SITC',
  /** SITC rev4, history cube (2002–2025). */
  sitcHistory: '/DATABASE/01 ULKOMAANKAUPPATILASTOT/02 SITC/ULJAS_SITC2',
} as const;
