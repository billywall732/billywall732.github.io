// Sample travel for the Contrail demo: Alex & Jordan, two made-up people in Southern
// California who fly out of LAX and Burbank. About three years of trips, placed relative to
// today so there's always something coming up. The trips are fixed (no randomness), so the
// demo looks the same on every visit; only the dates move with the calendar.
import { addDays, isoDate, today } from '../shared/seed.js';

// Each trip: days from today it starts, then its legs as
// [airline, flight, from, to, day of trip, departure (local), minutes in the air, aircraft, cabin]
const TRIPS = [
  { at: -1040, name: 'Seattle', purpose: 'Friends', who: 'Alex & Jordan', pay: { method: 'card', card: 'Venture X', amount: 486.4 },
    legs: [['AS', '1371', 'LAX', 'SEA', 0, '08:05', 170, 'Boeing 737-900', 'Main'], ['AS', '1388', 'SEA', 'LAX', 3, '18:20', 165, 'Boeing 737-800', 'Main']] },
  { at: -985, name: 'New York', purpose: 'Work', who: 'Jordan', pay: { method: 'other', payer: 'Employer' }, notes: 'Client workshop in Midtown.',
    legs: [['DL', '772', 'LAX', 'JFK', 0, '07:00', 320, 'Airbus A321', 'Comfort+'], ['DL', '861', 'JFK', 'LAX', 4, '18:45', 380, 'Airbus A321', 'Comfort+']] },
  { at: -940, name: 'Winter Park', purpose: 'Vacation', who: 'Alex & Jordan', pay: { method: 'points', program: 'United MileagePlus', points: 25000, amount: 11.2, card: 'Sapphire Reserve' }, tags: ['Award ticket'],
    legs: [['UA', '1607', 'BUR', 'DEN', 0, '07:15', 135, 'Boeing 737-800', 'Economy'], ['UA', '1622', 'DEN', 'BUR', 3, '17:40', 150, 'Boeing 737-800', 'Economy']] },
  { at: -880, name: 'Tokyo & Kyoto', purpose: 'Vacation', who: 'Alex & Jordan', pay: { method: 'mixed', program: 'American AAdvantage', points: 120000, amount: 224.6, card: 'Sapphire Reserve' }, tags: ['Award ticket', 'Japan'],
    notes: 'Shinkansen to Kyoto for the middle of the trip.',
    legs: [['JL', '62', 'LAX', 'HND', 0, '11:50', 705, 'Boeing 787-9', 'Premium Economy'], ['JL', '61', 'HND', 'LAX', 10, '17:55', 600, 'Boeing 787-9', 'Premium Economy']] },
  { at: -820, name: 'Las Vegas', purpose: 'Family', who: 'Alex', pay: { method: 'card', card: 'Freedom Unlimited', amount: 138 },
    legs: [['WN', '2211', 'BUR', 'LAS', 0, '16:30', 65, 'Boeing 737-800', 'Economy'], ['WN', '3304', 'LAS', 'BUR', 2, '19:10', 70, 'Boeing 737 MAX 8', 'Economy']] },
  { at: -760, name: 'San Francisco', purpose: 'Conference', who: 'Alex', pay: { method: 'card', card: 'Sapphire Reserve', amount: 212.8 },
    legs: [['UA', '1990', 'LAX', 'SFO', 0, '09:00', 85, 'Airbus A320', 'Economy'], ['UA', '2034', 'SFO', 'LAX', 3, '19:30', 90, 'Airbus A320', 'Economy']] },
  { at: -700, name: 'Honolulu', purpose: 'Vacation', who: 'Alex & Jordan', pay: { method: 'card', card: 'Venture X', amount: 1144.2 },
    legs: [['AS', '843', 'LAX', 'HNL', 0, '08:40', 345, 'Boeing 737 MAX 9', 'Main'], ['AS', '854', 'HNL', 'LAX', 6, '13:30', 320, 'Boeing 737 MAX 9', 'Main']] },
  { at: -640, name: 'Charleston', purpose: 'Wedding', who: 'Alex & Jordan', pay: { method: 'card', card: 'Gold Card', amount: 958.1 }, notes: 'Friends’ wedding on the harbor.',
    legs: [['DL', '1188', 'LAX', 'ATL', 0, '06:30', 270, 'Boeing 757-200', 'Main'], ['DL', '2302', 'ATL', 'CHS', 0, '15:05', 75, 'Airbus A220', 'Main'],
      ['DL', '2431', 'CHS', 'ATL', 4, '11:20', 80, 'Airbus A220', 'Main'], ['DL', '1191', 'ATL', 'LAX', 4, '15:30', 290, 'Boeing 757-200', 'Main']] },
  { at: -575, name: 'Seattle', purpose: 'Friends', who: 'Jordan', pay: { method: 'points', program: 'Alaska Mileage Plan', points: 10000, amount: 5.6, card: 'Venture X' }, tags: ['Award ticket'],
    legs: [['AS', '1373', 'LAX', 'SEA', 0, '12:15', 170, 'Boeing 737-900', 'Main'], ['AS', '1390', 'SEA', 'LAX', 3, '20:05', 165, 'Boeing 737-800', 'Main']] },
  { at: -520, name: 'London & Paris', purpose: 'Vacation', who: 'Alex & Jordan', pay: { method: 'mixed', program: 'Chase Ultimate Rewards', points: 96000, amount: 412.3, card: 'Sapphire Reserve' }, tags: ['Open jaw'],
    notes: 'Into London, Eurostar to Paris, home from Paris.',
    legs: [['BA', '282', 'LAX', 'LHR', 0, '20:30', 620, 'Airbus A380', 'Premium Economy'], ['AF', '72', 'CDG', 'LAX', 10, '13:25', 690, 'Boeing 777-300ER', 'Premium Economy']] },
  { at: -450, name: 'Las Vegas', purpose: 'Event / celebration', who: 'Alex & Jordan', pay: { method: 'card', card: 'Gold Card', amount: 247 }, notes: 'Birthday weekend and a show.',
    legs: [['WN', '1412', 'BUR', 'LAS', 0, '18:05', 65, 'Boeing 737-800', 'Economy'], ['WN', '2620', 'LAS', 'BUR', 2, '20:40', 70, 'Boeing 737 MAX 8', 'Economy']] },
  { at: -390, name: 'New York', purpose: 'Work', who: 'Alex', pay: { method: 'other', payer: 'Employer' },
    legs: [['DL', '774', 'LAX', 'JFK', 0, '08:10', 320, 'Airbus A321', 'Main'], ['DL', '863', 'JFK', 'LAX', 3, '17:15', 380, 'Airbus A321', 'Main']] },
  { at: -330, name: 'Denver', purpose: 'Family', who: 'Alex & Jordan', pay: { method: 'credit', amount: 168.4, note: 'United travel credit from a cancelled flight' },
    legs: [['UA', '1611', 'BUR', 'DEN', 0, '10:30', 135, 'Boeing 737-800', 'Economy'], ['UA', '1630', 'DEN', 'BUR', 4, '20:10', 150, 'Boeing 737 MAX 9', 'Economy']] },
  { at: -260, name: 'Portland', purpose: 'Friends', who: 'Alex & Jordan', pay: { method: 'card', card: 'Venture X', amount: 392.8 },
    legs: [['AS', '1381', 'LAX', 'PDX', 0, '09:50', 145, 'Embraer 175', 'Main'], ['AS', '1394', 'PDX', 'LAX', 3, '17:45', 145, 'Embraer 175', 'Main']] },
  { at: -190, name: 'Boston', purpose: 'Conference', who: 'Jordan', pay: { method: 'card', card: 'Gold Card', amount: 431.2 },
    legs: [['DL', '1432', 'LAX', 'BOS', 0, '07:45', 330, 'Airbus A321neo', 'Comfort+'], ['DL', '1437', 'BOS', 'LAX', 3, '18:30', 395, 'Airbus A321neo', 'Comfort+']] },
  { at: -110, name: 'Oakland', purpose: 'Friends', who: 'Alex', pay: { method: 'points', program: 'Southwest Rapid Rewards', points: 9800, amount: 11.2 }, tags: ['Award ticket'],
    legs: [['WN', '1903', 'BUR', 'OAK', 0, '17:35', 75, 'Boeing 737-700', 'Economy'], ['WN', '2186', 'OAK', 'BUR', 2, '19:55', 75, 'Boeing 737-700', 'Economy']] },
  { at: -40, name: 'New York', purpose: 'Work', who: 'Alex', pay: { method: 'other', payer: 'Employer' },
    legs: [['DL', '2610', 'LAX', 'LGA', 0, '06:55', 320, 'Airbus A321', 'Main'], ['DL', '2623', 'LGA', 'LAX', 2, '16:40', 385, 'Airbus A321', 'Main']] },
  // Coming up
  { at: 12, name: 'Las Vegas', purpose: 'Family', who: 'Alex & Jordan', pay: { method: 'card', card: 'Freedom Unlimited', amount: 276 },
    legs: [['WN', '2215', 'BUR', 'LAS', 0, '15:20', 65, 'Boeing 737 MAX 8', 'Economy'], ['WN', '3310', 'LAS', 'BUR', 3, '18:45', 70, 'Boeing 737-800', 'Economy']] },
  { at: 48, name: 'Honolulu', purpose: 'Vacation', who: 'Alex & Jordan', pay: { method: 'points', program: 'Alaska Mileage Plan', points: 50000, amount: 22.4 }, tags: ['Award ticket'],
    legs: [['AS', '845', 'LAX', 'HNL', 0, '10:10', 345, 'Boeing 737 MAX 9', 'Main'], ['AS', '858', 'HNL', 'LAX', 5, '14:15', 320, 'Boeing 737 MAX 9', 'Main']] },
  { at: 131, name: 'Mexico City', purpose: 'Vacation', who: 'Alex & Jordan', pay: { method: 'card', card: 'Venture X', amount: 612.5 }, tags: ['Mexico'],
    legs: [['AM', '647', 'LAX', 'MEX', 0, '09:35', 230, 'Boeing 737 MAX 8', 'Economy'], ['AM', '646', 'MEX', 'LAX', 5, '17:20', 255, 'Boeing 737 MAX 8', 'Economy']] },
];

