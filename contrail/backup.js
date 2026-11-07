// Checks a Contrail backup (.json) BEFORE anything is replaced. A restore replaces every trip
// and stay, so a file that's broken, from another app, or deliberately crafted must fail
// with a clear message and leave your data exactly as it was.
//
// checkBackup(o, isAirport) -> { trips, stays, profile } built only from the fields Contrail
// uses, each checked for its type and shape (airport codes are real 3-letter codes, dates
// are dates, text is plain text of a sane length). Unknown fields are dropped. Anything
// wrong throws a BackupError naming the trip/stay and field, and nothing is applied.
// The file is only ever read as data: nothing in it is run or inserted into the page as HTML.

export class BackupError extends Error {}

const CODE = /^[A-Z]{3}$/;
const LOCAL_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const TZ = /^[A-Za-z_]+(\/[A-Za-z0-9_+-]+){0,2}$/;
const ID = /^[\w-]{1,80}$/;
const LIMITS = { trips: 5000, legs: 30, stays: 5000, cards: 60, tags: 20 };

export function checkBackup(o, isAirport) {
  if (!o || typeof o !== 'object' || Array.isArray(o)) throw new BackupError("That file isn't a Contrail backup.");
  if (!Array.isArray(o.trips)) throw new BackupError("That file isn't a Contrail backup (it has no trips list).");
  if (o.stays != null && !Array.isArray(o.stays)) throw new BackupError('The backup’s stays aren’t a list.');
  if (o.trips.length > LIMITS.trips || (o.stays?.length ?? 0) > LIMITS.stays) throw new BackupError('That backup is too big to be a Contrail backup.');

  const fail = (where, msg) => { throw new BackupError(`${where}: ${msg}`); };
  const text = (where, v, max, field) => {
    if (v == null) return '';
    if (typeof v !== 'string' || v.length > max) fail(where, `“${field}” should be text (up to ${max} characters).`);
    return v;
  };
  const code = (where, v, field) => {
    if (typeof v !== 'string' || !CODE.test(v) || !isAirport(v)) fail(where, `“${field}” isn’t a known 3-letter airport code.`);
    return v;
  };
  const pattern = (where, v, re, field, required = true) => {
    if (v == null && !required) return undefined;
    if (typeof v !== 'string' || !re.test(v)) fail(where, `“${field}” isn’t in the expected format.`);
    return v;
  };
  const num = (where, v, field, min, max) => {
    if (v == null) return null;
    if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) fail(where, `“${field}” should be a number.`);
    return v;
  };
  const tags = (where, v) => {
    if (v == null) return [];
    if (!Array.isArray(v) || v.length > LIMITS.tags) fail(where, '“tags” should be a short list.');
    return v.map((t) => text(where, t, 40, 'tags'));
  };
  // How a trip or stay was paid: a few plain values (method, card, amount, points…)
  const pay = (where, v) => {
    if (v == null) return undefined;
    if (typeof v !== 'object' || Array.isArray(v)) fail(where, '“pay” isn’t in the expected format.');
    const out = {};
    for (const [k, x] of Object.entries(v)) {
      if (!/^[a-zA-Z]{1,20}$/.test(k)) continue;
      if (typeof x === 'number' && Number.isFinite(x)) out[k] = x;
      else if (typeof x === 'string' && x.length <= 80) out[k] = x;
      else if (typeof x === 'boolean') out[k] = x;
    }
    return out;
  };
  const id = (where, v) => (v == null ? undefined : pattern(where, v, ID, 'id'));
  const clean = (obj) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));

  const trips = o.trips.map((t, i) => {
    const where = `Trip ${i + 1}`;
    if (!t || typeof t !== 'object') fail(where, 'isn’t a trip.');
    if (!Array.isArray(t.legs) || !t.legs.length || t.legs.length > LIMITS.legs) fail(where, 'needs 1 to 30 flights (“legs”).');
    const legs = t.legs.map((l, j) => {
      const w = `${where}, flight ${j + 1}`;
      if (!l || typeof l !== 'object') fail(w, 'isn’t a flight.');
      const from = code(w, l.from ?? l.o, 'from');
      const to = code(w, l.to ?? l.d, 'to');
      return clean({
        airline: text(w, l.airline, 3, 'airline').replace(/[^A-Z0-9]/gi, ''),
        flightNo: text(w, l.flightNo, 12, 'flightNo'),
        from, to,
        ...(l.o != null ? { o: from } : {}),
        ...(l.d != null ? { d: to } : {}),
        depLocal: pattern(w, l.depLocal, LOCAL_TIME, 'depLocal'),
        arrLocal: pattern(w, l.arrLocal, LOCAL_TIME, 'arrLocal', false),
        depTz: pattern(w, l.depTz, TZ, 'depTz', false),
        arrTz: pattern(w, l.arrTz, TZ, 'arrTz', false),
        aircraft: text(w, l.aircraft, 60, 'aircraft'),
        cabin: text(w, l.cabin, 30, 'cabin'),
        confirmation: text(w, l.confirmation, 30, 'confirmation'),
      });
    });
    return clean({
      id: id(where, t.id),
      name: text(where, t.name, 80, 'name'),
      purpose: text(where, t.purpose, 40, 'purpose'),
      who: text(where, t.who, 60, 'who'),
      notes: text(where, t.notes, 500, 'notes'),
      tags: tags(where, t.tags),
      pay: pay(where, t.pay),
      source: text(where, t.source, 20, 'source'),
      hidden: t.hidden == null ? undefined : Boolean(t.hidden),
      legs,
    });
  });

  const stays = (o.stays ?? []).map((s, i) => {
    const where = `Stay ${i + 1}`;
    if (!s || typeof s !== 'object') fail(where, 'isn’t a stay.');
    if (typeof s.name !== 'string' || !s.name.trim()) fail(where, 'needs a name.');
    return clean({
      id: id(where, s.id),
      name: text(where, s.name, 100, 'name'),
      brand: text(where, s.brand, 60, 'brand'),
      city: text(where, s.city, 80, 'city'),
      country: text(where, s.country, 60, 'country'),
      lat: num(where, s.lat, 'lat', -90, 90),
      lon: num(where, s.lon, 'lon', -180, 180),
      checkIn: pattern(where, s.checkIn, DAY, 'checkIn'),
      checkOut: pattern(where, s.checkOut, DAY, 'checkOut', false),
      bookedVia: text(where, s.bookedVia, 40, 'bookedVia'),
      pay: pay(where, s.pay),
      notes: text(where, s.notes, 500, 'notes'),
      // The trip this stay belongs to ('' = none)
      trip: s.trip == null ? undefined : s.trip === '' ? '' : pattern(where, s.trip, ID, 'trip'),
      source: text(where, s.source, 20, 'source'),
      hidden: s.hidden == null ? undefined : Boolean(s.hidden),
    });
  });

  let profile = null;
  if (o.profile != null) {
    const where = 'Settings';
    const p = o.profile;
    if (typeof p !== 'object' || Array.isArray(p)) fail(where, 'aren’t in the expected format.');
    const homes = p.homeAirports ?? [];
    if (!Array.isArray(homes) || homes.length > 2) fail(where, '“homeAirports” should list up to 2 airports.');
    const cards = p.cards ?? [];
    if (!Array.isArray(cards) || cards.length > LIMITS.cards) fail(where, '“cards” should be a list.');
    profile = {
      displayName: text(where, p.displayName, 40, 'displayName'),
      homeAirports: homes.map((c) => code(where, c, 'homeAirports')),
      cards: cards.map((c, k) => {
        const w = `Card ${k + 1}`;
        if (!c || typeof c !== 'object') fail(w, 'isn’t a card.');
        return clean({ key: pattern(w, c.key, ID, 'key'), name: text(w, c.name, 60, 'name'), owner: text(w, c.owner, 40, 'owner'), tags: tags(w, c.tags) });
      }),
    };
  }
  return { trips, stays, profile };
}
