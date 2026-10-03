# FinnDash – Suomen talous

A desktop dashboard of the Finnish economy, built for a wide monitor. The UI is in Finnish.
Data comes from open APIs and is refreshed automatically every day.

| Tab | Contents |
|---|---|
| **Yleiskatsaus** (overview) | Inflation (CPI, HICP, HICP flash), what drives inflation, GDP and the monthly output indicator, unemployment, interest rates, consumer confidence, wages, bankruptcies, public debt |
| **Asuminen** (housing) | Prices of old dwellings (monthly, quarterly since 2005, by region on a map), transactions and selling time, rents, mortgage rates and volumes, housing starts, building costs |
| **Ulkomaankauppa** (trade) | Goods exports/imports and balance, products, top partner countries, services trade, current account |

Every chart has a **Taulukko** button that shows the numbers as a table, and every card links to its source table.
The time range (3–20 years) and theme (auto/light/dark) are in the top bar and are remembered by the browser.

## Data sources

| Source | Used for | API |
|---|---|---|
| [Tilastokeskus](https://stat.fi) (Statistics Finland) | Most series | [PxWeb API](https://pxdata.stat.fi/PxWeb/pxweb/fi/StatFin/) (JSON-stat2), no key |
| [Tulli](https://tulli.fi/tilastot) (Finnish Customs) | Goods trade by country and product | [Uljas API](https://tilastot.tulli.fi/en/uljas-statistical-database/uljas-api), no key |
| [EKP / ECB](https://data.ecb.europa.eu) | Euribor, ECB deposit rate, 10-year yield, Finnish mortgage rates and volumes (Bank of Finland data) | SDMX REST API, no key |

All data is licensed CC BY 4.0 by its publisher.

## How it works

```
GitHub Actions (daily) ──► pipeline/ (Node + TypeScript) ──► public/data/*.json ──► static site (Vite + React + ECharts)
```

- `pipeline/` fetches and normalises the data. Each tab is a list of independent *groups*. If one source
  fails, that group keeps its previous values and the dashboard shows a warning; the other groups still update.
- Data files are only rewritten when the numbers actually change, so the repository gets a commit only when
  there is new data.
- The web app is fully static: it reads the JSON files and re-checks them every 30 minutes, so a page left
  open on a monitor stays current.

## Running locally

Requires Node 22+.

```sh
npm install
npm run data      # fetch the newest data (≈1 min); optional – the repo already contains data
npm run dev       # http://localhost:5173
```

`npm run build && npm run preview` serves the production build. `npm run data -- housing` refreshes a single tab.

## Automatic updates and hosting

`.github/workflows/update.yml` runs on weekday mornings just after Statistics Finland's 08:00 releases and
every afternoon. It fetches data, commits any changes to the default branch and publishes the site on
GitHub Pages at **https://sjmpen.github.io/FinnDash/**. Pushes to the default branch also republish.

One-time setup: *Settings → Pages → Build and deployment → Source: GitHub Actions*. To stop publishing,
set the repository variable `DEPLOY_PAGES` to `false` (*Settings → Secrets and variables → Actions → Variables*).
A manual refresh is *Actions → Päivitä data → Run workflow*.

Locally: `git pull` and open the dev or preview server.

## Adding a series

1. Find the table at [pxdata.stat.fi](https://pxdata.stat.fi/PxWeb/pxweb/fi/StatFin/) and note the database
   and table id (e.g. `khi/15b5`) and the variable codes. The metadata is at
   `https://pxdata.stat.fi/PxWeb/api/v1/fi/StatFin/<db>/<table>.px`.
2. Add a `b.group(...)` in the right file under `pipeline/tabs/`, using `pxQuery` and `pxSeries`.
3. Run `npm run data -- <tab>` and use the new series id in the matching component under `src/tabs/`.

## Project layout

```
pipeline/          data fetching (run with tsx)
  sources/         API clients: statfin.ts, uljas.ts, ecb.ts
  tabs/            one file per dashboard tab
  geo.ts           one-off download of region boundaries (public/geo/maakunnat.json)
shared/types.ts    the JSON contract between pipeline and web app
src/               web app
  charts/          ECharts option builders and table views
  components/      KPI tile, chart card, ECharts wrapper
  tabs/            Overview, Housing, Trade
public/data/       generated data (committed)
```
