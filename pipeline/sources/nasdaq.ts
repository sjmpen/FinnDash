// Nasdaq market data: the JSON API behind nasdaq.com / nasdaqomxnordic.com.
// It is not an official, documented API, so everything here is defensive: numbers arrive as
// formatted strings ("6,416.21", "+3.72%") and requests need browser-like headers (requests
// with a custom User-Agent are dropped). History is limited to the last 10 years.

import { fetchJson } from '../http.ts';
import type { Point } from '../../shared/types.ts';

const API = 'https://api.nasdaq.com/api/';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  Origin: 'https://www.nasdaq.com',
  Referer: 'https://www.nasdaq.com/',
};

/** Human-readable pages for the source links. */
export const NORDIC_INDEX_UI = (symbol: string) =>
  `https://www.nasdaq.com/european-market-activity/indexes/${symbol.toLowerCase()}`;
export const US_INDEX_UI = (symbol: string) => `https://www.nasdaq.com/market-activity/index/${symbol.toLowerCase()}`;
export const HELSINKI_SHARES_UI = 'https://www.nasdaq.com/european-market-activity/stocks/screener?exchange=HEL';

interface Envelope<T> {
  data: T | null;
  status?: { rCode?: number; bCodeMessage?: { errorMessage: string }[] | null };
}

async function get<T>(path: string): Promise<T> {
  const res = await fetchJson<Envelope<T>>(API + path, { headers: HEADERS });
  if (!res.data) {
    const msg = res.status?.bCodeMessage?.map((m) => m.errorMessage).join('; ') ?? 'no data';
    throw new Error(`Nasdaq ${path.split('?')[0]}: ${msg}`);
  }
  return res.data;
}

/** "6,416.21" → 6416.21, "+3.72%" → 3.72, "" → null. */
export function num(s: string | undefined | null): number | null {
  if (s === undefined || s === null) return null;
  const t = s.replace(/[,%+\s]/g, '').replace(/^EUR/, '');
  if (t === '' || t === '-') return null;
  const v = Number(t);
  return Number.isFinite(v) ? v : null;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Start date of the longest history the API serves (10 years back, plus a day). */
export function maxHistoryStart(): string {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - 10);
  d.setUTCDate(d.getUTCDate() + 1);
  return iso(d);
}

/** Daily closes of a Nordic index or share, e.g. nordicCloses('IX2165', 'INDEXES'). */
export async function nordicCloses(
  orderbookId: string,
  assetClass: 'INDEXES' | 'SHARES',
  from: string,
): Promise<Point[]> {
  const data = await get<{ CP: { z: { dateTime: string }; y: number }[] | null }>(
    `nordic/instruments/${orderbookId}/chart?assetClass=${assetClass}&fromDate=${from}&toDate=${iso(new Date())}`,
  );
  if (!data.CP?.length) throw new Error(`Nasdaq ${orderbookId}: empty history`);
  return data.CP.map((p): Point => [p.z.dateTime, p.y]).sort((a, b) => (a[0] < b[0] ? -1 : 1));
}

/** Daily closes of a US index from the nasdaq.com quote API, e.g. usIndexCloses('NDX'). */
export async function usIndexCloses(symbol: string, from: string): Promise<Point[]> {
  const data = await get<{ chart: { z: { dateTime: string }; y: number }[] | null }>(
    `quote/${symbol}/chart?assetclass=index&fromdate=${from}&todate=${iso(new Date())}`,
  );
  if (!data.chart?.length) throw new Error(`Nasdaq ${symbol}: empty history`);
  return data.chart
    .map((p): Point => {
      const [m, d, y] = p.z.dateTime.split('/').map(Number);
      return [`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`, p.y];
    })
    .sort((a, b) => (a[0] < b[0] ? -1 : 1));
}

export interface ListedShare {
  orderbookId: string;
  symbol: string;
  fullName: string;
  sector: string;
  price: number | null;
  changePct: number | null;
  turnover: number | null;
}

/** Every share on the Helsinki main market. */
export async function helsinkiShares(): Promise<ListedShare[]> {
  const data = await get<{
    instrumentListing: {
      rows: {
        orderbookId: string;
        symbol: string;
        fullName: string;
        sector: string;
        lastSalePrice: string;
        percentageChange: string;
        turnover: string;
        currency: string;
      }[];
    };
  }>('nordic/screener/shares?category=MAIN_MARKET&tableonly=false&market=HEL');
  return data.instrumentListing.rows
    .filter((r) => r.currency === 'EUR')
    .map((r) => ({
      orderbookId: r.orderbookId,
      symbol: r.symbol,
      fullName: r.fullName,
      sector: r.sector,
      price: num(r.lastSalePrice),
      changePct: num(r.percentageChange),
      turnover: num(r.turnover),
    }));
}

export interface ShareSummary {
  marketCap: number | null;
  segment: string;
  week: number | null;
  month: number | null;
  ytd: number | null;
  year: number | null;
}

/** Market value and returns for one share series. */
export async function shareSummary(orderbookId: string): Promise<ShareSummary> {
  const data = await get<{ summaryData: Record<string, { value: string }> }>(
    `nordic/instruments/${orderbookId}/summary?assetClass=SHARES`,
  );
  const s = data.summaryData;
  return {
    marketCap: num(s.marketCap?.value),
    segment: s.insSegment?.value ?? '',
    week: num(s.sharePriceChangeWeek?.value),
    month: num(s.sharePriceChangeMonth?.value),
    ytd: num(s.sharePriceChangeYTD?.value),
    year: num(s.sharePriceChangeYear?.value),
  };
}
