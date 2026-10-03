// One-off: download region (maakunta) boundaries from Statistics Finland's geoservice and
// store a compact GeoJSON for the housing map. Boundaries change rarely, so this is not part
// of the daily job. Usage: npm run data:geo
//
// Source: Tilastokeskus, Tilastointialueet (maakunta, 1:4 500 000), CC BY 4.0.

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchJson } from './http.ts';

const URL =
  'https://geo.stat.fi/geoserver/tilastointialueet/wfs?service=WFS&version=2.0.0&request=GetFeature' +
  '&typeName=tilastointialueet:maakunta4500k&outputFormat=json&srsName=EPSG:4326';

type Coords = number[] | Coords[];
interface Feature {
  type: 'Feature';
  properties: { maakunta: string; nimi: string };
  geometry: { type: string; coordinates: Coords };
}

const roundCoords = (c: Coords): Coords =>
  typeof c[0] === 'number' ? (c as number[]).map((v) => Math.round(v * 1000) / 1000) : (c as Coords[]).map(roundCoords);

async function main() {
  const fc = await fetchJson<{ features: Feature[] }>(URL);
  const out = {
    type: 'FeatureCollection',
    features: fc.features.map((f) => ({
      type: 'Feature',
      // "name" must match the region labels used in the data (see pipeline/tabs/housing.ts).
      properties: { code: `MK${f.properties.maakunta}`, name: f.properties.nimi },
      geometry: { type: f.geometry.type, coordinates: roundCoords(f.geometry.coordinates) },
    })),
  };
  const file = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'geo', 'maakunnat.json');
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(out));
  console.log(`Wrote ${out.features.length} regions to ${file}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
