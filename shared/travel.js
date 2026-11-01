// The travel summary What's in My Wallet? reads for its Travel profile tab: the same shape the
// original Contrail synced weekly, now built straight from the trips and stays.
import { airlineName, airport, destOf, nightsOf, placeName, RENTAL } from './trips.js';

export const PAY_LABEL = { card: 'Credit card', cash: 'Cash or debit', points: 'Points or miles', mixed: 'Points + cash', credit: 'Travel credit or voucher', other: 'Someone else paid' };

const countTop = (arr, n) => { const m = {}; arr.forEach((x) => { m[x] = (m[x] || 0) + 1; }); return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, n); };
const sumBy = (arr, key, val) => { const m = {}; arr.forEach((x) => { const k = key(x); if (k) m[k] = (m[k] || 0) + val(x); }); return Object.entries(m).sort((a, b) => b[1] - a[1]); };
const intl = (t) => t.legs.some((l) => airport(l.o)?.cc !== 'US' || airport(l.d)?.cc !== 'US');

// trips: derived (shared/trips.js deriveTrip); stays as stored; profile: { displayName, homeAirports }
export function travelSummary(trips, stays, profile, now = Date.now()) {
  if (!trips.length && !stays.length) return null;
  const home = profile?.homeAirports?.[0] || 'LAX';
  const legs = trips.flatMap((t) => t.legs.map((l) => ({ ...l, t })));
  const past = trips.filter((t) => t.end < now);
  const years = [...new Set(trips.map((t) => t.startLocal.slice(0, 4)))].sort();
  const paid = trips.filter((t) => t.pay?.method);
  const payKey = (p) => (p.method === 'card' ? p.card || 'Credit card' : p.method === 'other' ? 'Paid by someone else' : PAY_LABEL[p.method] + (p.program ? ` (${p.program})` : ''));
  const nights = stays.reduce((a, s) => a + nightsOf(s), 0);
  const hotelNights = stays.filter((s) => !RENTAL.has(s.brand)).reduce((a, s) => a + nightsOf(s), 0);
  return {
    source: 'Contrail', generatedAt: new Date(now).toISOString(), traveler: profile?.displayName || '',
    home: `${home}${profile?.homeAirports?.length > 1 ? ` (also uses ${profile.homeAirports.slice(1).join(', ')})` : ''}`,
    span: years.length ? `${years[0]}-${years[years.length - 1]}` : '',
    totals: {
      trips: trips.length, flights: legs.length,
      milesFlown: Math.round(past.flatMap((t) => t.legs).reduce((s, l) => s + l.mi, 0)),
      internationalTrips: trips.filter(intl).length,
      stays: stays.length, nights, hotelNights, rentalNights: nights - hotelNights,
    },
    flightsPerYear: years.map((y) => ({ year: y, flights: legs.filter((l) => l.t.startLocal.startsWith(y)).length })),
    airlines: countTop(legs.map((l) => airlineName(l.airline)), 6).map(([name, flights]) => ({ name, flights })),
    departureAirports: countTop(legs.map((l) => l.o), 8).map(([code, flights]) => ({ code, flights })),
    destinations: countTop(trips.map((t) => placeName(destOf(t, home))), 8).map(([place, n]) => ({ place, trips: n })),
    international: trips.filter(intl).map((t) => t.name),
    upcoming: trips.filter((t) => t.end >= now).sort((a, b) => a.start - b.start)
      .map((t) => ({ trip: t.name, start: t.startLocal.slice(0, 10), carrier: t.carrier, route: t.seq.filter((c) => c !== '·').join('-') })),
    hotelBrands: sumBy(stays, (s) => s.brand, nightsOf).map(([brand, n]) => ({ brand, nights: n })),
    stayBooking: sumBy(stays, (s) => s.bookedVia || 'Not set', nightsOf).map(([channel, n]) => ({ channel, nights: n })),
    flightPayment: countTop(paid.map((t) => payKey(t.pay)), 20).map(([method, n]) => ({ method, trips: n })),
    pointsUsed: [
      ...paid.filter((t) => +t.pay.points && t.pay.method !== 'other').map((t) => ({ program: t.pay.program || 'points', points: +t.pay.points, for: `${t.name} flights` })),
      ...stays.filter((s) => +s.pay?.points && s.pay.method !== 'other').map((s) => ({ program: s.pay.program || 'points', points: +s.pay.points, for: s.name })),
    ],
    paidBySomeoneElse: [
      ...paid.filter((t) => t.pay.method === 'other').map((t) => `${t.name} flights (${t.pay.payer || 'someone else'})`),
      ...stays.filter((s) => s.pay?.method === 'other').map((s) => `${s.name} (${s.pay.payer || 'someone else'})`),
    ],
  };
}
