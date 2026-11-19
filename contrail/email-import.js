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
  'flytap.com', 'tapairportugal.com', 'airindia.com', 'latam.com', 'zipair.net', 'flydubai.com', 'airasia.com', 'airtransat.com', 'flyporter.com',
  'ethiopianairlines.com', 'swiss.com', 'austrian.com', 'finnair.com', 'flysas.com', 'lot.com', 'brusselsairlines.com', 'royalairmaroc.com',
  // Hotels and rentals
  'marriott.com', 'hilton.com', 'hyatt.com', 'ihg.com', 'wyndhamhotels.com', 'choicehotels.com', 'accor.com', 'bestwestern.com', 'radissonhotels.com',
  'fourseasons.com', 'sonesta.com', 'omnihotels.com', 'loewshotels.com', 'mgmresorts.com', 'caesars.com', 'mandarinoriental.com', 'shangri-la.com',
  'clubmed.com', 'melia.com', 'druryhotels.com', 'redroof.com', 'greatwolf.com', 'airbnb.com', 'vrbo.com', 'vacasa.com',
  // Booking sites and card travel portals
  'expedia.com', 'booking.com', 'hotels.com', 'priceline.com', 'orbitz.com', 'travelocity.com', 'kayak.com', 'hopper.com', 'costcotravel.com',
  'agoda.com', 'trip.com', 'hotwire.com', 'trivago.com', 'traveluro.com', 'hostelworld.com',
  'chase.com', 'capitalone.com', 'americanexpress.com', 'aexp.com', 'citi.com', 'wellsfargo.com', 'bankofamerica.com', 'bofa.com',
  'usbank.com', 'barclaycardus.com', 'barclaysus.com', 'discover.com', 'bilt.com',
  // Card travel portals mail from their own domains, which from:chase.com / from:capitalone.com
  // don't match (Gmail matches whole address parts, not substrings). Found missing Nov 17, 2026:
  // Portugal and Sapporo (Chase Travel), Key West and hotels (Capital One Travel).
  'chasetravel.com', 'capitalonebooking.com', 'amextravel.com',
];
// Subject words. "trip" covers Delta's "Your EYW > LAX Trip Details" and Chase's "Trip ID #";
// "going to" covers Southwest's "You're going to Denver on 12/14". Marketing from the same senders
// (which also says "trip") is kept out by skipping Gmail's Promotions tab: bookings land in Updates.
const SUBJECTS = 'subject:(confirmation OR confirmed OR itinerary OR receipt OR reservation OR booking OR booked OR "booking confirmation" OR "hotel confirmation" OR "flight confirmation" OR "travel confirmation" OR trip OR "going to" OR "upcoming stay" OR "your stay" OR "stay details" OR "hotel details" OR "flight details" OR "e-ticket" OR eticket OR "schedule change" OR cancellation OR cancelled OR canceled)';

// The Gmail search for everything after `sinceMs`: mail from a booking sender, or a booking
// someone forwarded to the member. Serena books some stays on her own card and forwards the
// confirmation (found Nov 17, 2026: two Porto hotel stays from Chase Travel). A forward's From: is
// a person, so it's matched by "Fwd"/"Fw" in the subject plus a booking sender's domain in the
// body (the quoted "From:" line). {a b} is Gmail's OR. -in:sent leaves out the member's own
// forwards: the originals are already in their inbox.
export function gmailQuery(sinceMs) {
  const senders = `(${SENDERS.join(' OR ')})`;
  return `{from:${senders} (subject:(fwd OR fw) ${senders})} ${SUBJECTS} -in:sent -category:promotions after:${Math.floor(sinceMs / 1000)}`;
}

