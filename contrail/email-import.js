// Gmail import, the parts that don't talk to anyone: which emails to look for, turning one email
// into plain text or a booking, and merging a booking into the member's trips and stays.
// contrail/gmail.js does the fetching; this file only works on what it's handed.

// Who sends booking emails. One list, easy to add to: Gmail's from: matches any part of the
// address, so a domain covers its subdomains (email.united.com, reservations.hilton.com...).
export const SENDERS = [
  // Airlines
  'united.com', 'delta.com', 'aa.com', 'southwest.com', 'alaskaair.com', 'jetblue.com', 'hawaiianairlines.com', 'spirit.com', 'flyfrontier.com',
  'suncountry.com', 'aircanada.com', 'westjet.com', 'britishairways.com', 'ba.com', 'lufthansa.com', 'airfrance.com', 'klm.com', 'virginatlantic.com',
  'aerlingus.com', 'iberia.com', 'icelandair.com', 'emirates.com', 'qatarairways.com', 'etihad.com', 'turkishairlines.com', 'singaporeair.com',
  'cathaypacific.com', 'ana.co.jp', 'jal.com', 'koreanair.com', 'evaair.com', 'qantas.com', 'airnewzealand.com', 'aeromexico.com', 'copaair.com', 'avianca.com',
  // Hotels and rentals
  'marriott.com', 'hilton.com', 'hyatt.com', 'ihg.com', 'wyndhamhotels.com', 'choicehotels.com', 'accor.com', 'bestwestern.com', 'radissonhotels.com',
  'fourseasons.com', 'airbnb.com', 'vrbo.com',
  // Booking sites and card travel portals
  'expedia.com', 'booking.com', 'hotels.com', 'priceline.com', 'orbitz.com', 'travelocity.com', 'kayak.com', 'hopper.com', 'costcotravel.com',
  'chase.com', 'capitalone.com', 'americanexpress.com', 'aexp.com',
];
const SUBJECTS = 'subject:(confirmation OR confirmed OR itinerary OR receipt OR reservation OR booking OR "trip to" OR "schedule change" OR cancelled OR canceled)';

// The Gmail search for everything after `sinceMs`
export function gmailQuery(sinceMs) {
  return `from:(${SENDERS.join(' OR ')}) ${SUBJECTS} after:${Math.floor(sinceMs / 1000)}`;
}

// ---------- one Gmail message → its parts ----------
const header = (msg, name) => (msg.payload?.headers || []).find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || '';

