import assert from 'node:assert/strict';
import test from 'node:test';
import { gmailQuery, gmailSince, guessBrand, guessBooker, fromMarkup, markupDay, forwardedFrom, senderDomain, mergeBooking } from './email-import.js';

const now = Date.parse('2026-11-15T18:00:00Z');
const lastSyncAt = '2026-11-14T18:00:00Z';

test('Gmail search covers more travel providers and issuer booking subjects', () => {
  const query = gmailQuery(0);
  for (const domain of ['flytap.com', 'zipair.net', 'sonesta.com', 'omnihotels.com', 'agoda.com', 'citi.com', 'wellsfargo.com', 'bankofamerica.com']) {
    assert.ok(query.includes(domain), `query should include ${domain}`);
  }
  for (const phrase of ['booked', '"hotel confirmation"', '"flight confirmation"', '"travel confirmation"', '"upcoming stay"']) {
    assert.ok(query.includes(phrase), `query should include ${phrase}`);
  }
});

test('new chain and bank-portal emails receive useful booking labels', () => {
  assert.equal(guessBrand('Sonesta Resort', 'reservations@sonesta.com'), 'Sonesta');
  assert.equal(guessBrand('Omni Hotel', 'booking@omnihotels.com'), 'Omni');
  assert.equal(guessBooker('citi.com'), 'Citi Travel');
  assert.equal(guessBooker('bankofamerica.com'), 'Bank of America Travel');
  assert.equal(guessBooker('agoda.com'), 'Agoda');
});

test('failed messages keep sync within the configured backfill window', () => {
  assert.equal(gmailSince({ backfillDone: true, lastSyncAt, years: 3, hasFailed: true, now }), now - 3 * 365.25 * 864e5);
});

test('clean completed backfill uses the incremental overlap', () => {
  assert.equal(gmailSince({ backfillDone: true, lastSyncAt, years: 3, now }), Date.parse(lastSyncAt) - 2 * 864e5);
});

test('legacy completed sync can be forced to rescan the configured lookback', () => {
  assert.equal(gmailSince({ backfillDone: true, lastSyncAt, years: 3, forceBackfill: true, now }), now - 3 * 365.25 * 864e5);
});

test('an unfinished backfill uses the configured lookback', () => {
  assert.equal(gmailSince({ backfillDone: false, lastSyncAt: null, years: 1, now }), now - 365.25 * 864e5);
});

// Nov 17, 2026: real booking emails the search missed. Gmail matches from: on whole address parts,
// so chase.com doesn't cover chasetravel.com; these subjects had none of the old keywords.
test('search covers card travel portals that mail from their own domains', () => {
  const query = gmailQuery(0);
  for (const domain of ['chasetravel.com', 'capitalonebooking.com', 'amextravel.com']) {
    assert.ok(query.includes(domain), `query should include ${domain}`);
  }
  assert.equal(guessBooker('chasetravel.com'), 'Chase Travel');
  assert.equal(guessBooker('capitalonebooking.com'), 'Capital One Travel');
  assert.equal(guessBooker('amextravel.com'), 'Amex Travel');
});

