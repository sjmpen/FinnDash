// Small fetch helpers with retries and per-host pacing so we stay polite to the APIs.

const lastCall = new Map<string, number>();

/** Minimum gap between requests to the same host (ms). */
const HOST_GAP: Record<string, number> = {
  'pxdata.stat.fi': 1100,
  'uljas.tulli.fi': 500,
  'data-api.ecb.europa.eu': 300,
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Node's fetch sends "Accept-Language: *", which makes the Customs (ASP.NET) API fail with
// HTTP 500, so always send explicit headers.
const DEFAULT_HEADERS = {
  'Accept-Language': 'fi,en;q=0.8',
  'User-Agent': 'FinnDash/0.1 (+https://github.com/sjmpen/FinnDash)',
};

async function pace(url: string) {
  const host = new URL(url).host;
  const gap = HOST_GAP[host] ?? 200;
  const prev = lastCall.get(host) ?? 0;
  const wait = prev + gap - Date.now();
  if (wait > 0) await sleep(wait);
  lastCall.set(host, Date.now());
}

export async function fetchText(url: string, init?: RequestInit, attempts = 4): Promise<string> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    await pace(url);
    try {
      const res = await fetch(url, {
        ...init,
        headers: { ...DEFAULT_HEADERS, ...(init?.headers as Record<string, string> | undefined) },
        signal: AbortSignal.timeout(120_000),
      });
      const body = await res.text();
      if (res.ok) return body.replace(/^\uFEFF/, '');
      // 4xx other than rate limiting is a bad query: retrying will not help.
      if (res.status !== 429 && res.status < 500) {
        throw new HttpError(`${res.status} ${res.statusText}: ${body.slice(0, 300)}`, false);
      }
      lastErr = new HttpError(`${res.status} ${res.statusText}`, true);
    } catch (e) {
      if (e instanceof HttpError && !e.retryable) throw e;
      lastErr = e;
    }
    await sleep(2000 * 2 ** i);
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const text = await fetchText(url, init);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Invalid JSON from ${url}: ${text.slice(0, 200)}`);
  }
}

class HttpError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}
