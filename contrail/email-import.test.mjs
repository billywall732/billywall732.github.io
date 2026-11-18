import assert from 'node:assert/strict';
import test from 'node:test';
import { gmailQuery, gmailSince, guessBrand, guessBooker } from './email-import.js';

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
  const words = /subject:\((.*?)\) -category/.exec(query)[1].split(' OR ').map((w) => w.replace(/"/g, '').toLowerCase());
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