export function gmailSince({ backfillDone, lastSyncAt, years, hasFailed = false, forceBackfill = false, now = Date.now() }) {
  if (!forceBackfill && backfillDone && lastSyncAt && !hasFailed) return Date.parse(lastSyncAt) - 2 * 864e5;
  return now - (Number(years) || 3) * 365.25 * 864e5;
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

// Who first sent a forwarded email: the address on the quoted "From:" line under Gmail's
// "---------- Forwarded message ---------" (or Outlook's "Original Message"), or '' if it isn't one
export function forwardedFrom(text) {
  const m = /(?:Forwarded message|Original Message)[^\n]*\n(?:[^\n]*\n){0,3}?[\s*]*From:[^\n]*?([\w.+-]+@[\w-]+(?:\.[\w-]+)+)/i.exec(text || '');
  return m ? m[1] : '';
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
// A markup date as YYYY-MM-DD: ISO ("2026-09-18T15:00") or written out, as Capital One Travel's
// hotel emails have it ("Friday, September 18, 2026"). Until Nov 17, 2026 the written-out form made
// the markup unusable, so those emails went to the AI instead.
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
export function markupDay(x) {
  const s = String(x || '').trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const mdy = /\b([a-z]{3})[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/i.exec(s); // September 18, 2026
  const dmy = /\b(\d{1,2})\s+([a-z]{3})[a-z]*\.?,?\s+(\d{4})\b/i.exec(s); // 18 September 2026
  const [mon, d, y] = mdy ? [mdy[1], mdy[2], mdy[3]] : dmy ? [dmy[2], dmy[1], dmy[3]] : [];
  const i = MONTHS.indexOf(String(mon).toLowerCase());
  return i < 0 ? null : `${y}-${String(i + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
// A country as a name: "PT" → "Portugal"; anything else as given
function countryName(c) {
  const s = String(c || '').trim();
  if (!/^[A-Z]{2}$/.test(s)) return s;
  try { return new Intl.DisplayNames(['en'], { type: 'region' }).of(s) || s; } catch { return s; }
}

// A price: a number, "1,234.50", "$276.40" or a PriceSpecification { price }
function priceOf(x) {
  const v = x && typeof x === 'object' ? x.price ?? x.value : x;
  const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(/[^\d.]/g, ''));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}
const personName = (p) => (p && typeof p === 'object' ? p.name || [p.givenName, p.familyName].filter(Boolean).join(' ') : String(p || '')).trim();
// What the booking cost, from markup: each person's reservation can repeat their fare on every
// flight, so take each traveler's highest price once and add them up (the whole booking's total)
function markupPaid(rs) {
  const byWho = new Map();
  for (const o of rs) {
    const n = priceOf(o.totalPrice), who = personName(o.underName);
    if (n != null) byWho.set(who, Math.max(byWho.get(who) || 0, n));
  }
  if (!byWho.size) return null;
  const cur = rs.map((o) => String(val(o.priceCurrency) || o.totalPrice?.priceCurrency || '').toUpperCase()).find((c) => /^[A-Z]{3}$/.test(c)) || null;
  return { total: Math.round([...byWho.values()].reduce((a, b) => a + b, 0) * 100) / 100, currency: cur, points: null, program: null };
}
const markupNames = (rs) => [...new Set(rs.map((o) => personName(o.underName)).filter(Boolean))];

// The same shape the Worker returns (with paid and travelers), or null when there's no usable markup
export function fromMarkup(items, airport) {
  const r = markupBooking(items, airport);
  if (!r) return null;
  const rs = items.filter((o) => typesOf(o).some((t) => t === 'FlightReservation' || t === 'LodgingReservation'));
  const booking = r.kind === 'flight' || r.kind === 'stay';
  return { ...r, paid: booking ? markupPaid(rs) : null, travelers: booking ? markupNames(rs) : [] };
}
function markupBooking(items, airport) {
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
    // The address is a PostalAddress, or one line ("Rua do Comércio, 9, Lisbon, LI, PT": street,
    // number, city, region, country)
    const line = typeof a === 'object' ? [] : String(a || '').split(',').map((p) => p.trim()).filter(Boolean);
    const city = typeof a === 'object' ? a.addressLocality : line.length >= 4 ? line[line.length - 3] : line.length === 3 ? line[1] : '';
    const country = typeof a === 'object' ? val(a.addressCountry) : line.length >= 3 ? line[line.length - 1] : '';
    const stay = { name: val(h) || null, brand: null, city: city || null, country: countryName(country) || null,
      check_in: markupDay(o.checkinTime || o.checkinDate), check_out: markupDay(o.checkoutTime || o.checkoutDate), booked_via: null };
    return stay.name && stay.check_in ? { kind: 'stay', confirmation: conf, cancel_kind: null, legs: [], stay } : null;
  }
  return null;
}

// ---------- merging a booking into trips and stays ----------
const BRAND_WORDS = [['Marriott', /marriott|sheraton|westin|w hotel|ritz|st\.? regis|courtyard|residence inn|fairfield|springhill|aloft|moxy|le meridien|autograph|edition|four points|element|ac hotel/i],
  ['Hilton', /hilton|hampton|doubletree|embassy suites|conrad|waldorf|canopy|tru by|homewood|home2|curio|tapestry|motto/i], ['Hyatt', /hyatt|andaz|thompson|alila|caption/i],
  ['IHG', /holiday inn|intercontinental|crowne plaza|kimpton|indigo|staybridge|candlewood|avid|six senses|regent/i], ['Wyndham', /wyndham|la quinta|days inn|super 8|ramada|microtel/i],
  ['Choice', /comfort inn|comfort suites|quality inn|sleep inn|clarion|cambria|econo lodge/i], ['Accor', /sofitel|novotel|ibis|fairmont|pullman|mercure|raffles|swiss[oô]tel|movenpick/i],
  ['Sonesta', /sonesta/i], ['Omni', /omni/i], ['Loews', /loews/i], ['MGM Resorts', /mgm|bellagio|aria|cosmopolitan/i],
  ['Caesars', /caesars|harrah/i], ['Mandarin Oriental', /mandarin oriental/i], ['Shangri-La', /shangri.la/i], ['Club Med', /club med/i],
  ['Melia', /melia/i], ['Drury', /drury/i], ['Red Roof', /red roof/i], ['Great Wolf', /great wolf/i],
  ['Best Western', /best western/i], ['Airbnb', /airbnb/i], ['Vrbo', /vrbo/i]];
export const guessBrand = (name, from = '') => BRAND_WORDS.find(([, re]) => re.test(name) || re.test(from))?.[0] || 'Independent hotel';
const BOOKERS = [['Chase Travel', /chase/], ['Capital One Travel', /capitalone/], ['Amex Travel', /americanexpress|aexp|amextravel/], ['Expedia', /expedia/], ['Booking.com', /booking\.com/],
  ['Hotels.com', /hotels\.com/], ['Costco Travel', /costcotravel/], ['Citi Travel', /citi/], ['Wells Fargo Rewards', /wellsfargo/],
  ['Bank of America Travel', /bankofamerica|bofa/], ['U.S. Bank Travel', /usbank/], ['Barclays Travel', /barclays|barclaycard/],
  ['Discover Travel', /discover/], ['Bilt Travel', /bilt/], ['Agoda', /agoda/], ['Trip.com', /trip\.com/], ['Hotwire', /hotwire/],
  ['Trivago', /trivago/], ['Traveluro', /traveluro/], ['Hostelworld', /hostelworld/], ['Vacasa', /vacasa/],
  ['Airbnb', /airbnb/], ['Vrbo', /vrbo/]];
export const guessBooker = (domain) => BOOKERS.find(([, re]) => re.test(domain))?.[0] || 'Direct';

const up = (s) => String(s || '').toUpperCase();
// A leg's day: its departure, or its arrival when only that is known (Sapporo's legs, Nov 2026)
const legDay = (l) => String(l.depLocal || l.arrLocal || '').slice(0, 10);
const dayMs = (d) => Date.parse(`${d}T00:00:00Z`);
const sameLeg = (a, b) => a.airline && a.airline === b.airline && a.flightNo && a.flightNo === b.flightNo && legDay(a) && legDay(a) === legDay(b);
const byTime = (a, b) => (legDay(a) + String(a.depLocal || a.arrLocal)).localeCompare(legDay(b) + String(b.depLocal || b.arrLocal));

// Legs a day or less apart are one direction; within a direction each flight should leave from
// where the last one landed. Returns the breaks as "ATL→DFW" (empty when everything connects).
export function legBreaks(legs) {
  const out = [];
  for (let i = 1; i < legs.length; i++) {
    const a = legs[i - 1], b = legs[i];
    const sameDirection = legDay(a) && legDay(b) && dayMs(legDay(b)) - dayMs(legDay(a)) <= 864e5;
    if (sameDirection && a.to !== b.from) out.push(`${a.to}→${b.from}`);
  }
  return out;
}

// Which of a trip's legs a new email replaces, for legs on the email's confirmation:
//   - the whole booking (the email starts and ends on the booking's first and last days, or goes
//     out and comes back, as a schedule change listing both directions does): every leg
//   - a whole direction (the booking's legs within a day of the email's dates start and end where
//     the email does: a "trip details" email for the return, or a rerouted return): that direction
//   - part of a direction (a check-in email for one flight): only the flights it names, so the
//     connection it doesn't mention stays
// The same flight on the same day always goes, whatever its confirmation.
function legsToKeep(old, legs, conf) {
  const confOfLeg = (l) => up(l.confirmation).replace(/[^A-Z0-9]/g, '');
  const booking = conf ? old.filter((l) => confOfLeg(l) === conf) : [];
  const days = (ls) => ls.map(legDay).filter(Boolean).sort();
  const nd = days(legs), bd = days(booking);
  const roundTrip = legs.length > 1 && legs[0].from === legs[legs.length - 1].to;
  const whole = !bd.length || roundTrip || (nd[0] === bd[0] && nd[nd.length - 1] === bd[bd.length - 1]);
  const lo = dayMs(nd[0]) - 864e5, hi = dayMs(nd[nd.length - 1]) + 864e5;
  const inWindow = (a) => { const d = legDay(a); return d && dayMs(d) >= lo && dayMs(d) <= hi; };
  const nearby = booking.filter(inWindow).sort(byTime), sorted = [...legs].sort(byTime);
  const direction = nearby.length > 0 && nearby[0].from === sorted[0].from && nearby[nearby.length - 1].to === sorted[sorted.length - 1].to;
  const named = (a) => legs.some((b) => b.airline === a.airline && b.flightNo && b.flightNo === a.flightNo);
  return old.filter((a) => {
    if (legs.some((b) => sameLeg(a, b))) return false;
    if (!conf || confOfLeg(a) !== conf) return true;
    if (whole) return false;
    if (!inWindow(a)) return true;
    return !(direction || named(a));
  });
}
const reviewNote = (breaks) => (breaks.length ? ` · check it: flights don't connect (${breaks.join(', ')})` : '');
const legKey = (l) => [l.airline, l.flightNo, l.from, l.to, l.depLocal, l.arrLocal, l.aircraft, l.cabin, l.confirmation].join('|');

// ---------- prices and who traveled ----------
// A name in comparable words: "WALL/WILLIAM MR" and "Mr. William Wall" are both "william wall"
const TITLES = new Set(['mr', 'mrs', 'ms', 'miss', 'mx', 'dr']);
function nameWords(n) {
  let s = String(n || '').toLowerCase();
  if (s.includes('/')) { const [last, first] = s.split('/'); s = `${first} ${last}`; } // airlines' "LAST/FIRST"
  return s.replace(/[^a-z\s'-]/g, ' ').split(/\s+/).filter((w) => w && !TITLES.has(w)).join(' ');
}
// Is this traveler the member? selfNames is the profile's "Names on your bookings"
export const isSelf = (name, selfNames = []) => { const n = nameWords(name); return !!n && selfNames.some((x) => nameWords(x) === n); };
const tidyName = (n) => nameWords(n).replace(/(^|[\s'-])([a-z])/g, (m, a, c) => a + c.toUpperCase()); // "SERENA TRAMM" → "Serena Tramm"

// The Worker's or markup's paid → the app's pay shape { method, amount, points, program, with, note }.
// Money and points → mixed, points only → points, money only → card. No card name: the email
// doesn't say which card, and card numbers are never kept. null when nothing was paid.
export function payFrom(paid, travelers = [], selfNames = []) {
  const amount = Number(paid?.total) > 0 ? Number(paid.total) : null, points = Number(paid?.points) > 0 ? Number(paid.points) : null;
  if (!amount && !points) return null;
  const others = [...new Set(travelers.filter((t) => !isSelf(t, selfNames)).map(tidyName).filter(Boolean))];
  return Object.fromEntries(Object.entries({
    method: amount && points ? 'mixed' : points ? 'points' : 'card', amount, points, program: points ? paid.program || null : null,
    with: others.length ? others.join(', ') : null, note: amount && paid.currency && paid.currency !== 'USD' ? `Total in ${paid.currency}` : null,
  }).filter(([, v]) => v != null));
}

// What to do with one parsed email. Returns { status, label, put?: [collection, record] }.
//   trips, stays   every record (hidden ones too), as stored
//   ctx            { msgId, domain, airport, placeName, home, now, selfNames }
// A price fills `pay` only while it's empty: anything entered by hand stays.
// Matching: the confirmation code first, then the same flight on the same day (or, for stays,
// the same name and check-in). Anything the member undid ("Undo import") stays undone.
export function mergeBooking(result, trips, stays, ctx) {
  const now = ctx.now || new Date().toISOString();
  const conf = up(result?.confirmation).replace(/[^A-Z0-9]/g, '') || null;
  const confOf = (r) => [r.confirmation, ...(r.legs || []).map((l) => l.confirmation)].map((c) => up(c).replace(/[^A-Z0-9]/g, '')).filter(Boolean);
  const ids = (r) => [...new Set([...(r.emailMessageIds || []), ctx.msgId])];
  const pay = payFrom(result?.paid, result?.travelers || [], ctx.selfNames || []);
  const fillPay = (r) => (!r.pay && pay ? { pay } : {});

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
      // The flights this email covers replace the ones it had before (see legsToKeep); any other
      // flights on the trip (the other direction, added by hand, another booking) stay
      const merged = [...legsToKeep(hit.legs || [], legs, conf), ...legs].sort(byTime);
      const same = merged.length === (hit.legs || []).length && merged.map(legKey).join() === [...hit.legs].sort(byTime).map(legKey).join();
      if (same && !hit.hidden && !fillPay(hit).pay) return { status: 'ignored', label: `Already in Contrail: ${hit.name}` };
      // Saved either way; a trip whose flights don't connect is flagged for a look
      const breaks = legBreaks(merged);
      const { needsReview, ...rest } = hit;
      return { status: 'updated', label: `Updated: ${hit.name}${reviewNote(breaks)}`, ref: `trips:${hit.id}`,
        put: ['trips', { ...rest, legs: merged, ...fillPay(hit), ...(breaks.length ? { needsReview: true } : {}), hidden: false, cancelled: false, emailMessageIds: ids(hit), updatedAt: now }] };
    }
    // A new trip, named for where it goes (the farthest stop that isn't home)
    const stops = legs.map((l) => l.to).filter((c) => c !== ctx.home);
    const dest = stops.length ? stops.reduce((a, b) => (dist(ctx, legs[0].from, b) > dist(ctx, legs[0].from, a) ? b : a)) : legs[0].to;
    const name = String(ctx.placeName(dest) || dest).split(',')[0];
    const sorted = [...legs].sort(byTime), breaks = legBreaks(sorted);
    return { status: 'added', label: `Added: ${name} (${legs.length} flight${legs.length === 1 ? '' : 's'})${reviewNote(breaks)}`,
      put: ['trips', { name, legs: sorted, ...(breaks.length ? { needsReview: true } : {}), source: 'gmail', emailMessageIds: [ctx.msgId], hidden: false, tags: [], pay: pay || null, createdAt: now, updatedAt: now }] };
  }

  if (result.kind === 'stay' && result.stay) {
    const s = result.stay;
    const fields = { name: s.name, brand: s.brand || guessBrand(s.name, ctx.domain), city: s.city || '', region: s.region || '', address: s.address || '', country: s.country || '', checkIn: s.check_in, checkOut: s.check_out || '',
      bookedVia: s.booked_via || guessBooker(ctx.domain), confirmation: conf || '' };
    const hit = (conf && stays.find((x) => confOf(x).includes(conf))) || stays.find((x) => x.name && up(x.name) === up(s.name) && x.checkIn === s.check_in);
    if (hit) {
      if (hit.undone) return { status: 'ignored', label: `You undid ${hit.name}; left as is` };
      const next = { ...hit, ...Object.fromEntries(Object.entries(fields).filter(([, v]) => v)) };
      const changed = ['name', 'city', 'country', 'checkIn', 'checkOut'].some((k) => next[k] !== hit[k]) || hit.hidden || !!fillPay(hit).pay;
      if (!changed) return { status: 'ignored', label: `Already in Contrail: ${hit.name}` };
      return { status: 'updated', label: `Updated: ${next.name}`, ref: `stays:${hit.id}`, put: ['stays', { ...next, ...fillPay(hit), hidden: false, cancelled: false, emailMessageIds: ids(hit), updatedAt: now }] };
    }
    // Booked for other people (guests named, the member not among them): kept, but hidden
    const guests = result.travelers || [], self = ctx.selfNames || [];
    const forOthers = guests.length > 0 && self.length > 0 && !guests.some((g) => isSelf(g, self));
    // Same city, overlapping nights, still showing: often a second room or a rebooking. Logged, not merged.
    const twin = forOthers ? null : stays.find((x) => !x.hidden && x.city && up(x.city) === up(fields.city) && x.checkIn && fields.checkIn
      && x.checkIn < (fields.checkOut || fields.checkIn) && fields.checkIn < (x.checkOut || x.checkIn));
    const note = forOthers ? ` (hidden: booked for ${guests.join(', ')})` : twin ? ` · Possible duplicate of ${twin.name} (${twin.checkIn} to ${twin.checkOut})` : '';
    return { status: 'added', label: `Added: ${s.name}${note}`,
      put: ['stays', { ...fields, source: 'gmail', emailMessageIds: [ctx.msgId], hidden: forOthers, ...(forOthers ? { forOthers: true } : {}), pay: pay || null, createdAt: now, updatedAt: now }] };
  }
  return { status: 'ignored', label: 'Nothing to log' };
}
// ---------- placing a stay on the map ----------
// Kilometres between two { lat, lon }
export function km(a, b) {
  const r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}
// The airport a trip was headed to when the stay began: the last arrival on or before check-in
function destinationFor(stay, trips) {
  const span = (t) => { const d = (t.legs || []).map(legDay).filter(Boolean).sort(); return [d[0], d[d.length - 1]]; };
  const trip = trips.find((t) => { if (t.hidden) return false; const [a, b] = span(t); return a && a <= (stay.checkOut || stay.checkIn) && stay.checkIn <= b; });
  if (!trip) return null;
  const legs = [...trip.legs].sort(byTime), before = legs.filter((l) => String(l.arrLocal || l.depLocal || '').slice(0, 10) <= stay.checkIn);
  return (before[before.length - 1] || legs[0])?.to || null;
}
// Pin a stay: the address first, then name + city + region + country, then the town. If the stay
// overlaps a trip and the pin is 300+ km from where that trip flew to, try again inside a box around
// that airport; still too far: { needsPin: airport code } (left unpinned and flagged).
// geocode(query, box?) gives { lat, lon } or null; box = [west, north, east, south].
export async function placeStay(stay, trips, { geocode, airport }) {
  const where = [stay.city, stay.region, stay.country];
  const queries = [stay.address && [stay.address, ...where], stay.name && [stay.name, ...where], stay.city && where]
    .filter(Boolean).map((parts) => parts.filter(Boolean).join(', '));
  const first = async (box) => { for (const q of queries) { const hit = await geocode(q, box); if (hit) return hit; } return null; };
  const hit = await first();
  const code = destinationFor(stay, trips), ap = code && airport(code);
  if (!ap || (hit && km(hit, ap) <= 300)) return hit;
  const box = [ap.lon - 2, ap.lat + 1.5, ap.lon + 2, ap.lat - 1.5];
  const near = await first(box);
  return near && km(near, ap) <= 300 ? near : { needsPin: code };
}

function dist(ctx, a, b) {
  const A = ctx.airport(a), B = ctx.airport(b);
  if (!A || !B) return 0;
  return Math.hypot(A.lat - B.lat, (A.lon - B.lon) * Math.cos(((A.lat + B.lat) / 2) * Math.PI / 180));
}