// Stays: [trip index or null for a drive trip, name, brand, city, country, lat, lon,
//         days after the trip starts (or from today for drive trips), nights, booked via, payment]
const STAYS = [
  [0, 'Hotel Theodore', 'Independent hotel', 'Seattle, WA', 'United States', 47.6131, -122.3369, 0, 3, 'Direct', { method: 'card', card: 'Venture X', amount: 702.6 }],
  [1, 'Hilton Garden Inn Times Square Central', 'Hilton', 'New York, NY', 'United States', 40.7595, -73.9872, 0, 4, 'Someone else booked', { method: 'other', payer: 'Employer' }],
  [2, 'Ski-in condo near the base', 'Airbnb', 'Winter Park, CO', 'United States', 39.8868, -105.7625, 0, 3, 'Airbnb', { method: 'card', card: 'Sapphire Reserve', amount: 911.3 }],
  [3, 'Andaz Tokyo Toranomon Hills', 'Hyatt', 'Tokyo', 'Japan', 35.6672, 139.7496, 1, 4, 'Direct', { method: 'points', program: 'World of Hyatt', points: 100000 }],
  [3, 'Hotel Granvia Kyoto', 'Independent hotel', 'Kyoto', 'Japan', 34.9852, 135.7585, 5, 3, 'Chase Travel', { method: 'mixed', program: 'Chase Ultimate Rewards', points: 42000, amount: 61.5, card: 'Sapphire Reserve' }],
  [3, 'Hotel Gracery Shinjuku', 'Independent hotel', 'Tokyo', 'Japan', 35.6948, 139.7020, 8, 2, 'Booking.com', { method: 'card', card: 'Sapphire Reserve', amount: 388.2 }],
  [4, 'Caesars Palace', 'Other', 'Las Vegas, NV', 'United States', 36.1162, -115.1745, 0, 2, 'Direct', { method: 'card', card: 'Freedom Unlimited', amount: 284 }],
  [5, 'Hyatt Regency San Francisco', 'Hyatt', 'San Francisco, CA', 'United States', 37.7942, -122.3957, 0, 3, 'Direct', { method: 'card', card: 'Sapphire Reserve', amount: 1048.5 }],
  [6, 'Moana Surfrider', 'Marriott', 'Honolulu, HI', 'United States', 21.2769, -157.8270, 0, 3, 'Amex Travel', { method: 'card', card: 'Gold Card', amount: 1386.7 }],
  [6, 'North Shore beach cottage', 'Airbnb', 'Haleiwa, HI', 'United States', 21.5928, -158.1034, 3, 3, 'Airbnb', { method: 'card', card: 'Venture X', amount: 1120 }],
  [7, 'The Dewberry', 'Independent hotel', 'Charleston, SC', 'United States', 32.7868, -79.9370, 0, 4, 'Direct', { method: 'card', card: 'Gold Card', amount: 1612.9 }],
  [8, 'Ballard craftsman guest suite', 'Airbnb', 'Seattle, WA', 'United States', 47.6685, -122.3840, 0, 3, 'Airbnb', { method: 'card', card: 'Venture X', amount: 498 }],
  [9, 'Hampton by Hilton London Waterloo', 'Hilton', 'London', 'United Kingdom', 51.4990, -0.1110, 1, 5, 'Capital One Travel', { method: 'mixed', program: 'Capital One Miles', points: 38000, amount: 402.1, card: 'Venture X' }],
  [9, 'Hôtel des Grands Boulevards', 'Independent hotel', 'Paris', 'France', 48.8709, 2.3477, 6, 4, 'Chase Travel', { method: 'card', card: 'Sapphire Reserve', amount: 1290.4 }],
  [10, 'Wynn Las Vegas', 'Independent hotel', 'Las Vegas, NV', 'United States', 36.1265, -115.1657, 0, 2, 'Direct', { method: 'card', card: 'Gold Card', amount: 618 }],
  [11, 'Moxy NYC Chelsea', 'Marriott', 'New York, NY', 'United States', 40.7457, -73.9890, 0, 3, 'Someone else booked', { method: 'other', payer: 'Employer' }],
  [13, 'Kimpton RiverPlace', 'IHG', 'Portland, OR', 'United States', 45.5111, -122.6720, 0, 3, 'Direct', { method: 'points', program: 'IHG One Rewards', points: 84000 }],
  [14, 'Hyatt Place Boston/Seaport District', 'Hyatt', 'Boston, MA', 'United States', 42.3474, -71.0410, 0, 3, 'Direct', { method: 'card', card: 'Gold Card', amount: 897.3 }],
  [16, 'Courtyard New York LaGuardia Airport', 'Marriott', 'New York, NY', 'United States', 40.7660, -73.8710, 0, 2, 'Someone else booked', { method: 'other', payer: 'Employer' }],
  [18, 'Outrigger Reef Waikiki Beach Resort', 'Independent hotel', 'Honolulu, HI', 'United States', 21.2795, -157.8340, 0, 5, 'Capital One Travel', { method: 'mixed', program: 'Capital One Miles', points: 60000, amount: 340.8, card: 'Venture X' }],
  [19, 'Hyatt Regency Mexico City', 'Hyatt', 'Mexico City', 'Mexico', 19.4270, -99.1930, 0, 5, 'Direct', { method: 'points', program: 'World of Hyatt', points: 60000 }],
  // Drive trips (no flights)
  [null, 'Big Bear Lake cabin', 'Vrbo', 'Big Bear Lake, CA', 'United States', 34.2439, -116.9114, -905, 2, 'Vrbo', { method: 'card', card: 'Venture X', amount: 476 }],
  [null, 'Ojai Valley Inn', 'Independent hotel', 'Ojai, CA', 'United States', 34.4492, -119.2563, -600, 2, 'Amex Travel', { method: 'card', card: 'Gold Card', amount: 1104 }],
  [null, 'Desert modern house with pool', 'Airbnb', 'Palm Springs, CA', 'United States', 33.8303, -116.5453, -300, 3, 'Airbnb', { method: 'card', card: 'Venture X', amount: 1260 }],
  [null, 'Hotel Californian', 'Independent hotel', 'Santa Barbara, CA', 'United States', 34.4141, -119.6905, -75, 2, 'Capital One Travel', { method: 'card', card: 'Venture X', amount: 860.5 }],
];

