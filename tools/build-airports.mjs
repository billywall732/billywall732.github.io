// Builds shared/data/airports.json from OurAirports (public domain), for Contrail's airport
// autocomplete, maps and analytics. Keeps large and medium airports that have an IATA code.
//
//   npm install --no-save tz-lookup
//   node tools/build-airports.mjs
//
// Commit the JSON it writes, not the CSVs it downloads.
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import tzlookup from 'tz-lookup';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = 'https://davidmegginson.github.io/ourairports-data';

// Minimal CSV parser: quoted fields, doubled quotes, commas and newlines inside quotes
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const [head, ...body] = rows.filter((r) => r.length > 1);
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
}

const get = async (f) => {
  const res = await fetch(`${SRC}/${f}`);
  if (!res.ok) throw new Error(`${f}: HTTP ${res.status}`);
  return parseCsv(await res.text());
};

const [airports, countries, regions] = await Promise.all([get('airports.csv'), get('countries.csv'), get('regions.csv')]);
const countryName = Object.fromEntries(countries.map((c) => [c.code, c.name]));
const regionName = Object.fromEntries(regions.map((r) => [r.code, r.name]));

const out = airports
  .filter((a) => /^(large|medium)_airport$/.test(a.type) && /^[A-Z]{3}$/.test(a.iata_code) && a.scheduled_service === 'yes')
  .map((a) => {
    const lat = +(+a.latitude_deg).toFixed(4), lon = +(+a.longitude_deg).toFixed(4);
    return {
      iata: a.iata_code,
      name: a.name,
      city: a.municipality,
      country: countryName[a.iso_country] ?? a.iso_country,
      cc: a.iso_country,
      // US states and Canadian provinces by their short code (CA, NY, BC); elsewhere the region's name
      region: ['US', 'CA'].includes(a.iso_country) ? a.iso_region.split('-')[1] : regionName[a.iso_region] ?? '',
      lat, lon,
      tz: tzlookup(lat, lon),
      size: a.type === 'large_airport' ? 'L' : 'M',
    };
  })
  .sort((a, b) => a.iata.localeCompare(b.iata));

// Same IATA code twice (rare): keep the large airport
const seen = new Map();
for (const a of out) if (!seen.has(a.iata) || a.size === 'L') seen.set(a.iata, a);
const list = [...seen.values()];

writeFileSync(join(root, 'shared/data/airports.json'), JSON.stringify(list).replace(/\},\{/g, '},\n{') + '\n');
console.log(`Wrote ${list.length} airports to shared/data/airports.json`);
