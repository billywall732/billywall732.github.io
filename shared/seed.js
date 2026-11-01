// Seeded randomness and date helpers for the demo data. The same day always gives the
// same sample data, and every date is placed relative to today, so there's always a trip
// coming up whenever someone looks.

// mulberry32: tiny, fast, good enough for picking sample data
export function rng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    chance: (p) => next() < p,
  };
}

// Today at local midnight, so everything built from it is stable through the day
export function today() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export const addDays = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
export const isoDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
// "2026-11-05T07:30": a local wall-clock time at an airport (no time zone)
export const localDT = (d, hhmm) => `${isoDate(d)}T${hhmm}`;
