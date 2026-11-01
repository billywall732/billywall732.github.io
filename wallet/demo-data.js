// Sample wallet for the What's in My Wallet? demo: Alex & Jordan (the same made-up couple as the
// Contrail demo). Real card products with terms from shared/data/cards.json; open dates are set
// relative to today so renewals, bonus deadlines and 5/24 drop-offs spread over the coming year.
import { addDays, isoDate, today } from '../shared/seed.js';

// [catalog key, owner, renews in (days), years held, color, last 4, extras]
const CARDS = [
  ['csr', 'alex', 40, 2, '#0b0b0d', '4417', { role: 'keeper', used: [180], perkValue: 150, creditLimit: 22000, strategy: 'Keep while the travel credit and lounge visits cover the fee. Revisit if we stop flying monthly.' }],
  ['cfu', 'alex', 200, 6, '#174f8a', '9921', { role: 'keeper', creditLimit: 12000 }],
  ['doublecash', 'alex', 310, 8, '#2d2d34', '7782', { role: 'keeper', creditLimit: 9000 }],
  ['bilt', 'alex', 160, 1, '#2d2d34', '3150', { role: 'keeper', creditLimit: 8000, notes: 'Rent goes on this one.' }],
  ['vx', 'jordan', 25, 3, '#1e3a5f', '6604', { role: 'keeper', used: [300], perkValue: 100, creditLimit: 30000 }],
  ['amexgold', 'jordan', 295, 0, '#7a5a1a', '1009', { role: 'rotating', used: [50, 40, 0], sub: { amount: 100000, standard: 60000, promo: true, spendReq: 6000, spent: 3400, deadlineIn: 20 }, strategy: 'Earn the bonus, then decide at the first renewal: keep if the dining and Uber credits get used, otherwise downgrade.' }],
  ['cff', 'jordan', 120, 2, '#0f4c45', '2288', { role: 'keeper', creditLimit: 7500 }],
];

export function walletDemo(catalog) {
  const t0 = today(), byKey = Object.fromEntries(catalog.map((c) => [c.key, c]));
  const id = (k, o) => `demo-${o}-${k}`;
  const cards = CARDS.map(([key, owner, renewIn, years, color, last4, x]) => {
    const c = byKey[key];
    const open = addDays(t0, renewIn - 365 * (years + 1));
    const sub = x.sub
      ? { amount: x.sub.amount, standard: x.sub.standard, promo: x.sub.promo, spendReq: x.sub.spendReq, spent: x.sub.spent, deadline: isoDate(addDays(t0, x.sub.deadlineIn)), received: false, receivedDate: '' }
      : { amount: 0, standard: 0, promo: false, spendReq: 0, spent: 0, deadline: '', received: years > 0, receivedDate: years > 0 ? isoDate(addDays(open, 100)) : '' };
    return {
      id: id(key, owner), name: c.name, issuer: c.issuer, network: c.network || 'Visa', last4, kind: 'personal', status: 'open', color,
      openDate: isoDate(open), annualFee: c.annualFee, program: c.program, base: c.base, mult: { ...c.mult },
      sub, credits: c.credits.map((cr, i) => ({ id: `${id(key, owner)}-cr${i}`, name: cr.name, value: cr.value, period: cr.period, used: x.used?.[i] ?? 0, log: [] })),
      perks: c.perks.map((p) => ({ ...p })), perkValue: x.perkValue ?? 0, downgradeTo: c.downgradeTo, reapplyMonths: c.reapplyMonths,
      role: x.role, strategy: x.strategy ?? '', creditLimit: x.creditLimit ?? 0, notes: x.notes ?? '', owner, origin: 'new',
    };
  });
  return {
    version: 2,
    settings: { pointValues: { 'Chase Ultimate Rewards': 1.5, 'Amex Membership Rewards': 1.6, 'Capital One Miles': 1.5, 'Citi ThankYou': 1.5, 'Bilt Rewards': 1.6, 'Cash back': 1.0, 'Airline miles': 1.2, 'Hotel points': 0.6, Other: 1.0 }, rentAdded: false },
    profiles: [{ id: 'alex', name: 'Alex' }, { id: 'jordan', name: 'Jordan' }], activeProfile: 'all',
    cards,
    pulls: [
      { id: 'demo-pull-1', date: isoDate(addDays(t0, -72)), bureau: 'Experian', issuer: 'American Express', note: 'Gold Card application', owner: 'jordan' },
      { id: 'demo-pull-2', date: isoDate(addDays(t0, -205)), bureau: 'TransUnion', issuer: 'Wells Fargo', note: 'Bilt Mastercard application', owner: 'alex' },
    ],
    research: [
      { id: 'demo-watch-1', name: 'Alaska Airlines Visa Signature', issuer: 'Bank of America', annualFee: 95, bonus: '', status: 'considering', notes: 'We fly Alaska to Seattle and Hawaii. The companion fare could pay for itself.' },
      { id: 'demo-watch-2', name: 'World of Hyatt', issuer: 'Chase', annualFee: 95, bonus: '', status: 'considering', notes: 'Most of our hotel points go to Hyatt.' },
    ],
    chat: [],
    updatedAt: Date.now(),
  };
}
