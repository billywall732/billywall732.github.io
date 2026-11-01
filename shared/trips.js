// Trips and stays as stored → the shapes Contrail draws from: UTC times, durations, great-circle
// miles, the airport sequence. Used by Contrail, its analytics page and Wallet's travel profile.

let AIRPORTS = null;
// shared/data/airports.json, loaded once, keyed by IATA code
export async function loadAirports() {
  if (!AIRPORTS) {
    const list = await (await fetch(new URL('./data/airports.json', import.meta.url))).json();
    AIRPORTS = Object.fromEntries(list.map((a) => [a.iata, a]));
  }
  return AIRPORTS;
}
export const airport = (code) => AIRPORTS?.[code] ?? null;
export const isUS = (code) => airport(code)?.cc === 'US';
// "Los Angeles, CA" in the US; "Tokyo, Japan" elsewhere
export function placeName(code) {
  const a = airport(code); if (!a) return code;
  const city = a.city.replace(/\s*\(.*\)$/, '');
  return a.cc === 'US' || a.cc === 'CA' ? `${city}, ${a.region}` : `${city}, ${a.country}`;
}

export const AIRLINES = {
  UA: 'United', DL: 'Delta', AA: 'American', WN: 'Southwest', AS: 'Alaska', B6: 'JetBlue', NK: 'Spirit', F9: 'Frontier', HA: 'Hawaiian',
  G4: 'Allegiant', SY: 'Sun Country', WS: 'WestJet', AC: 'Air Canada', AM: 'Aeromexico', BA: 'British Airways', AF: 'Air France',
  KL: 'KLM', LH: 'Lufthansa', JL: 'Japan Airlines', NH: 'ANA', SQ: 'Singapore Airlines', CX: 'Cathay Pacific', QF: 'Qantas',
  EK: 'Emirates', QR: 'Qatar Airways', TP: 'TAP Air Portugal', IB: 'Iberia', VS: 'Virgin Atlantic', KE: 'Korean Air', NZ: 'Air New Zealand',
};
export const airlineName = (code) => AIRLINES[code] ?? code;

export function tzOffsetMin(tz, utcMs) {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(utcMs));
  const g = (t) => +p.find((x) => x.type === t).value;
  // Whole minutes: the formatter drops seconds, so the raw difference has a fractional part
  return Math.round((Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute')) - utcMs) / 60000);
}
export function localToUtc(s, tz) {
  const [d, t] = s.split('T'); const [y, m, da] = d.split('-').map(Number); const [h, mi] = t.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, da, h, mi);
  let off = tzOffsetMin(tz, guess); const u = guess - off * 60000;
  off = tzOffsetMin(tz, u); return guess - off * 60000;
}
export function miles(a, b) {
  const A = airport(a), B = airport(b); if (!A || !B) return 0;
  const R = 3958.8, r = Math.PI / 180;
  const dl = (B.lat - A.lat) * r, dn = (B.lon - A.lon) * r;
  const x = Math.sin(dl / 2) ** 2 + Math.cos(A.lat * r) * Math.cos(B.lat * r) * Math.sin(dn / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

// A stored trip → the original Contrail's trip shape (o, d, dep, arr, f, ac, mi, depU, arrU, dur;
// start, end, startLocal, endLocal, mi, mins, seq, carrier). Legs with unknown airports are dropped.
export function deriveTrip(rec) {
  const legs = (rec.legs ?? []).filter((l) => airport(l.from) && airport(l.to)).map((l) => {
    const depTz = l.depTz || airport(l.from).tz, arrTz = l.arrTz || airport(l.to).tz;
    const depU = l.depLocal ? localToUtc(l.depLocal, depTz) : null, arrU = l.arrLocal ? localToUtc(l.arrLocal, arrTz) : null;
    return { ...l, o: l.from, d: l.to, dep: l.depLocal || null, arr: l.arrLocal || null, f: `${l.airline} ${l.flightNo}`.trim(), ac: l.aircraft || '',
      mi: miles(l.from, l.to), depU, arrU, dur: depU && arrU ? (arrU - depU) / 60000 : null };
  }).sort((a, b) => (a.depU ?? a.arrU) - (b.depU ?? b.arrU));
  if (!legs.length) return null;
  const first = legs[0], last = legs[legs.length - 1];
  const seq = [first.o]; legs.forEach((l) => { if (seq[seq.length - 1] !== l.o) seq.push('·', l.o); seq.push(l.d); });
  return {
    ...rec, legs, seq,
    start: first.depU ?? first.arrU, end: last.arrU ?? last.depU,
    startLocal: first.dep ?? first.arr, endLocal: last.arr ?? last.dep,
    mi: legs.reduce((s, l) => s + l.mi, 0),
    mins: legs.reduce((s, l) => s + (l.dur ?? 0), 0),
    carrier: [...new Set(legs.map((l) => airlineName(l.airline)))].join(' · '),
  };
}

// Stays: nights from the dates (or the stored count for month-only records)
export const nightsOf = (s) => (s.checkIn && s.checkOut && s.checkIn.length === 10 ? Math.max(0, Math.round((Date.parse(s.checkOut) - Date.parse(s.checkIn)) / 864e5)) : +s.nights || 0);
export const RENTAL = new Set(['Airbnb', 'Vrbo', 'Vacation rental']);

// The farthest point from home: the trip's destination
export function destOf(t, home = 'LAX') {
  let best = null, bm = -1;
  t.legs.forEach((l) => { const m = miles(home, l.d); if (l.d !== home && m > bm) { bm = m; best = l.d; } });
  return best || t.legs[0].d;
}
