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