function decodePart(part) {
  const data = part.body?.data;
  if (!data) return '';
  const bytes = Uint8Array.from(atob(data.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
  const charset = /charset="?([\w-]+)/i.exec((part.headers || []).find((h) => /content-type/i.test(h.name))?.value || '')?.[1] || 'utf-8';
  try { return new TextDecoder(charset).decode(bytes); } catch { return new TextDecoder().decode(bytes); }
}

// { subject, from, date, html, text } from a format=full message
export function messageParts(msg) {
  let html = '', text = '';
  (function walk(p) {
    if (!p) return;
    if (p.mimeType === 'text/html' && !html) html = decodePart(p);
    else if (p.mimeType === 'text/plain' && !text) text = decodePart(p);
    (p.parts || []).forEach(walk);
  })(msg.payload);
  return { subject: header(msg, 'Subject'), from: header(msg, 'From'), date: header(msg, 'Date'), html, text };
}

export const senderDomain = (from) => (/@([\w.-]+)/.exec(from || '')?.[1] || '').toLowerCase().split('.').slice(-2).join('.');

// ---------- plain text (for Claude) ----------
// Parsed with DOMParser: nothing in the email runs or loads (no scripts, no images).
export function plainText(html, fallback = '', max = 12000) {
  let out = fallback;
  if (html) {
    const doc = new DOMParser().parseFromString(html.replace(/<(br|\/p|\/div|\/tr|\/li|\/h\d|\/table)\b[^>]*>/gi, (m) => `${m}\n`), 'text/html');
    doc.querySelectorAll('script, style, head, title').forEach((n) => n.remove());
    out = doc.body?.textContent || '';
  }
  const lines = out.replace(/ /g, ' ').split('\n').map((l) => l.replace(/[ \t\r\f\v]+/g, ' ').trim());
  const kept = [];
  for (const l of lines) if (l || (kept.length && kept[kept.length - 1])) kept.push(l);
  return kept.join('\n').trim().slice(0, max);
}

// ---------- booking markup (schema.org), no AI needed ----------
// Many airline and hotel emails carry their booking as JSON-LD or microdata for Gmail's own
// cards. Read either; FlightReservation and LodgingReservation are the ones Contrail uses.
function typesOf(o) { return [].concat(o?.['@type'] || []).map((t) => String(t).split('/').pop()); }
function flatten(x, out = []) {
  if (Array.isArray(x)) x.forEach((y) => flatten(y, out));
  else if (x && typeof x === 'object') { out.push(x); if (x['@graph']) flatten(x['@graph'], out); }
  return out;
}
function microdata(doc) {
  const read = (el) => {
    const o = { '@type': (el.getAttribute('itemtype') || '').split(/\s+/)[0] };
    el.querySelectorAll('[itemprop]').forEach((p) => {
      if (p.parentElement?.closest('[itemscope]') !== el) return; // belongs to a nested item
      const v = p.hasAttribute('itemscope') ? read(p) : p.getAttribute('content') ?? p.getAttribute('datetime') ?? p.getAttribute('href') ?? p.textContent.trim();
      for (const name of p.getAttribute('itemprop').split(/\s+/)) o[name] ??= v;
    });
    return o;
  };
  return [...doc.querySelectorAll('[itemscope]')].filter((el) => !el.parentElement?.closest('[itemscope]')).map(read);
}
export function markupItems(html) {
  if (!html || !/schema\.org/i.test(html)) return [];
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const items = [];
  doc.querySelectorAll('script[type="application/ld+json"]').forEach((s) => { try { flatten(JSON.parse(s.textContent), items); } catch { /* bad JSON-LD: skip it */ } });
  flatten(microdata(doc), items);
  return items.filter((o) => typesOf(o).some((t) => t === 'FlightReservation' || t === 'LodgingReservation'));
}

const val = (x) => (x && typeof x === 'object' ? x.iataCode || x.name || x['@id'] || '' : x || '');
// A schema.org time as local wall-clock "YYYY-MM-DDTHH:MM". Times with an offset are already
// local; a UTC ("Z") time is converted with the airport's time zone.
function localTime(s, tz) {
  s = String(s || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) return null;
  if (/Z$/i.test(s) && tz) {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
      .formatToParts(new Date(s)).map((x) => [x.type, x.value]));
    return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
  }
  return s.slice(0, 16);
}
const cancelled = (o) => /cancel/i.test(val(o.reservationStatus));

// The same shape the Worker returns, or null when there's no usable markup
export function fromMarkup(items, airport) {
  const flights = items.filter((o) => typesOf(o).includes('FlightReservation'));
  const lodging = items.filter((o) => typesOf(o).includes('LodgingReservation'));
  if (flights.length) {
    const conf = val(flights[0].reservationNumber) || null;
    if (flights.every(cancelled)) return { kind: 'cancellation', confirmation: conf, cancel_kind: 'flight', legs: [], stay: null };
    const seen = new Set();
    const legs = flights.filter((o) => !cancelled(o)).map((o) => {
      const f = o.reservationFor || {};
      const from = String(val(f.departureAirport)).toUpperCase(), to = String(val(f.arrivalAirport)).toUpperCase();
      return { airline: String(val(f.airline)).toUpperCase().slice(0, 2) || null, flight_no: String(f.flightNumber || '').replace(/\D/g, '').slice(0, 4) || null, from, to,
        dep_local: localTime(f.departureTime, airport(from)?.tz), arr_local: localTime(f.arrivalTime, airport(to)?.tz), aircraft: null, cabin: null };
    }).filter((l) => airport(l.from) && airport(l.to) && l.dep_local && !seen.has(`${l.airline}${l.flight_no}${l.dep_local}`) && seen.add(`${l.airline}${l.flight_no}${l.dep_local}`));
    return legs.length ? { kind: 'flight', confirmation: conf, cancel_kind: null, legs, stay: null } : null;
  }
  if (lodging.length) {
    const o = lodging[0], h = o.reservationFor || {}, a = h.address || {};
    const conf = val(o.reservationNumber) || null;
    if (cancelled(o)) return { kind: 'cancellation', confirmation: conf, cancel_kind: 'stay', legs: [], stay: null };
    const day = (x) => (/^\d{4}-\d{2}-\d{2}/.test(String(x || '')) ? String(x).slice(0, 10) : null);
    const stay = { name: val(h) || null, brand: null, city: (typeof a === 'object' ? a.addressLocality : '') || null, country: (typeof a === 'object' ? val(a.addressCountry) : '') || null,
      check_in: day(o.checkinTime || o.checkinDate), check_out: day(o.checkoutTime || o.checkoutDate), booked_via: null };
    return stay.name && stay.check_in ? { kind: 'stay', confirmation: conf, cancel_kind: null, legs: [], stay } : null;
  }
  return null;
}

// ---------- merging a booking into trips and stays ----------
const BRAND_WORDS = [['Marriott', /marriott|sheraton|westin|w hotel|ritz|st\.? regis|courtyard|residence inn|fairfield|springhill|aloft|moxy|le meridien|autograph|edition|four points|element|ac hotel/i],
  ['Hilton', /hilton|hampton|doubletree|embassy suites|conrad|waldorf|canopy|tru by|homewood|home2|curio|tapestry|motto/i], ['Hyatt', /hyatt|andaz|thompson|alila|caption/i],
  ['IHG', /holiday inn|intercontinental|crowne plaza|kimpton|indigo|staybridge|candlewood|avid|six senses|regent/i], ['Wyndham', /wyndham|la quinta|days inn|super 8|ramada|microtel/i],
  ['Choice', /comfort inn|comfort suites|quality inn|sleep inn|clarion|cambria|econo lodge/i], ['Accor', /sofitel|novotel|ibis|fairmont|pullman|mercure|raffles|swiss[oô]tel|movenpick/i],
  ['Best Western', /best western/i], ['Airbnb', /airbnb/i], ['Vrbo', /vrbo/i]];
export const guessBrand = (name, from = '') => BRAND_WORDS.find(([, re]) => re.test(name) || re.test(from))?.[0] || 'Independent hotel';
const BOOKERS = [['Chase Travel', /chase/], ['Capital One Travel', /capitalone/], ['Amex Travel', /americanexpress|aexp/], ['Expedia', /expedia/], ['Booking.com', /booking\.com/],
  ['Hotels.com', /hotels\.com/], ['Costco Travel', /costcotravel/], ['Airbnb', /airbnb/], ['Vrbo', /vrbo/]];
export const guessBooker = (domain) => BOOKERS.find(([, re]) => re.test(domain))?.[0] || 'Direct';

const up = (s) => String(s || '').toUpperCase();
const sameLeg = (a, b) => a.airline && a.airline === b.airline && a.flightNo && a.flightNo === b.flightNo && String(a.depLocal).slice(0, 10) === String(b.depLocal).slice(0, 10);
const legKey = (l) => [l.airline, l.flightNo, l.from, l.to, l.depLocal, l.arrLocal, l.aircraft, l.cabin, l.confirmation].join('|');

// What to do with one parsed email. Returns { status, label, put?: [collection, record] }.
//   trips, stays   every record (hidden ones too), as stored
//   ctx            { msgId, domain, airport, placeName, home, now }
// Matching: the confirmation code first, then the same flight on the same day (or, for stays,
// the same name and check-in). Anything the member undid ("Undo import") stays undone.
export function mergeBooking(result, trips, stays, ctx) {
  const now = ctx.now || new Date().toISOString();
  const conf = up(result?.confirmation).replace(/[^A-Z0-9]/g, '') || null;
  const confOf = (r) => [r.confirmation, ...(r.legs || []).map((l) => l.confirmation)].map((c) => up(c).replace(/[^A-Z0-9]/g, '')).filter(Boolean);
  const ids = (r) => [...new Set([...(r.emailMessageIds || []), ctx.msgId])];

  if (!result || result.kind === 'none') return { status: 'ignored', label: `Not a booking (${ctx.domain || 'unknown sender'})` };

  if (result.kind === 'cancellation') {
    if (!conf) return { status: 'ignored', label: 'Cancellation without a confirmation code' };
    const pool = result.cancel_kind === 'stay' ? [['stays', stays]] : result.cancel_kind === 'flight' ? [['trips', trips]] : [['trips', trips], ['stays', stays]];
    for (const [col, list] of pool) {
      const hit = list.find((r) => confOf(r).includes(conf));
      if (hit) {
        if (hit.hidden) return { status: 'ignored', label: `Already hidden: ${hit.name}` };
        return { status: 'updated', label: `Cancelled: ${hit.name}`, ref: `${col}:${hit.id}`, put: [col, { ...hit, hidden: true, cancelled: true, emailMessageIds: ids(hit), updatedAt: now }] };
      }
    }
    return { status: 'ignored', label: `Cancellation for ${conf}: nothing saved matches` };
  }

  if (result.kind === 'flight') {
    const legs = (result.legs || []).filter((l) => ctx.airport(l.from) && ctx.airport(l.to) && l.dep_local).map((l) => Object.fromEntries(Object.entries({
      airline: up(l.airline), flightNo: l.flight_no || '', from: l.from, to: l.to, depLocal: l.dep_local, arrLocal: l.arr_local || '',
      depTz: ctx.airport(l.from).tz, arrTz: ctx.airport(l.to).tz, aircraft: l.aircraft || '', cabin: l.cabin || '', confirmation: conf || '',
    }).filter(([, v]) => v !== '')));
    if (!legs.length) return { status: 'ignored', label: 'Flight email without airports Contrail knows' };
    const hit = (conf && trips.find((t) => confOf(t).includes(conf))) || trips.find((t) => (t.legs || []).some((a) => legs.some((b) => sameLeg(a, b))));
    if (hit) {
      if (hit.undone) return { status: 'ignored', label: `You undid ${hit.name}; left as is` };
      // This booking's flights as they now stand replace the ones it had before; any other
      // flights on the trip (added by hand, another booking) stay
      const keep = (hit.legs || []).filter((a) => !(conf && up(a.confirmation).replace(/[^A-Z0-9]/g, '') === conf) && !legs.some((b) => sameLeg(a, b)));
      const merged = [...keep, ...legs].sort((a, b) => String(a.depLocal).localeCompare(String(b.depLocal)));
      const same = merged.length === (hit.legs || []).length && merged.map(legKey).join() === [...hit.legs].sort((a, b) => String(a.depLocal).localeCompare(String(b.depLocal))).map(legKey).join();
      if (same && !hit.hidden) return { status: 'ignored', label: `Already in Contrail: ${hit.name}` };
      return { status: 'updated', label: `Updated: ${hit.name}`, ref: `trips:${hit.id}`, put: ['trips', { ...hit, legs: merged, hidden: false, cancelled: false, emailMessageIds: ids(hit), updatedAt: now }] };
    }
    // A new trip, named for where it goes (the farthest stop that isn't home)
    const stops = legs.map((l) => l.to).filter((c) => c !== ctx.home);
    const dest = stops.length ? stops.reduce((a, b) => (dist(ctx, legs[0].from, b) > dist(ctx, legs[0].from, a) ? b : a)) : legs[0].to;
    const name = String(ctx.placeName(dest) || dest).split(',')[0];
    return { status: 'added', label: `Added: ${name} (${legs.length} flight${legs.length === 1 ? '' : 's'})`,
      put: ['trips', { name, legs, source: 'gmail', emailMessageIds: [ctx.msgId], hidden: false, tags: [], pay: null, createdAt: now, updatedAt: now }] };
  }

  if (result.kind === 'stay' && result.stay) {
    const s = result.stay;
    const fields = { name: s.name, brand: s.brand || guessBrand(s.name, ctx.domain), city: s.city || '', country: s.country || '', checkIn: s.check_in, checkOut: s.check_out || '',
      bookedVia: s.booked_via || guessBooker(ctx.domain), confirmation: conf || '' };
    const hit = (conf && stays.find((x) => confOf(x).includes(conf))) || stays.find((x) => x.name && up(x.name) === up(s.name) && x.checkIn === s.check_in);
    if (hit) {
      if (hit.undone) return { status: 'ignored', label: `You undid ${hit.name}; left as is` };
      const next = { ...hit, ...Object.fromEntries(Object.entries(fields).filter(([, v]) => v)) };
      const changed = ['name', 'city', 'country', 'checkIn', 'checkOut'].some((k) => next[k] !== hit[k]) || hit.hidden;
      if (!changed) return { status: 'ignored', label: `Already in Contrail: ${hit.name}` };
      return { status: 'updated', label: `Updated: ${next.name}`, ref: `stays:${hit.id}`, put: ['stays', { ...next, hidden: false, cancelled: false, emailMessageIds: ids(hit), updatedAt: now }] };
    }
    return { status: 'added', label: `Added: ${s.name}`, put: ['stays', { ...fields, source: 'gmail', emailMessageIds: [ctx.msgId], hidden: false, pay: null, createdAt: now, updatedAt: now }] };
  }
  return { status: 'ignored', label: 'Nothing to log' };
}
function dist(ctx, a, b) {
  const A = ctx.airport(a), B = ctx.airport(b);
  if (!A || !B) return 0;
  return Math.hypot(A.lat - B.lat, (A.lon - B.lon) * Math.cos(((A.lat + B.lat) / 2) * Math.PI / 180));
}
