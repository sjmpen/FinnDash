import { useEffect, useMemo, useState } from 'react';
import { useTabData, type TabId } from './lib/data.ts';
import { useTheme, type ThemeMode } from './lib/theme.ts';
import { dateTime } from './lib/format.ts';
import type { Ctx } from './charts/options.ts';
import { Overview } from './tabs/Overview.tsx';
import { Housing } from './tabs/Housing.tsx';
import { Trade } from './tabs/Trade.tsx';
import { Stocks } from './tabs/Stocks.tsx';

const TABS: { id: TabId; hash: string; label: string }[] = [
  { id: 'overview', hash: 'yleiskatsaus', label: 'Yleiskatsaus' },
  { id: 'housing', hash: 'asuminen', label: 'Asuminen' },
  { id: 'trade', hash: 'ulkomaankauppa', label: 'Ulkomaankauppa' },
  { id: 'stocks', hash: 'osakemarkkinat', label: 'Osakemarkkinat' },
];

const RANGES = [
  { years: 3, label: '3 v' },
  { years: 5, label: '5 v' },
  { years: 10, label: '10 v' },
  { years: 20, label: '20 v' },
];

const THEMES: { mode: ThemeMode; label: string }[] = [
  { mode: 'auto', label: 'Auto' },
  { mode: 'light', label: 'Vaalea' },
  { mode: 'dark', label: 'Tumma' },
];

function tabFromHash(): TabId {
  const h = window.location.hash.replace('#', '');
  return TABS.find((t) => t.hash === h)?.id ?? 'overview';
}

function readRange(): number {
  try {
    const v = Number(localStorage.getItem('finndash.range'));
    if (RANGES.some((r) => r.years === v)) return v;
  } catch {
    // ignore
  }
  return 10;
}

export function App() {
  const [tab, setTab] = useState<TabId>(tabFromHash);
  const [years, setYears] = useState<number>(readRange);
  const { mode, setMode, tokens } = useTheme();
  const { data, error } = useTabData(tab);

  useEffect(() => {
    const onHash = () => setTab(tabFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const ctx: Ctx = useMemo(() => {
    const now = new Date();
    return { t: tokens, rangeStart: Date.UTC(now.getUTCFullYear() - years, now.getUTCMonth(), 1) };
  }, [tokens, years]);

  const chooseRange = (y: number) => {
    setYears(y);
    try {
      localStorage.setItem('finndash.range', String(y));
    } catch {
      // ignore
    }
  };

  const current = TABS.find((t) => t.id === tab)!;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="22" height="22">
              <rect x="2" y="13" width="4" height="9" rx="1.5" fill="var(--accent)" />
              <rect x="10" y="8" width="4" height="14" rx="1.5" fill="var(--accent)" opacity="0.75" />
              <rect x="18" y="3" width="4" height="19" rx="1.5" fill="var(--accent)" opacity="0.5" />
            </svg>
          </span>
          <div>
            <div className="brand-name">FinnDash</div>
            <div className="brand-sub">Suomen talous</div>
          </div>
        </div>

        <nav className="tabs" aria-label="Näkymät">
          {TABS.map((t) => (
            <a
              key={t.id}
              href={`#${t.hash}`}
              className={t.id === tab ? 'tab active' : 'tab'}
              aria-current={t.id === tab ? 'page' : undefined}
            >
              {t.label}
            </a>
          ))}
        </nav>

        <div className="controls">
          <div className="segmented" role="group" aria-label="Aikaväli">
            {RANGES.map((r) => (
              <button key={r.years} type="button" aria-pressed={years === r.years} onClick={() => chooseRange(r.years)}>
                {r.label}
              </button>
            ))}
          </div>
          <div className="segmented" role="group" aria-label="Teema">
            {THEMES.map((th) => (
              <button key={th.mode} type="button" aria-pressed={mode === th.mode} onClick={() => setMode(th.mode)}>
                {th.label}
              </button>
            ))}
          </div>
          <div className="updated" title="Milloin lähteistä tuli viimeksi uutta dataa">
            Data päivittynyt
            <br />
            <strong>{data ? dateTime(data.generated) : '–'}</strong>
          </div>
        </div>
      </header>

      {data && data.errors.length > 0 && (
        <div className="notice" role="status">
          <span aria-hidden="true">⚠</span> Osa tiedoista ei päivittynyt viimeisimmässä haussa (
          {data.errors.map((e) => e.id).join(', ')}), joten niistä näytetään edelliset arvot.
        </div>
      )}

      <main className={data ? '' : 'loading-main'} aria-label={current.label}>
        {error && !data && <div className="notice">Tietojen lataus epäonnistui: {error}</div>}
        {!data && !error && <div className="loading">Ladataan…</div>}
        {data && data.tab === tab && tab === 'overview' && <Overview data={data} ctx={ctx} />}
        {data && data.tab === tab && tab === 'housing' && <Housing data={data} ctx={ctx} />}
        {data && data.tab === tab && tab === 'trade' && <Trade data={data} ctx={ctx} />}
        {data && data.tab === tab && tab === 'stocks' && <Stocks data={data} ctx={ctx} />}
      </main>
    </div>
  );
}