test('subject keywords match the missed airline and portal subjects', () => {
  const query = gmailQuery(0);
  const words = /\} subject:\((.*?)\) -in:sent/.exec(query)[1].split(' OR ').map((w) => w.replace(/"/g, '').toLowerCase());
  const matches = (subject) => words.some((w) => subject.toLowerCase().includes(w));
  for (const subject of [
    "You're going to Denver on 12/14 (AS7FR6)!", // Southwest
    'Your EYW > LAX Trip Details', // Delta
    'Travel Reservation Center Trip ID # 1030895012', // Chase Travel
    'View your flight details for your Key West trip', // Capital One Travel
    'Your reservation details', // Capital One Travel hotel
  ]) assert.ok(matches(subject), `subject should match: ${subject}`);
  assert.ok(query.includes('-category:promotions'), 'marketing mail from the same senders stays out');
});

// Nov 17, 2026: the Portugal hotels. Two Porto stays were booked by Serena and reached Billy only as
// her forwards; Capital One Travel's Lisbon email has markup with written-out dates.
test('search also finds bookings forwarded to the member, but not their own forwards', () => {
  const query = gmailQuery(0);
  assert.match(query, /^\{from:\(.*chasetravel\.com.*\) \(subject:\(fwd OR fw\) \(.*chasetravel\.com.*\)\)\} subject:\(/);
  assert.ok(query.includes('-in:sent'));
});

test('a forwarded booking counts as from its original sender', () => {
  const text = 'Serena Tramm\n\n---------- Forwarded message ---------\nFrom: Chase Travel <donotreply@chasetravel.com>\nDate: Wed, Jul 22, 2026 at 2:40 PM\nSubject: Travel Reservation Center Trip ID # 1020860631';
  assert.equal(forwardedFrom(text), 'donotreply@chasetravel.com');
  assert.equal(guessBooker(senderDomain(forwardedFrom(text))), 'Chase Travel');
  assert.equal(forwardedFrom('Hi, WILLIAM. Here is your travel confirmation. From: the Chase Travel team'), '');
});

test('hotel markup with written-out dates and a one-line address', () => {
  assert.equal(markupDay('Friday, September 18, 2026'), '2026-09-18');
  assert.equal(markupDay('18 Sept. 2026'), '2026-09-18');
  assert.equal(markupDay('2026-09-21T12:00:00+01:00'), '2026-09-21');
  assert.equal(markupDay('soon'), null);
  const lisbon = { '@type': 'LodgingReservation', reservationNumber: 'H-VNRH6V2BTTPW', reservationStatus: 'http://schema.org/ReservationConfirmed',
    reservationFor: { '@type': 'LodgingBusiness', name: 'TURIM Terreiro do Paço Hotel', address: 'Rua do Comércio, 9, Lisbon, LI, PT' },
    checkinDate: 'Friday, September 18, 2026', checkoutDate: 'Monday, September 21, 2026' };
  assert.deepEqual(fromMarkup([lisbon], () => null), { kind: 'stay', confirmation: 'H-VNRH6V2BTTPW', cancel_kind: null, legs: [],
    stay: { name: 'TURIM Terreiro do Paço Hotel', brand: null, city: 'Lisbon', country: 'Portugal', check_in: '2026-09-18', check_out: '2026-09-21', booked_via: null } });
});

// ---------- merging flights into a trip (Nov 19, 2026) ----------
// A one-way "trip details" or check-in email used to wipe every leg on the same confirmation, so
// the Sapporo and Key West trips lost a direction.
const TZ = { LAX: 'America/Los_Angeles', ATL: 'America/New_York', EYW: 'America/New_York', DFW: 'America/Chicago', HND: 'Asia/Tokyo', CTS: 'Asia/Tokyo' };
const ctx = { msgId: 'm2', domain: 'delta.com', airport: (c) => (TZ[c] ? { tz: TZ[c], lat: 0, lon: 0 } : null), placeName: (c) => c, home: 'LAX', now: '2026-11-19T00:00:00.000Z' };
const leg = (flightNo, from, to, depLocal, arrLocal, conf = 'ABC123') => Object.fromEntries(Object.entries({ airline: 'DL', flightNo, from, to, depLocal, arrLocal, depTz: TZ[from], arrTz: TZ[to], confirmation: conf }).filter(([, v]) => v));
const email = (legs, confirmation = 'ABC123') => ({ kind: 'flight', confirmation, cancel_kind: null, stay: null,
  legs: legs.map(([n, from, to, dep, arr]) => ({ airline: 'DL', flight_no: n, from, to, dep_local: dep, arr_local: arr, aircraft: '', cabin: '' })) });
const keyWest = () => ({ id: 't1', name: 'Key West', emailMessageIds: ['m1'], legs: [
  leg('899', 'LAX', 'ATL', '2026-11-05T22:55', '2026-11-06T06:10'), leg('1281', 'ATL', 'EYW', '2026-11-06T08:55', '2026-11-06T10:47'),
  leg('1282', 'EYW', 'ATL', '2026-11-10T11:30', '2026-11-10T13:20'), leg('900', 'ATL', 'LAX', '2026-11-10T15:00', '2026-11-10T17:05')] });
const route = (t) => t.legs.map((l) => `${l.flightNo} ${l.from}-${l.to} ${l.depLocal ?? ''}`);

test('a return-only email keeps the outbound flights of the same booking', () => {
  const out = mergeBooking(email([['1282', 'EYW', 'ATL', '2026-11-10T11:45', '2026-11-10T13:35'], ['900', 'ATL', 'LAX', '2026-11-10T15:00', '2026-11-10T17:05']]), [keyWest()], [], ctx);
  assert.equal(out.status, 'updated');
  const t = out.put[1];
  assert.deepEqual(route(t), ['899 LAX-ATL 2026-11-05T22:55', '1281 ATL-EYW 2026-11-06T08:55', '1282 EYW-ATL 2026-11-10T11:45', '900 ATL-LAX 2026-11-10T15:00']);
  assert.ok(!t.needsReview);
});

test('legs with only an arrival time are kept when a one-way email arrives (Sapporo)', () => {
  const sapporo = { id: 't2', name: 'Sapporo', legs: [leg('105', 'LAX', 'HND', '2027-02-05T00:10', null, 'JDWC1P'), leg('53', 'HND', 'CTS', null, '2027-02-06T09:30', 'JDWC1P'),
    leg('82', 'CTS', 'HND', '2027-02-15T20:30', null, 'JDWC1P'), leg('106', 'HND', 'LAX', null, '2027-02-15T17:50', 'JDWC1P')] };
  const out = mergeBooking(email([['82', 'CTS', 'HND', '2027-02-15T20:30', '2027-02-15T22:05'], ['106', 'HND', 'LAX', '2027-02-15T23:55', '2027-02-15T17:50']], 'JDWC1P'), [sapporo], [], ctx);
  assert.deepEqual(out.put[1].legs.map((l) => l.flightNo), ['105', '53', '82', '106']);
  assert.equal(out.put[1].legs[2].arrLocal, '2027-02-15T22:05');
});

test('a schedule change listing both directions still replaces every leg', () => {
  const out = mergeBooking(email([['899', 'LAX', 'ATL', '2026-11-06T22:55', '2026-11-07T06:10'], ['1281', 'ATL', 'EYW', '2026-11-07T08:55', '2026-11-07T10:47'],
    ['1282', 'EYW', 'ATL', '2026-11-11T11:30', '2026-11-11T13:20'], ['900', 'ATL', 'LAX', '2026-11-11T15:00', '2026-11-11T17:05']]), [keyWest()], [], ctx);
  assert.deepEqual(route(out.put[1]), ['899 LAX-ATL 2026-11-06T22:55', '1281 ATL-EYW 2026-11-07T08:55', '1282 EYW-ATL 2026-11-11T11:30', '900 ATL-LAX 2026-11-11T15:00']);
});

test('the full booking again (same first and last day) replaces every leg', () => {
  const out = mergeBooking(email([['899', 'LAX', 'ATL', '2026-11-05T23:05', '2026-11-06T06:20'], ['1281', 'ATL', 'EYW', '2026-11-06T08:55', '2026-11-06T10:47'],
    ['1282', 'EYW', 'ATL', '2026-11-10T11:30', '2026-11-10T13:20']]), [keyWest()], [], ctx);
  assert.deepEqual(out.put[1].legs.map((l) => l.flightNo), ['899', '1281', '1282']);
});

test('flights that do not connect are saved but flagged for review', () => {
  const out = mergeBooking(email([['10', 'LAX', 'ATL', '2026-12-01T08:00', '2026-12-01T15:00'], ['11', 'DFW', 'EYW', '2026-12-01T17:00', '2026-12-01T20:00']], 'NEW999'), [], [], ctx);
  assert.equal(out.status, 'added');
  assert.equal(out.put[1].needsReview, true);
  assert.match(out.label, /don.t connect/);
  const ok = mergeBooking(email([['899', 'LAX', 'ATL', '2026-11-05T22:55', '2026-11-06T06:10']]), [keyWest()], [], ctx);
  assert.ok(!(ok.put?.[1].needsReview), 'a connected trip is not flagged');
});