// The cards Alex & Jordan hold, for lounge access (keys from shared/data/cards.json)
const CARDS = [
  { key: 'csr', name: 'Sapphire Reserve', owner: 'Alex' },
  { key: 'cfu', name: 'Freedom Unlimited', owner: 'Alex' },
  { key: 'vx', name: 'Venture X', owner: 'Jordan' },
  { key: 'amexgold', name: 'Gold Card', owner: 'Jordan' },
];

// Wall-clock time at an airport → UTC ms, and back (same approach as the original Contrail)
function tzOffsetMin(tz, utcMs) {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(utcMs));
  const g = (t) => +p.find((x) => x.type === t).value;
  return (Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute')) - utcMs) / 60000;
}
function localToUtc(s, tz) {
  const [d, t] = s.split('T'); const [y, m, da] = d.split('-').map(Number); const [h, mi] = t.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, da, h, mi);
  const u = guess - tzOffsetMin(tz, guess) * 60000;
  return guess - tzOffsetMin(tz, u) * 60000;
}
function utcToLocal(ms, tz) {
  const d = new Date(ms + tzOffsetMin(tz, ms) * 60000);
  return d.toISOString().slice(0, 16);
}

// The demo, as store.reset() takes it. `airport(code)` looks up shared/data/airports.json.
export function contrailDemo(airport) {
  const t0 = today();
  const trips = TRIPS.map((t, i) => ({
    id: `demo-trip-${i + 1}`,
    name: t.name, purpose: t.purpose, who: t.who, notes: t.notes ?? '', tags: t.tags ?? [], pay: t.pay ?? null,
    source: 'manual', hidden: false,
    legs: t.legs.map(([airline, flightNo, from, to, day, dep, mins, aircraft, cabin]) => {
      const depLocal = `${isoDate(addDays(t0, t.at + day))}T${dep}`;
      const depTz = airport(from).tz, arrTz = airport(to).tz;
      return { airline, flightNo, from, to, depLocal, arrLocal: utcToLocal(localToUtc(depLocal, depTz) + mins * 60000, arrTz), depTz, arrTz, aircraft, cabin, confirmation: '' };
    }),
  }));
  const stays = STAYS.map(([ti, name, brand, city, country, lat, lon, day, nights, bookedVia, pay], i) => {
    const start = addDays(t0, (ti == null ? 0 : TRIPS[ti].at) + day);
    return { id: `demo-stay-${i + 1}`, name, brand, city, country, lat, lon,
      checkIn: isoDate(start), checkOut: isoDate(addDays(start, nights)), bookedVia, pay, notes: '',
      trip: ti == null ? '' : `demo-trip-${ti + 1}`, source: 'manual', hidden: false };
  });
  return {
    collections: { trips, stays },
    docs: { profile: { displayName: 'Alex & Jordan', homeAirports: ['LAX', 'BUR'], cards: CARDS } },
  };
}
