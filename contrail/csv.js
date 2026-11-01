// Flights from a CSV file → Contrail trips. Reads myFlightradar24's export as it comes, or a
// simple file with the same column names. Flights are grouped into trips: a trip ends when a
// flight lands at a home airport, or after three weeks without a flight.
import { airport, destOf, localToUtc, placeName, tzOffsetMin } from '/shared/trips.js';

export const CSV_HELP = 'Columns (first row): Date (YYYY-MM-DD), Flight number (e.g. UA 1215), From, To (airport codes), Dep time and Arr time (local, HH:MM), and optionally Duration (HH:MM), Aircraft, Flight class, Flight reason, Note. A myFlightradar24 export works as it is.';

function parseCsv(text) {
  const rows = []; let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { field += '"'; i++; } else if (c === '"') q = false; else field += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(field); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim()));
}
// "Los Angeles / Los Angeles International (LAX/KLAX)" or plain "LAX"
const iataOf = (s) => { const m = String(s).toUpperCase().match(/\(([A-Z]{3})\/[A-Z]{4}\)/) || String(s).toUpperCase().match(/^\s*([A-Z]{3})\s*$/); return m && airport(m[1]) ? m[1] : null; };
const hhmm = (s) => { const m = String(s).match(/(\d{1,2}):(\d{2})/); return m ? `${m[1].padStart(2, '0')}:${m[2]}` : null; };
const minutes = (s) => { const m = String(s).match(/(\d{1,2}):(\d{2})/); return m ? +m[1] * 60 + +m[2] : null; };
function utcToLocal(ms, tz) { return new Date(ms + tzOffsetMin(tz, ms) * 60000).toISOString().slice(0, 16); }
const CLASS = { 1: 'Economy', 2: 'Business', 3: 'First', 4: 'Premium Economy', 5: 'Private' };
const REASON = { 1: 'Vacation', 2: 'Work', 3: 'Work', 4: 'Other' };

export function parseFlightsCsv(text, { home = ['LAX'] } = {}) {
  const rows = parseCsv(text.replace(/^﻿/, ''));
  if (rows.length < 2) return { error: 'That file has no flights in it.' };
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const col = (...names) => head.findIndex((h) => names.includes(h));
  const c = { date: col('date'), fn: col('flight number', 'flight', 'flight no'), from: col('from', 'origin'), to: col('to', 'destination'), dep: col('dep time', 'departure time', 'dep'),
    arr: col('arr time', 'arrival time', 'arr'), dur: col('duration'), ac: col('aircraft'), cls: col('flight class', 'class', 'cabin'), why: col('flight reason', 'reason', 'purpose'), note: col('note', 'notes') };
  if (c.date < 0 || c.from < 0 || c.to < 0) return { error: 'Couldn’t find Date, From and To columns. Check the first row of the file.' };
  const legs = []; let skipped = 0;
  for (const r of rows.slice(1)) {
    const from = iataOf(r[c.from]), to = iataOf(r[c.to]), date = String(r[c.date] || '').trim().slice(0, 10);
    if (!from || !to || !/^\d{4}-\d{2}-\d{2}$/.test(date)) { skipped++; continue; }
    const fnRaw = String(r[c.fn] ?? '').toUpperCase().replace(/\s+/g, '');
    const fm = fnRaw.match(/^([A-Z0-9]{2})(\d{1,4}[A-Z]?)$/);
    const depLocal = `${date}T${hhmm(r[c.dep]) || '12:00'}`;
    const depU = localToUtc(depLocal, airport(from).tz);
    let arrLocal = '';
    const dur = c.dur >= 0 ? minutes(r[c.dur]) : null;
    if (dur) arrLocal = utcToLocal(depU + dur * 60000, airport(to).tz);
    else if (c.arr >= 0 && hhmm(r[c.arr])) {
      // Same day unless that's before take-off, then the next day (or the one after)
      let d = new Date(`${date}T12:00:00Z`);
      for (let k = 0; k < 3; k++) { const s = `${d.toISOString().slice(0, 10)}T${hhmm(r[c.arr])}`; if (localToUtc(s, airport(to).tz) > depU) { arrLocal = s; break; } d = new Date(d.getTime() + 864e5); }
    }
    const cls = String(r[c.cls] ?? '').trim();
    legs.push({ airline: fm ? fm[1] : '', flightNo: fm ? fm[2] : fnRaw, from, to, depLocal, arrLocal, depTz: airport(from).tz, arrTz: airport(to).tz,
      aircraft: String(r[c.ac] ?? '').replace(/\s*\([A-Z0-9]{3,4}\)\s*$/, '').trim(), cabin: CLASS[cls] || cls, confirmation: '',
      _u: depU, _end: arrLocal ? localToUtc(arrLocal, airport(to).tz) : depU, _why: REASON[String(r[c.why] ?? '').trim()] || String(r[c.why] ?? '').trim(), _note: String(r[c.note] ?? '').trim() });
  }
  if (!legs.length) return { error: `None of the ${skipped} rows could be read. Airports need their 3-letter codes.` };
  legs.sort((a, b) => a._u - b._u);
  const homes = new Set(home);
  const groups = [];
  for (const l of legs) {
    const g = groups[groups.length - 1], prev = g?.[g.length - 1];
    if (!g || homes.has(prev.to) || l._u - prev._end > 21 * 864e5) groups.push([l]); else g.push(l);
  }
  const now = new Date().toISOString();
  const trips = groups.map((g) => {
    const t = { legs: g.map((l) => ({ ...l, o: l.from, d: l.to })) };
    const dest = destOf(t, home[0]);
    return {
      name: placeName(dest).split(',')[0], purpose: g.find((l) => l._why)?._why || '', who: '', notes: g.map((l) => l._note).filter(Boolean).join(' · '),
      pay: null, tags: [], source: 'csv', hidden: false, createdAt: now, updatedAt: now,
      legs: g.map(({ _u, _end, _why, _note, ...l }) => l),
    };
  });
  return { trips, flights: legs.length, skipped };
}
