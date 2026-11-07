// Contrail: a flight and hotel log. Ported from the claude.ai version (trip strips, route map,
// stays, airports and lounges, lounge access by card) onto shared/store.js, with forms to add
// flights and stays, CSV and JSON import, and a Settings tab. Card research (Claude) is gone
// from this app; What's in My Wallet? covers it.
/* global d3, topojson */
import { store } from '/shared/store.js';
import { airlineName, AIRLINES, airport, deriveTrip, destOf as destFrom, loadAirports, localToUtc, miles, nightsOf, placeName, RENTAL, tzOffsetMin } from '/shared/trips.js';
import { PAY_LABEL } from '/shared/travel.js';
import { demoBanner, saveFile, setUpApp } from '/shared/app-shell.js';
import { addDays, isoDate } from '/shared/seed.js';
import { contrailDemo } from '/contrail/demo-data.js';
import { parseFlightsCsv, CSV_HELP } from '/contrail/csv.js';
import { BackupError, checkBackup } from '/contrail/backup.js';

setUpApp();
const root = document.querySelector('.contrail-app');
const $id = (id) => document.getElementById(id);
const prefs = { get(k) { try { return localStorage.getItem('contrail-' + k); } catch { return null; } }, set(k, v) { try { localStorage.setItem('contrail-' + k, v); } catch { /* private mode */ } } };
const NOW = Date.now();
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- reference data ----------
const AIRPORT_MAP = await loadAirports();
const AIRPORT_LIST = Object.values(AIRPORT_MAP);
const [CDATA, LDATA, WORLD] = await Promise.all([
  fetch('/shared/data/cards.json').then((r) => r.json()),
  fetch('/shared/data/lounges.json').then((r) => r.json()),
  fetch('https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-110m.json').then((r) => r.json()),
]);
const land = topojson.feature(WORLD, WORLD.objects.countries);

// The original's airport shape: n name, c "City, ST", cc country, lat, lon, tz
const A = (code) => { const a = airport(code); return a && { n: a.name, c: placeName(code), cc: a.country, lat: a.lat, lon: a.lon, tz: a.tz }; };

// Lounges by airport, in the original's shape: { note, l: [[name, where, notes, tags, record]] }
const ACCESS = LDATA.access;
const LOUNGES = {};
for (const [code, a] of Object.entries(LDATA.airports)) LOUNGES[code] = { ...a, l: [] };
for (const x of LDATA.lounges) (LOUNGES[x.airport] ??= { note: '', l: [] }).l.push([x.name, x.terminal, x.notes, x.access, x]);

const CARD_CATALOG = CDATA.cards.map((c) => ({ k: c.key, n: c.membership || c.name.startsWith(c.issuer) ? c.name : `${c.issuer} ${c.name}`, short: c.name, t: c.access, b: c.summary, lim: !!c.limited }));
const CAT = Object.fromEntries(CARD_CATALOG.map((c) => [c.k, c]));

const PURPOSES = ['Vacation', 'Work', 'Family', 'Friends', 'Wedding', 'Event / celebration', 'Conference', 'Other'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
function fmtDay(s) { const [y, m, d] = s.slice(0, 10).split('-').map(Number); const dt = new Date(Date.UTC(y, m - 1, d)); return `${DOW[dt.getUTCDay()]} ${MON[m - 1]} ${d}`; }
function fmtTime(s) { let [h, m] = s.slice(11).split(':').map(Number); const ap = h < 12 ? 'am' : 'pm'; h = h % 12 || 12; return `${h}:${String(m).padStart(2, '0')}${ap}`; }
function fmtDur(min) { const h = Math.floor(min / 60), m = Math.round(min % 60); return `${h}h ${String(m).padStart(2, '0')}m`; }
const money = (v) => '$' + Number(v).toLocaleString(undefined, { minimumFractionDigits: Number(v) % 1 ? 2 : 0, maximumFractionDigits: 2 });

// ---------- state, loaded from the store ----------
let TRIPS = [], RAW = {}, STAYS = [], PROFILE = null, WALLET = [], HOME = 'LAX', OWNER = '', visits = {};
const destOf = (t) => destFrom(t, HOME);

async function load() {
  PROFILE = (await store.getDoc('profile')) || { displayName: '', homeAirports: ['LAX'], cards: [] };
  HOME = (PROFILE.homeAirports || [])[0] || 'LAX';
  OWNER = PROFILE.displayName || 'Me';
  WALLET = (PROFILE.cards || []).map((c, i) => ({ id: c.id || `c${i}`, ...c }));
  const recs = (await store.list('trips')).filter((t) => !t.hidden);
  RAW = Object.fromEntries(recs.map((r) => [r.id, r]));
  TRIPS = recs.map(deriveTrip).filter(Boolean).sort((a, b) => b.start - a.start);
  STAYS = sortStays((await store.list('stays')).filter((s) => !s.hidden).map(toStay));
  visits = {};
  TRIPS.forEach((t) => t.legs.forEach((l) => { [l.o, l.d].forEach((c) => { visits[c] ||= { n: 0, trips: new Set() }; visits[c].trips.add(t.id); }); visits[l.o].n++; visits[l.d].n++; }));
  if (!visits[selApt]) selApt = visits[HOME] ? HOME : Object.keys(visits)[0] || HOME;
  recomputeAccess();
}

// Trip details live on the trip; the forms below were written for a flat "note" object
const noteFromPay = (p) => (p ? { pay: p.method || '', payCard: p.card, payProgram: p.program, payPoints: p.points, payAmount: p.amount, payer: p.payer, flyingWith: p.with, payNote: p.note } : { pay: '' });
const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== '' && v !== null));
const payFromNote = (n) => (n.pay ? clean({ method: n.pay, card: n.payCard, program: n.payProgram, points: n.payPoints, amount: n.payAmount, payer: n.payer, with: n.flyingWith, note: n.payNote }) : null);
const noteOf = (t) => ({ purpose: t.purpose || '', details: t.notes || '', ...noteFromPay(t.pay) });
const noteEmpty = (d) => !d.purpose && !d.details && !d.pay;

// Stays: the stored shape ↔ the original's (nights instead of check-out, flat payment fields)
function toStay(r) { return { ...noteFromPay(r.pay), id: r.id, name: r.name, brand: r.brand, city: r.city, country: r.country, lat: r.lat, lon: r.lon, checkIn: r.checkIn, nights: nightsOf(r), rooms: r.rooms, trip: r.trip, booked: r.bookedVia, note: r.notes, source: r.source }; }
function fromStay(d, prev = {}) {
  const out = { ...prev, name: d.name, brand: d.brand, city: d.city, country: d.country, checkIn: d.checkIn, checkOut: d.checkIn.length === 10 ? isoDate(addDays(new Date(d.checkIn + 'T12:00:00'), d.nights)) : '',
    nights: d.checkIn.length === 10 ? undefined : d.nights, rooms: d.rooms, trip: d.trip || '', bookedVia: d.booked || '', notes: d.note || '', pay: payFromNote(d), updatedAt: new Date().toISOString() };
  if (d.lat != null) { out.lat = d.lat; out.lon = d.lon; }
  out.source ||= 'manual';
  return clean(out);
}

// ---------- timing tiers ----------
let SOON = +(prefs.get('soon') || 30);
const nearDays = () => Math.max(SOON * 4, 90);
function daysTo(t) { return Math.ceil((t.start - NOW) / 864e5); }
function tierOf(t) {
  if (t.start <= NOW && t.end >= NOW) return 'now';
  if (t.end < NOW) return 'past';
  const d = daysTo(t);
  return d <= SOON ? 'soon' : d <= nearDays() ? 'near' : 'later';
}
const TIER = {
  now: { label: 'In progress', c: 'var(--t-now)' },
  soon: { label: 'Soon', c: 'var(--t-soon)' },
  near: { label: 'Coming up', c: 'var(--t-near)' },
  later: { label: 'Booked', c: 'var(--m-later)' },
  past: { label: 'Flown', c: 'var(--m-past)' },
};
const stripColor = (tr) => (tr === 'past' ? 'var(--past)' : tr === 'later' ? 'var(--t-later)' : TIER[tr].c);
const isFuture = (t) => t.end >= NOW;
const upList = () => TRIPS.filter(isFuture).sort((a, b) => a.start - b.start);
const pastList = () => TRIPS.filter((t) => !isFuture(t));

// ---------- header ----------
function renderNext() {
  const t = upList()[0], el = $id('next');
  if (!t) { el.hidden = false; el.style.setProperty('--tc', 'var(--line)'); el.innerHTML = `<div><span class="eyebrow">Next departure</span><div class="route" style="font-size:24px">Nothing booked</div></div><div class="meta">Add a flight on the Trips tab and the countdown starts here.</div><div></div>`; return; }
  el.hidden = false;
  const tr = tierOf(t), d = daysTo(t), l = t.legs[0];
  el.style.setProperty('--tc', stripColor(tr));
  el.innerHTML = `<div><span class="eyebrow">${tr === 'now' ? 'Traveling now' : 'Next departure'} · ${TIER[tr].label}</span><div class="route">${l.o}<i>→</i>${destOf(t)}</div></div>
  <div class="meta"><b>${esc(t.name)}</b>${t.purpose ? ` · ${esc(t.purpose)}` : ''} · ${l.dep ? `${fmtDay(l.dep)}, ${fmtTime(l.dep)} · ` : ''}${esc(l.f)}${t.who ? ` · ${esc(t.who)}` : ''}</div>
  <div class="count num">${tr === 'now' ? 'Now' : d}<small>${tr === 'now' ? 'on the road' : d === 1 ? 'day to go' : 'days to go'}</small></div>`;
}
let YEARS = new Set(); // empty = all years
let REGION = 'all';
const REGION_LABEL = { all: 'USA & international', us: 'USA only', intl: 'International only' };
const isIntl = (t) => t.legs.some((l) => A(l.o).cc !== 'United States' || A(l.d).cc !== 'United States');
const inRegion = (t) => REGION === 'all' || (REGION === 'intl') === isIntl(t);
const stayInRegion = (st) => REGION === 'all' || (REGION === 'intl') === (String(st.country || 'United States').trim() !== 'United States');
// Airline: trips with at least one flight on it ('all' = any airline)
let AIRLINE = 'all';
const onAirline = (t) => AIRLINE === 'all' || t.legs.some((l) => l.airline === AIRLINE);
const inYear = (t) => (YEARS.size === 0 || YEARS.has(t.startLocal.slice(0, 4))) && inRegion(t) && onAirline(t);
const filtered = () => YEARS.size > 0 || REGION !== 'all' || AIRLINE !== 'all';
const yearLabel = () => [YEARS.size === 0 ? (REGION === 'all' && AIRLINE === 'all' ? 'All years' : '') : [...YEARS].sort().join(', '), REGION === 'all' ? '' : REGION_LABEL[REGION], AIRLINE === 'all' ? '' : airlineName(AIRLINE)].filter(Boolean).join(' · ');
function renderStats() {
  const past = pastList().filter(inYear), up = upList().filter(inYear);
  const pl = past.flatMap((t) => t.legs), ul = up.flatMap((t) => t.legs);
  const mi = pl.reduce((s, l) => s + l.mi, 0), hrs = past.reduce((s, t) => s + t.mins, 0) / 60;
  const apts = new Set(pl.flatMap((l) => [l.o, l.d])), ctry = new Set([...apts].map((c) => A(c).cc));
  const items = [[pl.length, 'Flights flown'], [Math.round(mi).toLocaleString(), 'Miles flown'], [Math.round(hrs), 'Hours in the air'], [apts.size, 'Airports'], [ctry.size, 'Countries'], [ul.length, 'Flights booked']];
  const ns = [...past, ...up].map(noteOf).filter((n) => n.pay);
  if (ns.length) {
    const cash = ns.filter((n) => n.pay !== 'other').reduce((s, n) => s + (+n.payAmount || 0), 0);
    const pts = ns.reduce((s, n) => s + (+n.payPoints || 0), 0);
    const byOthers = ns.filter((n) => n.pay === 'other').length;
    if (cash) items.push([money(Math.round(cash)), 'Paid in cash']);
    if (pts) items.push([pts >= 1e5 ? Math.round(pts / 1000) + 'k' : pts.toLocaleString(), 'Points redeemed']);
    if (byOthers) items.push([byOthers, byOthers === 1 ? 'Trip paid by others' : 'Trips paid by others']);
  }
  const sn = STAYS.filter((st) => (YEARS.size === 0 || YEARS.has(String(st.checkIn).slice(0, 4))) && stayInRegion(st)).reduce((a, st) => a + (+st.nights || 0), 0);
  if (sn) items.push([sn, 'Nights in stays']);
  const yl = yearLabel();
  const fs = $id('filtSum'); if (fs) fs.textContent = filtered() ? yl : '';
  const cf = $id('clearFilt'); if (cf) cf.hidden = !filtered();
  const el = $id('stats'), n = items.length + 1; // + "Showing"
  // Two full rows: half as many columns as cards (an odd count gives "Showing" two slots)
  el.classList.add('balanced'); el.classList.toggle('odd', n % 2 === 1); el.style.setProperty('--cols', Math.ceil(n / 2));
  el.innerHTML = `<div class="stat"><b>${yl}</b><span>Showing</span></div>` + items.map(([v, k]) => `<div class="stat"><b class="num">${v}</b><span>${k}</span></div>`).join('');
}

function renderLegend() {
  const nd = nearDays();
  $id('legend').innerHTML = [
    `<span><i class="sw" style="--c:var(--t-now)"></i>In progress</span>`,
    `<span><i class="sw dash" style="--c:var(--t-soon)"></i>Soon · within ${SOON} days</span>`,
    `<span><i class="sw dash" style="--c:var(--t-near)"></i>Coming up · ${SOON + 1}–${nd} days</span>`,
    `<span><i class="sw dash" style="--c:var(--m-later)"></i>Booked · ${nd + 1}+ days</span>`,
    `<span><i class="sw" style="--c:var(--m-past)"></i>Flown</span>`,
    `<span><i class="sw" style="--c:var(--accent);height:10px;width:10px;border-radius:50%"></i>Home (${esc(HOME)})</span>`,
  ].join('');
}

// ---------- map ----------
const svg = d3.select('#map'), mapbox = $id('mapbox');
let W = 1000, H = 520;
const grat = d3.geoGraticule10();
const proj = d3.geoNaturalEarth1();
const gp = d3.geoPath(proj);
const gZoom = svg.append('g'), gLand = gZoom.append('g'), gArc = gZoom.append('g'), gDot = svg.append('g');
let view = 'all', selTrip = null, selApt = 'LAX', zt = d3.zoomIdentity, ptsXY = [];
const zoom = d3.zoom().scaleExtent([1, 12]).on('zoom', (e) => { zt = e.transform; gZoom.attr('transform', zt); placeDots(); });
svg.call(zoom).on('dblclick.zoom', null);

function fitTo(codes) {
  codes = codes.filter((c) => A(c));
  if (new Set(codes).size < 2) codes = [HOME, 'JFK', 'MIA'].filter((c) => A(c));
  const pts = { type: 'MultiPoint', coordinates: codes.map((c) => [A(c).lon, A(c).lat]) };
  const lons = codes.map((c) => A(c).lon);
  proj.rotate([codes.some((c) => A(c).lon > 100) ? 150 : -d3.mean(lons), 0]);
  proj.fitExtent([[60, 50], [W - 60, H - 50]], pts);
}
function sizeMap() {
  if (mapbox.classList.contains('expanded')) {
    const r = mapbox.querySelector('.mapstage').getBoundingClientRect();
    H = Math.max(300, Math.round(W * r.height / Math.max(r.width, 1)));
  } else H = 520;
  svg.attr('viewBox', `0 0 ${W} ${H}`);
}
function visibleTrips() { return TRIPS.filter((t) => inYear(t) && (view === 'all' || (view === 'up' ? isFuture(t) : !isFuture(t)))); }
function draw() {
  if (mapbox.hidden) return;
  sizeMap();
  const trips = visibleTrips();
  const shown = selTrip ? [selTrip] : trips;
  const codes = [...new Set(shown.flatMap((t) => t.legs.flatMap((l) => [l.o, l.d])))];
  fitTo(codes.length > 1 ? codes : [HOME, ...codes]);
  gLand.selectAll('*').remove();
  gLand.append('path').datum({ type: 'Sphere' }).attr('class', 'sea').attr('d', gp);
  gLand.append('path').datum(grat).attr('class', 'grat').attr('d', gp);
  gLand.append('path').datum(land).attr('class', 'landp').attr('d', gp);
  const segs = [], seen = new Set();
  trips.forEach((t) => { const tr = tierOf(t); t.legs.forEach((l) => { const k = [l.o, l.d].sort().join('-') + tr + (selTrip === t ? 's' : ''); if (seen.has(k) && selTrip !== t) return; seen.add(k); segs.push({ t, l, tr }); }); });
  const rank = { past: 0, later: 1, near: 2, soon: 3, now: 4 };
  segs.sort((a, b) => (a.t === selTrip) - (b.t === selTrip) || rank[a.tr] - rank[b.tr]);
  const line = (d) => gp({ type: 'LineString', coordinates: [[A(d.l.o).lon, A(d.l.o).lat], [A(d.l.d).lon, A(d.l.d).lat]] });
  gArc.selectAll('*').remove();
  gArc.selectAll('path.halo').data(segs.filter((s) => (selTrip ? s.t === selTrip : s.tr === 'soon' || s.tr === 'now'))).join('path').attr('class', 'arc halo').attr('d', line);
  gArc.selectAll('path.r').data(segs).join('path')
    .attr('class', (d) => 'r arc ' + (d.tr === 'past' ? 'past' : 'future') + (selTrip ? (d.t === selTrip ? ' hl' : ' dim') : (d.tr === 'soon' || d.tr === 'now' ? ' hl' : '')))
    .style('--c', (d) => TIER[d.tr].c).attr('d', line);
  const all = [...new Set(trips.flatMap((t) => t.legs.flatMap((l) => [l.o, l.d])))];
  const soonApts = new Set(trips.filter((t) => ['soon', 'now'].includes(tierOf(t))).map(destOf));
  ptsXY = all.map((c) => ({ c, p: proj([A(c).lon, A(c).lat]), soon: soonApts.has(c) }));
  gDot.selectAll('*').remove();
  const g = gDot.selectAll('g').data(ptsXY).join('g').attr('class', 'ap').on('click', (e, d) => selectApt(d.c, true));
  g.filter((d) => d.soon).append('circle').attr('class', 'ring').attr('r', 6);
  g.append('circle').attr('r', (d) => (d.c === HOME ? 5.5 : 3.8)).attr('class', (d) => 'dot' + (d.c === HOME ? ' home' : '') + (d.c === selApt && d.c !== HOME ? ' sel' : ''));
  g.append('title').text((d) => `${d.c} · ${A(d.c).c}`);
  g.append('text').attr('class', 'lbl').text((d) => d.c);
  svg.call(zoom.transform, d3.zoomIdentity);
  $id('resetMap').hidden = !selTrip;
}
function placeDots() {
  const pos = ptsXY.map((d) => ({ d, xy: zt.apply(d.p) }));
  gDot.selectAll('g.ap').attr('transform', (d) => `translate(${zt.apply(d.p)})`).attr('display', (d) => { const [x, y] = zt.apply(d.p); return (x < -20 || x > W + 20 || y < -20 || y > H + 20) ? 'none' : null; });
  gDot.selectAll('text.lbl').each(function (d) {
    const me = zt.apply(d.p); let dx = 6, dy = -6, anchor = 'start';
    pos.forEach((o) => { if (o.d === d) return; const ddx = o.xy[0] - me[0], ddy = o.xy[1] - me[1];
      if (Math.abs(ddx) < 34 && Math.abs(ddy) < 14) { if (ddx > 0) { anchor = 'end'; dx = -6; } if (ddy < 0) dy = 12; } });
    d3.select(this).attr('x', dx).attr('y', dy).attr('text-anchor', anchor);
  });
}
$id('zin').onclick = () => svg.transition().duration(250).call(zoom.scaleBy, 1.6);
$id('zout').onclick = () => svg.transition().duration(250).call(zoom.scaleBy, 1 / 1.6);
$id('zfit').onclick = () => svg.transition().duration(250).call(zoom.transform, d3.zoomIdentity);

root.querySelectorAll('.maptools .tab').forEach((b) => b.addEventListener('click', () => {
  view = b.dataset.v; selTrip = null;
  root.querySelectorAll('.maptools .tab').forEach((x) => x.setAttribute('aria-selected', x === b));
  prefs.set('view', view); renderTrips(); draw();
}));
$id('resetMap').addEventListener('click', () => { selTrip = null; renderTrips(); draw(); });
const styleSel = $id('styleSel');
styleSel.addEventListener('change', () => { mapbox.dataset.mapstyle = styleSel.value; prefs.set('mapstyle', styleSel.value); });
const expBtn = $id('expandMap');
function setExpanded(on) {
  mapbox.classList.toggle('expanded', on); document.body.classList.toggle('noscroll', on);
  expBtn.textContent = on ? 'Close full view' : 'Expand map'; expBtn.setAttribute('aria-pressed', on);
  requestAnimationFrame(draw);
}
expBtn.addEventListener('click', () => setExpanded(!mapbox.classList.contains('expanded')));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && mapbox.classList.contains('expanded')) setExpanded(false); });
let rt; window.addEventListener('resize', () => { if (!mapbox.classList.contains('expanded')) return; clearTimeout(rt); rt = setTimeout(draw, 150); });
$id('soonSel').addEventListener('change', (e) => { SOON = +e.target.value; prefs.set('soon', SOON); renderLegend(); renderNext(); renderTrips(); draw(); });

// ---------- trips ----------
function legHTML(l) {
  const dep = l.dep ? `<b>${l.o}</b><span>${fmtDay(l.dep)} · ${fmtTime(l.dep)}</span>` : `<b>${l.o}</b><span>connection</span>`;
  const arr = l.arr ? `<b>${l.d}</b><span>${fmtDay(l.arr)} · ${fmtTime(l.arr)}</span>` : `<b>${l.d}</b><span>connection</span>`;
  const meta = [l.ac, l.cabin, l.seat ? `Seat ${l.seat}` : null].filter(Boolean).map(esc).join(' · ');
  return `<div class="leg"><div class="fn"><b>${esc(l.f)}</b>${esc(airlineName(l.airline))}</div>
    <div class="od"><div class="pt">${dep}</div><span class="arrow">→</span><div class="pt">${arr}</div></div>
    <div class="dur num">${l.dur ? fmtDur(l.dur) : ''}<br>${Math.round(l.mi).toLocaleString()} mi</div>
    ${meta ? `<div class="fn" style="grid-column:2/-1">${meta}</div>` : ''}</div>`;
}
const PAY_METHODS = Object.entries(PAY_LABEL);
function payParts(n, ctx) {
  if (!n || !n.pay) return null;
  const p = [];
  if (n.pay === 'other') { p.push(n.payer ? `Paid by ${n.payer}` : 'Someone else paid'); if (n.flyingWith) p.push(`${ctx === 'stay' ? 'stayed' : 'flying'} with ${n.payer ? 'them' : 'the payer'}`); }
  else {
    if (n.pay === 'card') p.push(n.payCard || 'Credit card');
    else p.push(PAY_LABEL[n.pay]);
    if ((n.pay === 'points' || n.pay === 'mixed') && n.payPoints) p.push(`${Number(n.payPoints).toLocaleString()} ${n.payProgram || 'points'}`);
    else if ((n.pay === 'points' || n.pay === 'mixed') && n.payProgram) p.push(n.payProgram);
    if (n.payAmount) p.push(n.pay === 'points' || n.pay === 'mixed' ? `${money(n.payAmount)} cash${n.payCard ? ' on ' + n.payCard : ''}` : money(n.payAmount));
  }
  return p;
}
const payShort = (n, ctx) => { const p = payParts(n, ctx); return p ? (n.pay === 'other' ? p[0] : p.slice(0, 2).join(' · ')) : ''; };
function payFormHTML(n, ctx) {
  const cards = [...new Set(WALLET.map((c) => c.name))];
  const cardOpts = ['<option value="">Choose a card</option>', ...cards.map((c) => `<option ${n.payCard === c ? 'selected' : ''}>${esc(c)}</option>`)];
  if (n.payCard && !cards.includes(n.payCard)) cardOpts.push(`<option selected>${esc(n.payCard)}</option>`);
  cardOpts.push('<option value="__other">Another card…</option>');
  const m = n.pay || '';
  return `<fieldset class="payf" data-m="${m}"><legend class="eyebrow">How it was paid</legend>
    <div class="paym" role="radiogroup">${PAY_METHODS.map(([k, v]) => `<label class="pill"><input type="radio" name="pay" value="${k}" ${m === k ? 'checked' : ''}><span>${v}</span></label>`).join('')}<label class="pill"><input type="radio" name="pay" value="" ${!m ? 'checked' : ''}><span>Not set</span></label></div>
    <div class="paygrid">
      <label class="pf f-card">Card<select name="payCard">${cardOpts.join('')}</select></label>
      <label class="pf f-cardx" hidden>Card name<input name="payCardX" maxlength="80" placeholder="e.g. Amex Gold"></label>
      <label class="pf f-prog">Program<input name="payProgram" list="progs" maxlength="60" value="${esc(n.payProgram || '')}" placeholder="e.g. United MileagePlus"></label>
      <label class="pf f-pts">Points or miles<input name="payPoints" type="number" min="0" step="1" inputmode="numeric" value="${esc(n.payPoints || '')}"></label>
      <label class="pf f-amt">Amount (USD)<input name="payAmount" type="number" min="0" step="0.01" inputmode="decimal" value="${esc(n.payAmount || '')}" placeholder="Total, or taxes and fees"></label>
      <label class="pf f-payer">Who paid<input name="payer" maxlength="60" value="${esc(n.payer || '')}" placeholder="e.g. a friend, family, employer"></label>
      <label class="pf f-with chk"><input type="checkbox" name="flyingWith" ${n.flyingWith ? 'checked' : ''}> ${ctx === 'stay' ? 'I stayed with them' : "I'm flying with them"}</label>
      <label class="pf f-note wide">Payment note<input name="payNote" maxlength="200" value="${esc(n.payNote || '')}" placeholder="e.g. companion fare, split the cost"></label>
    </div></fieldset>`;
}
function syncPayForm(f) {
  const m = (f.querySelector('input[name="pay"]:checked') || {}).value || '';
  const show = { card: ['card', 'amt', 'note'], cash: ['amt', 'note'], points: ['prog', 'pts', 'amt', 'card', 'note'], mixed: ['prog', 'pts', 'amt', 'card', 'note'], credit: ['amt', 'note'], other: ['payer', 'with', 'amt', 'note'], '': [] }[m];
  f.querySelector('.payf').dataset.m = m;
  ['card', 'cardx', 'prog', 'pts', 'amt', 'payer', 'with', 'note'].forEach((k) => { f.querySelector('.f-' + k).hidden = !show.includes(k); });
  if (show.includes('card')) f.querySelector('.f-cardx').hidden = f.payCard.value !== '__other';
  f.querySelector('.f-amt').firstChild.textContent = m === 'points' || m === 'mixed' ? 'Cash part / taxes (USD)' : 'Amount (USD)';
  f.querySelector('.f-card').firstChild.textContent = m === 'points' || m === 'mixed' ? 'Taxes paid with' : 'Card';
}
function readPay(f) {
  const m = (f.querySelector('input[name="pay"]:checked') || {}).value || '';
  if (!m) return { pay: '' };
  const vis = (k) => !f.querySelector('.f-' + k).hidden;
  const o = { pay: m };
  if (vis('card')) { const c = f.payCard.value === '__other' ? f.payCardX.value.trim() : f.payCard.value; if (c) o.payCard = c; }
  if (vis('prog') && f.payProgram.value.trim()) o.payProgram = f.payProgram.value.trim();
  if (vis('pts') && f.payPoints.value) o.payPoints = Math.max(0, Math.round(+f.payPoints.value));
  if (vis('amt') && f.payAmount.value) o.payAmount = Math.max(0, Math.round(+f.payAmount.value * 100) / 100);
  if (vis('payer') && f.payer.value.trim()) o.payer = f.payer.value.trim();
  if (vis('with')) o.flyingWith = f.flyingWith.checked;
  if (vis('note') && f.payNote.value.trim()) o.payNote = f.payNote.value.trim();
  return o;
}
const where = () => (store.mode === 'demo' ? "Demo: kept until you leave the page, not saved." : 'Saved to your account.');
let editing = null; // trip id whose details are being edited
function purposeHTML(t) {
  const n = noteOf(t);
  if (editing === t.id) {
    const opts = ['<option value="">Choose a purpose</option>', ...PURPOSES.map((p) => `<option ${n.purpose === p ? 'selected' : ''}>${p}</option>`)];
    if (n.purpose && !PURPOSES.includes(n.purpose)) opts.push(`<option selected>${esc(n.purpose)}</option>`);
    return `<div class="purpose"><form data-id="${t.id}">
      <label class="eyebrow" for="pp-${t.id}">Purpose</label>
      <select id="pp-${t.id}" name="purpose">${opts.join('')}</select>
      <label class="eyebrow" for="pd-${t.id}">Details</label>
      <textarea id="pd-${t.id}" name="details" maxlength="2000" placeholder="What's the trip for? Who you're seeing, plans, things to remember…">${esc(n.details)}</textarea>
      ${payFormHTML(n)}
      <div class="row"><span class="msg" style="margin-right:auto">${where()}</span>
        <button type="button" class="btn" data-act="cancel">Cancel</button>
        <button type="submit" class="btn primary">Save</button></div>
    </form></div>`;
  }
  const pp = payParts(n);
  return `<div class="purpose"><div class="ph"><span class="eyebrow">Trip details</span>
      <div class="row"><button type="button" class="btn" data-act="edit" data-id="${t.id}">${noteEmpty(n) ? 'Add details' : 'Edit details'}</button><button type="button" class="btn" data-act="edit-flights" data-id="${t.id}">Edit flights</button></div></div>
    ${n.purpose ? `<span class="chip purpose" style="align-self:flex-start">${esc(n.purpose)}</span>` : ''}
    ${n.details ? `<p>${esc(n.details)}</p>` : (noteEmpty(n) ? `<span class="empty">No purpose or payment details yet.</span>` : '')}
    ${pp ? `<div class="paid"><span class="eyebrow">Paid</span><span class="pm pm-${n.pay}">${esc(PAY_LABEL[n.pay])}</span><span>${esc(pp.filter((x) => x !== PAY_LABEL[n.pay]).join(' · '))}</span>${n.payNote ? `<span class="lw">${esc(n.payNote)}</span>` : ''}</div>` : ''}</div>`;
}
function renderTrips() {
  const up = upList().filter(inYear), past = pastList().filter(inYear);
  const list = view === 'up' ? up : view === 'past' ? past : [...up, ...past];
  $id('listTitle').textContent = (view === 'up' ? 'Upcoming trips' : view === 'past' ? 'Trip history' : 'All trips') + (filtered() ? ' · ' + yearLabel() : '');
  let html = '', yr = null;
  if (!TRIPS.length) html = `<div class="panel empty-card"><b>No trips yet.</b><span class="lw">Add a flight above, or import a CSV (myFlightradar24 exports work) from Settings.</span></div>`;
  else if (!list.length) html = `<div class="panel"><span class="empty">No ${view === 'up' ? 'upcoming' : view === 'past' ? 'past' : ''} trips in ${filtered() ? yearLabel() : 'the log'}. Try another year or view.</span></div>`;
  list.forEach((t) => {
    const y = t.startLocal.slice(0, 4);
    if (y !== yr) { yr = y; html += `<div class="year">${y}</div>`; }
    const tr = tierOf(t), d = daysTo(t);
    const when = tr === 'now' ? 'Traveling now' : tr === 'past' ? null : (d === 0 ? 'Today' : d === 1 ? 'Tomorrow' : `In ${d} days`);
    const chips = [when ? `<span class="chip tier">${TIER[tr].label} · ${when}</span>` : '',
      t.purpose ? `<span class="chip purpose">${esc(t.purpose)}</span>` : '',
      t.pay?.method ? `<span class="chip paychip pm-${t.pay.method}">${esc(payShort(noteOf(t)))}</span>` : '',
      `<span class="chip">${esc(t.carrier)}</span>`, t.who ? `<span class="chip">${esc(t.who)}</span>` : '',
      t.source === 'csv' ? `<span class="chip">Imported</span>` : '',
      ...(t.tags || []).map((x) => `<span class="chip">${esc(x)}</span>`)].join('');
    const seq = t.seq.map((c) => (c === '·' ? ' / ' : `<b>${c}</b>`)).join(' ').replace(/<\/b> <b>/g, '</b> → <b>');
    const on = selTrip === t;
    html += `<article class="strip t-${tr} ${tr === 'past' ? 'past' : ''} ${on ? 'on' : ''}" style="--c:${stripColor(tr)}">
      <span class="bar"></span><div class="strip-body">
      <button type="button" class="strip-head" data-id="${t.id}" aria-expanded="${on}">
        <span class="strip-top"><h3>${esc(t.name)}</h3><span class="mono num" style="font-size:13px">${fmtDay(t.startLocal)} – ${fmtDay(t.endLocal)}</span></span>
        ${t.notes && !on ? `<span class="purpose-line">${esc(t.notes.length > 110 ? t.notes.slice(0, 110) + '…' : t.notes)}</span>` : ''}
        <span class="path">${seq}</span>
        <span class="chips">${chips}</span>
      </button>
      <div class="legs">${t.legs.map(legHTML).join('')}
        <div class="tripsum">${t.legs.length} flight${t.legs.length === 1 ? '' : 's'} · ${Math.round(t.mi).toLocaleString()} mi${t.mins ? ` · ${fmtDur(t.mins)} in the air` : ''} · <button type="button" class="linkbtn" data-tomap>Show on map</button></div>
        ${purposeHTML(t)}
        ${tripStaysHTML(t)}
        <div style="height:8px"></div>${tripLoungeHTML(t)}
      </div></div></article>`;
  });
  const el = $id('trips'); el.innerHTML = html;
  el.querySelectorAll('.strip-head').forEach((b) => b.addEventListener('click', () => {
    const t = TRIPS.find((x) => x.id === b.dataset.id); selTrip = selTrip === t ? null : t; editing = null; renderTrips(); draw();
  }));
  el.querySelectorAll('[data-act="edit"]').forEach((b) => b.addEventListener('click', () => { editing = b.dataset.id; renderTrips(); $id('pp-' + editing)?.focus(); }));
  el.querySelectorAll('[data-act="edit-flights"]').forEach((b) => b.addEventListener('click', () => openTripForm(RAW[b.dataset.id])));
  el.querySelectorAll('[data-stay-go]').forEach((b) => b.addEventListener('click', () => { showTab('stays'); requestAnimationFrame(() => flashEl($id('stay-' + b.dataset.stayGo))); }));
  el.querySelectorAll('[data-tomap]').forEach((b) => b.addEventListener('click', () => mapbox.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'start' })));
  el.querySelectorAll('[data-act="cancel"]').forEach((b) => b.addEventListener('click', () => { editing = null; renderTrips(); }));
  el.querySelectorAll('.purpose form').forEach((f) => { syncPayForm(f); f.addEventListener('change', (e) => { if (e.target.name === 'pay' || e.target.name === 'payCard') syncPayForm(f); }); });
  el.querySelectorAll('.purpose form').forEach((f) => f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const rec = RAW[f.dataset.id]; const n = { purpose: f.purpose.value.trim(), details: f.details.value.trim(), ...readPay(f) };
    editing = null;
    await store.put('trips', clean({ ...rec, purpose: n.purpose, notes: n.details, pay: payFromNote(n), updatedAt: new Date().toISOString() }));
    toast('Trip details saved');
  }));
}
function flashEl(a) { if (!a) return; a.scrollIntoView({ block: 'center', behavior: reduceMotion() ? 'auto' : 'smooth' }); a.classList.add('flash'); setTimeout(() => a.classList.remove('flash'), 1600); }

// ---------- add / edit flights ----------
// A trip is one or more legs. The form edits a whole trip.
const AIRLINE_OPTS = Object.entries(AIRLINES).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('');
function airportSearch(q) {
  q = q.trim().toLowerCase(); if (!q) return [];
  const score = (a) => (a.iata.toLowerCase() === q ? 0 : a.iata.toLowerCase().startsWith(q) ? 1 : a.city.toLowerCase().startsWith(q) ? 2 : a.name.toLowerCase().includes(q) || a.city.toLowerCase().includes(q) ? 3 : 9);
  return AIRPORT_LIST.map((a) => [score(a), a]).filter(([s]) => s < 9).sort((x, y) => x[0] - y[0] || (x[1].size === 'L' ? -1 : 1) || x[1].iata.localeCompare(y[1].iata)).slice(0, 8).map(([, a]) => a);
}
let aptBoxN = 0;
const aptField = (label, name, value, extra = '') => {
  const id = `ab${++aptBoxN}`;
  return `<label class="pf aptbox">${label}<input name="${name}" value="${esc(value || '')}" ${extra} autocomplete="off" spellcheck="false" maxlength="40" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="${id}" placeholder="Code or city">
    <ul class="aptsug" id="${id}" role="listbox" hidden></ul></label>`;
};
// Airport autocomplete for every [role=combobox] in the app
root.addEventListener('input', (e) => {
  const inp = e.target.closest('.aptbox input'); if (!inp) return;
  const ul = $id(inp.getAttribute('aria-controls')); const res = airportSearch(inp.value);
  ul.innerHTML = res.map((a, i) => `<li role="option" id="${ul.id}-${i}" data-code="${a.iata}" aria-selected="false"><b>${a.iata}</b> ${esc(a.city)}${a.cc === 'US' ? ', ' + esc(a.region) : ', ' + esc(a.country)} <small>${esc(a.name)}</small></li>`).join('');
  ul.hidden = !res.length; inp.setAttribute('aria-expanded', String(!!res.length)); inp.removeAttribute('aria-activedescendant');
});
root.addEventListener('keydown', (e) => {
  const inp = e.target.closest('.aptbox input'); if (!inp) return;
  const ul = $id(inp.getAttribute('aria-controls')); if (ul.hidden) return;
  const opts = [...ul.children]; let i = opts.findIndex((o) => o.getAttribute('aria-selected') === 'true');
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); i = (i + (e.key === 'ArrowDown' ? 1 : -1) + opts.length) % opts.length; opts.forEach((o, j) => o.setAttribute('aria-selected', String(j === i))); inp.setAttribute('aria-activedescendant', opts[i].id); }
  else if (e.key === 'Enter' && i >= 0) { e.preventDefault(); pickApt(inp, opts[i].dataset.code); }
  else if (e.key === 'Escape') { ul.hidden = true; inp.setAttribute('aria-expanded', 'false'); }
});
root.addEventListener('mousedown', (e) => { const li = e.target.closest('.aptsug li'); if (!li) return; e.preventDefault(); pickApt(li.closest('.aptbox').querySelector('input'), li.dataset.code); });
root.addEventListener('focusout', (e) => { const inp = e.target.closest?.('.aptbox input'); if (inp) setTimeout(() => { const ul = $id(inp.getAttribute('aria-controls')); if (ul) ul.hidden = true; inp.setAttribute('aria-expanded', 'false'); }, 120); });
function pickApt(inp, code) {
  inp.value = code; const ul = $id(inp.getAttribute('aria-controls')); ul.hidden = true; inp.setAttribute('aria-expanded', 'false');
  inp.dispatchEvent(new Event('change', { bubbles: true }));
}
const codeOf = (v) => { const s = String(v || '').trim().toUpperCase(); const m = s.match(/\b([A-Z]{3})\b/); return m && airport(m[1]) ? m[1] : null; };

let tripEdit = null; // the record being edited, or {} for a new trip
function legRow(l, i) {
  return `<fieldset class="legf" data-i="${i}"><legend class="eyebrow">Flight ${i + 1}</legend><div class="paygrid">
    <label class="pf">Airline<input name="airline" list="airlines" maxlength="3" value="${esc(l.airline || '')}" placeholder="UA" required></label>
    <label class="pf">Flight number<input name="flightNo" maxlength="5" inputmode="numeric" value="${esc(l.flightNo || '')}" placeholder="1215"></label>
    ${aptField('From', 'from', l.from, 'required')}${aptField('To', 'to', l.to, 'required')}
    <label class="pf">Departs (local time)<input name="depLocal" type="datetime-local" value="${esc(l.depLocal || '')}" required></label>
    <label class="pf">Arrives (local time)<input name="arrLocal" type="datetime-local" value="${esc(l.arrLocal || '')}"></label>
    <label class="pf">Aircraft (optional)<input name="aircraft" maxlength="40" value="${esc(l.aircraft || '')}" placeholder="Boeing 737-800"></label>
    <label class="pf">Cabin or fare (optional)<input name="cabin" maxlength="40" value="${esc(l.cabin || '')}" placeholder="Economy"></label>
    <label class="pf">Confirmation (optional)<input name="confirmation" maxlength="12" value="${esc(l.confirmation || '')}" autocomplete="off"></label>
    <p class="lw legmi" aria-live="polite"></p>
  </div><button type="button" class="linkbtn" data-delleg="${i}">Remove this flight</button></fieldset>`;
}
function readLegs(f) {
  return [...f.querySelectorAll('.legf')].map((fs) => {
    const g = (n) => fs.querySelector(`[name="${n}"]`).value.trim();
    return { airline: g('airline').toUpperCase(), flightNo: g('flightNo'), from: codeOf(g('from')) || g('from').toUpperCase(), to: codeOf(g('to')) || g('to').toUpperCase(),
      depLocal: g('depLocal'), arrLocal: g('arrLocal'), aircraft: g('aircraft'), cabin: g('cabin'), confirmation: g('confirmation') };
  });
}
function updateLegMiles(f) {
  f.querySelectorAll('.legf').forEach((fs) => {
    const o = codeOf(fs.querySelector('[name="from"]').value), d = codeOf(fs.querySelector('[name="to"]').value);
    fs.querySelector('.legmi').textContent = o && d ? `${A(o).c} → ${A(d).c} · ${Math.round(miles(o, d)).toLocaleString()} mi great-circle` : '';
  });
}
function openTripForm(rec) {
  tripEdit = rec ? structuredClone(rec) : { legs: [{}] };
  showTab('trips');
  renderTripForm();
  $id('tripFormPanel').scrollIntoView({ block: 'start' });
}
function renderTripForm(legsOverride) {
  const p = $id('tripFormPanel'), t = tripEdit; if (!t) { p.innerHTML = ''; return; }
  const legs = legsOverride || t.legs || [{}];
  const n = noteOf(t);
  p.innerHTML = `<form class="panel purpose tripform" id="tripForm">
    <h3 style="font-size:20px;text-transform:uppercase;margin:0">${t.id ? 'Edit trip' : 'Add a flight'}</h3>
    <p class="lw" style="margin:0">One trip can hold several flights: outbound, connections and the way home.</p>
    <div class="paygrid">
      <label class="pf wide">Trip name<input name="name" required maxlength="60" value="${esc(t.name || '')}" placeholder="e.g. Seattle"></label>
      <label class="pf">Purpose<select name="purpose"><option value="">Not set</option>${PURPOSES.map((x) => `<option ${n.purpose === x ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
      <label class="pf">Who's going<input name="who" maxlength="60" value="${esc(t.who || '')}" placeholder="e.g. ${esc(OWNER)}"></label>
      <label class="pf wide">Notes<input name="details" maxlength="500" value="${esc(n.details)}"></label>
    </div>
    <datalist id="airlines">${AIRLINE_OPTS}</datalist>
    <div class="legsf">${legs.map(legRow).join('')}</div>
    <div><button type="button" class="btn" data-addleg>+ Add another flight</button></div>
    ${payFormHTML(n)}
    <div class="row"><span class="msg lw" style="margin-right:auto">${where()}</span>
      ${t.id ? `<button type="button" class="btn danger" data-deltrip>Delete trip</button>` : ''}
      <button type="button" class="btn" data-tcancel>Cancel</button><button type="submit" class="btn primary">${t.id ? 'Save trip' : 'Add trip'}</button></div>
  </form>`;
  const f = $id('tripForm');
  syncPayForm(f); updateLegMiles(f);
  f.addEventListener('change', (e) => { if (e.target.name === 'pay' || e.target.name === 'payCard') syncPayForm(f); updateLegMiles(f); });
  f.querySelector('[data-addleg]').addEventListener('click', () => {
    const cur = readLegs(f), last = cur[cur.length - 1] || {};
    tripEdit = { ...tripEdit, ...readTripTop(f) };
    renderTripForm([...cur, { airline: last.airline, from: last.to }]);
    $id('tripForm').querySelector(`.legf[data-i="${cur.length}"] [name="flightNo"]`)?.focus();
  });
  f.addEventListener('click', (e) => {
    const b = e.target.closest('[data-delleg]'); if (!b) return;
    const cur = readLegs(f); if (cur.length < 2) { f.querySelector('.msg').textContent = 'A trip needs at least one flight.'; return; }
    cur.splice(+b.dataset.delleg, 1); tripEdit = { ...tripEdit, ...readTripTop(f) }; renderTripForm(cur);
  });
  f.querySelector('[data-tcancel]').addEventListener('click', () => { tripEdit = null; renderTripForm(); });
  f.querySelector('[data-deltrip]')?.addEventListener('click', async (e) => {
    if (!twoStep(e.target, 'deltrip', 'Tap again to delete')) return;
    const id = tripEdit.id; tripEdit = null; renderTripForm(); selTrip = null;
    await store.remove('trips', id); toast('Trip deleted');
  });
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const legs = readLegs(f), msg = f.querySelector('.msg');
    for (const [i, l] of legs.entries()) {
      if (!airport(l.from) || !airport(l.to)) { msg.textContent = `Flight ${i + 1}: pick both airports from the list.`; return; }
      if (!l.depLocal) { msg.textContent = `Flight ${i + 1}: add the departure time.`; return; }
      if (l.arrLocal && localToUtc(l.arrLocal, airport(l.to).tz) <= localToUtc(l.depLocal, airport(l.from).tz)) { msg.textContent = `Flight ${i + 1}: it arrives before it leaves. Times are local to each airport.`; return; }
    }
    const top = readTripTop(f);
    if (!top.name) { msg.textContent = 'Give the trip a name.'; return; }
    const rec = clean({ ...tripEdit, ...top, legs: legs.map((l) => clean({ ...l, depTz: airport(l.from).tz, arrTz: airport(l.to).tz })), source: tripEdit.source || 'manual', hidden: false, updatedAt: new Date().toISOString() });
    if (!tripEdit.id) rec.createdAt = rec.updatedAt;
    const isNew = !tripEdit.id; tripEdit = null; renderTripForm();
    await store.put('trips', rec); toast(isNew ? 'Trip added' : 'Trip saved');
  });
}
function readTripTop(f) {
  const n = { purpose: f.purpose.value, details: f.details.value.trim(), ...readPay(f) };
  return { name: f.name.value.trim(), who: f.who.value.trim(), purpose: n.purpose, notes: n.details, pay: payFromNote(n) };
}
$id('addTripBtn').addEventListener('click', () => openTripForm(null));

// ---------- airports ----------
function renderApts() {
  const codes = Object.keys(visits).sort((a, b) => visits[b].n - visits[a].n || a.localeCompare(b));
  $id('apts').innerHTML = codes.length ? codes.map((c) => `<button type="button" class="apt ${c === selApt ? 'on' : ''}" data-c="${c}"><b>${c}</b><span class="nm">${esc(A(c).n)}<small>${esc(A(c).c)}${A(c).cc !== 'United States' && !/,/.test(A(c).c) ? ', ' + esc(A(c).cc) : ''} · ${(LOUNGES[c]?.l || []).length} lounges, ${(LOUNGES[c]?.l || []).filter(canUse).length} yours</small></span><span class="ct num">${visits[c].n}×</span></button>`).join('')
    : `<p class="empty">Airports show up here once you add flights.</p>`;
  root.querySelectorAll('.apt').forEach((b) => b.addEventListener('click', () => selectApt(b.dataset.c)));
}
function localNow(tz) { return new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit', weekday: 'short' }).format(new Date()); }
function utcLabel(tz) { const o = tzOffsetMin(tz, Date.now()); const s = o < 0 ? '−' : '+'; const a = Math.abs(o); return `UTC${s}${Math.floor(a / 60)}${a % 60 ? ':' + String(a % 60).padStart(2, '0') : ''}`; }
function renderAptDetail() {
  const c = selApt, a = A(c), v = visits[c];
  if (!a) { $id('aptDetail').innerHTML = `<p class="empty">Pick an airport.</p>`; return; }
  const tr = v ? TRIPS.filter((t) => v.trips.has(t.id)).sort((x, y) => x.start - y.start) : [];
  const nextT = tr.find(isFuture);
  const dist = c === HOME ? null : Math.round(miles(HOME, c));
  $id('aptDetail').innerHTML = `<div class="ad">
    <span class="eyebrow">Airport</span>
    <div class="code">${c}</div>
    <h3 style="font-size:22px">${esc(a.n)}</h3>
    <dl>
      <dt>City</dt><dd>${esc(a.c)}${a.cc !== 'United States' && !/,/.test(a.c) ? ', ' + esc(a.cc) : ''}</dd>
      <dt>Local time</dt><dd class="num">${localNow(a.tz)} · ${utcLabel(a.tz)}</dd>
      <dt>Position</dt><dd class="mono num">${Math.abs(a.lat).toFixed(3)}°${a.lat >= 0 ? 'N' : 'S'} ${Math.abs(a.lon).toFixed(3)}°${a.lon >= 0 ? 'E' : 'W'}</dd>
      ${dist ? `<dt>From ${esc(HOME)}</dt><dd class="num">${dist.toLocaleString()} mi great-circle</dd>` : ''}
      ${v ? `<dt>Movements</dt><dd class="num">${v.n} on ${tr.length} trip${tr.length > 1 ? 's' : ''}</dd>
      <dt>Trips</dt><dd>${tr.map((t) => `${esc(t.name)} ${MON[+t.startLocal.slice(5, 7) - 1]} ’${t.startLocal.slice(2, 4)}`).join(', ')}</dd>` : ''}
      ${nextT ? `<dt>Next</dt><dd>${esc(nextT.name)}, ${fmtDay(nextT.startLocal)} (${TIER[tierOf(nextT)].label.toLowerCase()})</dd>` : ''}
    </dl>${loungeHTML(c)}</div>`;
  wireLounges();
}

// ---------- cards & lounge access ----------
let WHO = prefs.get('who') || '';
let ONLYMINE = prefs.get('onlymine') === '1';
const cardTags = (c) => (CAT[c.key] ? CAT[c.key].t : (Array.isArray(c.tags) ? c.tags.filter((t) => ACCESS[t]) : []));
const cardBenefit = (c) => (CAT[c.key] ? CAT[c.key].b : (cardTags(c).length ? cardTags(c).map((t) => ACCESS[t]).join(', ') : 'No lounge benefit'));
const owners = () => [...new Set(WALLET.map((c) => c.owner || OWNER))];
function whoNow() { const o = owners(); if (WHO === 'Anyone') return 'Anyone'; if (o.includes(WHO)) return WHO; return o.includes(OWNER) ? OWNER : (o[0] || 'Anyone'); }
const walletFor = () => { const w = whoNow(); return WALLET.filter((c) => w === 'Anyone' || (c.owner || OWNER) === w); };
let MYACC = new Set();
function recomputeAccess() { MYACC = new Set(walletFor().flatMap(cardTags)); }
const canUse = (L) => L[3].some((t) => MYACC.has(t));
const tagSources = (t) => walletFor().filter((c) => cardTags(c).includes(t)).map((c) => c.name);
// Lounges you can't use with your cards: is it the ticket or status that gets you in, or a day pass?
const MEMBER = ['AL', 'UA', 'AA', 'AS', 'DL'];
function otherWay(L) {
  if (L[3].some((t) => MEMBER.includes(t))) return 'With eligible ticket or status';
  if (L[3].includes('PAY')) return 'Day pass';
  return 'Not included';
}
const fmtChecked = (ym) => { if (!ym) return ''; const [y, m] = ym.split('-'); return `${MON[+m - 1]} ${y}`; };

function whoChooser({ anyone = true } = {}) {
  const o = owners(); if (!o.length) return '';
  const w = whoNow() === 'Anyone' && !anyone ? o[0] : whoNow(), opts = [...o, ...(o.length > 1 && anyone ? ['Anyone'] : [])];
  return `<div class="accrow"><span class="eyebrow">Cards of</span>${opts.map((x) => `<button type="button" class="acc ${w === x ? 'on' : ''}" data-who="${esc(x)}" aria-pressed="${w === x}">${x === 'Anyone' ? 'Any of us' : esc(x)}</button>`).join('')}</div>`;
}
function loungeHTML(c) {
  const L = LOUNGES[c] || { l: [] }, n = L.l.filter(canUse).length;
  const rows = L.l.filter((x) => !ONLYMINE || canUse(x)).sort((a, b) => canUse(b) - canUse(a));
  const cards = walletFor();
  const checked = L.needsReview ? 'Not yet checked: confirm with the lounge before relying on this.' : L.lastVerified ? `Last checked ${fmtChecked(L.lastVerified)}. Lounges change, so confirm with the lounge before relying on this.` : 'No lounge details for this airport yet.';
  return `<div class="lounges">
    <div class="colhead"><h3 style="font-size:20px;text-transform:uppercase">Lounges</h3><span class="eyebrow">${L.l.length} listed · ${n} you can use</span></div>
    ${whoChooser()}
    <p class="lw" style="margin:0">${cards.length ? `Using ${cards.map((x) => esc(x.name)).join(', ')}.` : 'No cards added yet.'} <button type="button" class="linkbtn" data-goto="cards">Edit cards</button></p>
    <label class="only"><input type="checkbox" id="onlyMine" ${ONLYMINE ? 'checked' : ''}> Only lounges I can use</label>
    ${rows.length ? `<ul class="llist">${rows.map((x) => `<li class="${canUse(x) ? 'yes' : ''}">
      <div class="lt"><b>${esc(x[0])}</b>${canUse(x) ? `<span class="chip in">Your cards get you in</span>` : `<span class="chip">${otherWay(x)}</span>`}</div>
      <span class="lw">${esc(x[1])}</span>${x[2] ? `<span class="la">${esc(x[2])}</span>` : ''}
      ${canUse(x) ? `<span class="lw">Via ${[...new Set(x[3].filter((t) => MYACC.has(t)).flatMap(tagSources))].map(esc).join(', ')}${x[3].includes('UA') && walletFor().some((k) => k.key === 'uexp') && !walletFor().some((k) => k.key === 'uci') ? ' (uses a one-time pass)' : ''}</span>` : ''}
      <span class="chips">${x[3].map((t) => `<span class="chip ${MYACC.has(t) ? 'in-soft' : ''}">${esc(ACCESS[t] || t)}</span>`).join('')}</span></li>`).join('')}</ul>`
      : `<p class="empty">${L.l.length ? 'None of the lounges here match your cards.' : 'No lounges listed at this airport.'}</p>`}
    ${L.note ? `<p class="lnote">${esc(L.note)}</p>` : ''}
    <p class="lnote">${checked}</p>
  </div>`;
}
function wireLounges() {
  root.querySelectorAll('#aptDetail .acc').forEach((b) => b.addEventListener('click', () => setWho(b.dataset.who)));
  const o = $id('onlyMine');
  if (o) o.addEventListener('change', () => { ONLYMINE = o.checked; prefs.set('onlymine', ONLYMINE ? '1' : '0'); renderAptDetail(); });
}
function setWho(w) { WHO = w; prefs.set('who', w); refreshAccess(); }
root.addEventListener('click', (e) => { const b = e.target.closest('#p-settings .acc'); if (b) setWho(b.dataset.who); });
function refreshAccess() { recomputeAccess(); renderAptDetail(); renderApts(); if (!editing) renderTrips(); renderWallet(); if (TAB === 'settings') renderSettings(); }
function tripLoungeHTML(t) {
  const deps = [...new Set(t.legs.map((l) => l.o))];
  const rows = deps.map((c) => { const u = (LOUNGES[c]?.l || []).filter(canUse);
    return `<li><b class="mono">${c}</b> ${u.length ? u.map((x) => `${esc(x[0])} <span class="lw">(${esc(x[1])})</span>`).join(' · ') : `<span class="lw">None with your cards</span>`}</li>`; }).join('');
  return `<div class="purpose"><span class="eyebrow">Lounges you can use on this trip</span><ul class="tl">${rows}</ul>
    <span class="lw">Based on ${whoNow() === 'Anyone' ? 'everyone’s' : esc(whoNow()) + '’s'} cards. Check your terminal: some lounges are only reachable from certain gates.</span></div>`;
}

function renderWallet() {
  $id('walletState').textContent = store.mode === 'demo' ? 'Demo · not saved' : 'Saved to your account';
  const wl = $id('wallet');
  if (!WALLET.length) {
    wl.innerHTML = `<div class="panel empty-card"><b>No cards yet.</b><span class="lw">Add the cards you carry below. Lounge access across the page updates as soon as you add one.</span></div>`;
  } else {
    wl.innerHTML = owners().map((o) => `<div class="wgroup"><span class="eyebrow">${esc(o)}'s cards</span><div class="wgrid">${WALLET.filter((c) => (c.owner || OWNER) === o).map((c) => {
      const tags = cardTags(c);
      return `<article class="wcard ${tags.length ? 'has' : ''}">
        <div class="wtop"><b>${esc(c.name)}</b><button type="button" class="linkbtn" data-del="${esc(c.id)}" aria-label="Remove ${esc(c.name)}">Remove</button></div>
        <span class="lw">${esc(cardBenefit(c))}</span>
        <span class="chips">${tags.map((t) => `<span class="chip in-soft">${esc(ACCESS[t])}</span>`).join('') || `<span class="chip">No lounge access</span>`}</span>
      </article>`; }).join('')}</div></div>`).join('');
  }
  wl.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => removeCard(b.dataset.del)));
  const all = Object.keys(LOUNGES).flatMap((k) => LOUNGES[k].l.map((x) => ({ k, x })));
  const usable = all.filter((o) => canUse(o.x));
  const kinds = ['CS', 'CO', 'PP', 'AX', 'UA', 'AA', 'AS', 'DL'].filter((t) => MYACC.has(t));
  const sum = $id('accessSummary');
  sum.innerHTML = `<div class="colhead"><h3 style="font-size:20px;text-transform:uppercase">Lounge access</h3><span class="eyebrow">${usable.length} of ${all.length} lounges in the guide</span></div>
    ${whoChooser()}
    ${kinds.length ? `<ul class="tl">${kinds.map((t) => `<li><b>${esc(ACCESS[t])}</b> <span class="lw">via ${tagSources(t).map(esc).join(', ')}</span></li>`).join('')}</ul>` : `<p class="empty">These cards don't include lounge access.</p>`}`;
  sum.querySelectorAll('.acc').forEach((b) => b.addEventListener('click', () => setWho(b.dataset.who)));
}
function renderAddForm() {
  const p = $id('addCardPanel');
  const ownersList = [...new Set([...owners(), OWNER])];
  const withAccess = CARD_CATALOG.filter((c) => c.t.length), others = CARD_CATALOG.filter((c) => !c.t.length);
  p.innerHTML = `<form id="addCardForm" class="addform">
    <h3 style="font-size:20px;text-transform:uppercase">Add a card</h3>
    <div class="frow">
      <label class="fl" for="acCard">Card
        <select id="acCard" name="card">
          <optgroup label="Cards with lounge access">${withAccess.map((c) => `<option value="${c.k}">${esc(c.n)}</option>`).join('')}</optgroup>
          <optgroup label="Other cards">${others.map((c) => `<option value="${c.k}">${esc(c.n)}</option>`).join('')}<option value="custom">Another card (type its name)</option></optgroup>
        </select></label>
      <label class="fl" for="acOwner">Whose card
        <input id="acOwner" name="owner" list="ownerList" value="${esc(owners()[0] || OWNER)}" maxlength="40" autocomplete="off">
        <datalist id="ownerList">${ownersList.map((o) => `<option value="${esc(o)}"></option>`).join('')}</datalist></label>
    </div>
    <div id="customBits" hidden class="frow">
      <label class="fl" for="acName">Card name
        <input id="acName" name="name" maxlength="60" placeholder="e.g. Wells Fargo Autograph"></label>
      <fieldset class="fl"><legend>Lounge access it gives (if any)</legend>
        <div class="checks">${['CS', 'CO', 'PP', 'AX', 'UA', 'AA', 'AS'].map((t) => `<label><input type="checkbox" name="tags" value="${t}"> ${esc(ACCESS[t])}</label>`).join('')}</div></fieldset>
    </div>
    <p class="lw" id="acBenefit" style="margin:0"></p>
    <div class="row"><span class="msg lw" id="acMsg" style="margin-right:auto">Only the card's name is stored, never its number.</span><button type="submit" class="btn primary">Add card</button></div>
  </form>`;
  const f = $id('addCardForm'), sel = f.card, bits = $id('customBits'), ben = $id('acBenefit');
  const upd = () => { const c = CAT[sel.value]; bits.hidden = !!c; ben.textContent = c ? `Gets you: ${c.b}.` : ''; };
  sel.addEventListener('change', upd); upd();
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const key = sel.value, c = CAT[key];
    const name = c ? c.short : f.name.value.trim();
    if (!name) { $id('acMsg').textContent = "Type the card's name."; f.name.focus(); return; }
    const owner = (f.owner.value.trim() || OWNER).slice(0, 40);
    const tags = c ? [] : [...f.querySelectorAll('input[name="tags"]:checked')].map((x) => x.value);
    await addCard({ key: c ? key : 'custom', name, owner, tags }); toast(`${name} added`);
  });
}
async function saveProfile(patch) { await store.setDoc('profile', { ...PROFILE, ...patch }); }
async function addCard(c) { await saveProfile({ cards: [...WALLET, { ...c, id: 'c' + Date.now().toString(36), addedAt: new Date().toISOString() }] }); }
async function removeCard(id) { const c = WALLET.find((x) => x.id === id); if (!c) return; await saveProfile({ cards: WALLET.filter((x) => x.id !== id) }); toast(`${c.name} removed`); }

function renderOwner() { $id('ownerName').textContent = OWNER; }
root.addEventListener('click', (e) => {
  if (!e.target.closest('#editOwner')) return;
  const p = root.querySelector('.owner');
  p.innerHTML = `<form id="ownerForm" class="ownerform"><label for="ownerInput" class="lw">Whose travels are these?</label><input id="ownerInput" maxlength="40" value="${esc(OWNER)}"><button class="btn primary" type="submit">Save</button></form>`;
  const f = $id('ownerForm'), i = $id('ownerInput'); i.focus(); i.select();
  f.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    p.innerHTML = `The travels of <b id="ownerName"></b> <button type="button" class="linkbtn" id="editOwner">Edit name</button>`;
    await saveProfile({ displayName: i.value.trim().slice(0, 40) || OWNER });
  });
});

// ---------- page tabs ----------
const TABS = ['overview', 'trips', 'stays', 'airports', 'cards', 'settings'];
let TAB = 'overview';
function showTab(t, focus) {
  if (!TABS.includes(t)) t = 'overview';
  TAB = t; prefs.set('tab', t);
  root.querySelectorAll('.pagetabs [role=tab]').forEach((b) => { const on = b.dataset.tab === t; b.setAttribute('aria-selected', on); b.tabIndex = on ? 0 : -1; if (on && focus) b.focus(); });
  // Keep the active tab in view when the bar scrolls sideways (phones), without moving the page
  const bar = root.querySelector('.pagetabs .tabscroll'), sel = $id('t-' + t);
  if (sel.offsetLeft < bar.scrollLeft || sel.offsetLeft + sel.offsetWidth > bar.scrollLeft + bar.clientWidth - 24) bar.scrollLeft = sel.offsetLeft - 8;
  root.querySelectorAll('.tabpanel').forEach((p) => { p.hidden = !p.dataset.show.split(' ').includes(t); });
  try { history.replaceState(null, '', '#' + t); } catch { /* sandboxed */ }
  if (t === 'overview' || t === 'trips') requestAnimationFrame(draw);
  if (t === 'cards') renderWallet();
  if (t === 'stays') renderStays();
  if (t === 'settings') renderSettings();
}
root.querySelector('.pagetabs').addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) showTab(b.dataset.tab); });
root.querySelector('.pagetabs').addEventListener('keydown', (e) => {
  if (!['ArrowLeft', 'ArrowRight'].includes(e.key) || !e.target.closest('[role=tab]')) return;
  const i = TABS.indexOf(TAB), n = (i + (e.key === 'ArrowRight' ? 1 : -1) + TABS.length) % TABS.length; showTab(TABS[n], true); e.preventDefault();
});
// Typing or following a #tab address switches tabs too
addEventListener('hashchange', () => { const h = location.hash.slice(1); if (TABS.includes(h) && h !== TAB) showTab(h); });
root.addEventListener('click', (e) => { const g = e.target.closest('[data-goto]'); if (g) { showTab(g.dataset.goto); window.scrollTo({ top: root.offsetTop }); } });

function selectApt(c, go) { selApt = c; renderApts(); renderAptDetail(); draw(); if (go) showTab('airports'); }

// ---------- copy ----------
function upcomingText() {
  return `${OWNER}'s upcoming flights\n\n` + upList().map((t) => `${t.name}${t.purpose ? ' – ' + t.purpose : ''}${t.who ? ` (${t.who})` : ''} · ${fmtDay(t.startLocal)} – ${fmtDay(t.endLocal)}\n` + (t.notes ? `  ${t.notes}\n` : '') + t.legs.map((l) => `  ${l.f}  ${l.o} → ${l.d}  ${l.dep ? fmtDay(l.dep) + ' ' + fmtTime(l.dep) : '(connection)'}${l.arr ? ' → arr ' + fmtTime(l.arr) + (l.dep && l.arr.slice(0, 10) !== l.dep.slice(0, 10) ? ' +1' : '') : ''}`).join('\n')).join('\n\n');
}
function toast(msg) { const t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); t.textContent = msg; root.appendChild(t); setTimeout(() => t.remove(), 2400); }
const armed = new Set();
function twoStep(btn, key, label) {
  if (armed.has(key)) { armed.delete(key); return true; }
  armed.add(key); const old = btn.textContent; btn.textContent = label; setTimeout(() => { armed.delete(key); if (btn.isConnected) btn.textContent = old; }, 3500); return false;
}
$id('copyUp').addEventListener('click', () => {
  const txt = upcomingText();
  const fallback = () => { const p = $id('aptDetail'); showTab('airports'); p.innerHTML = `<span class="eyebrow">Select and copy</span><textarea class="copybox" id="copybox" readonly>${esc(txt)}</textarea>`; const ta = $id('copybox'); ta.focus(); ta.select(); };
  try { navigator.clipboard.writeText(txt).then(() => toast('Upcoming trips copied'), fallback); } catch { fallback(); }
});

// ---------- stays ----------
const STAY_BRANDS = ['IHG', 'Hilton', 'Marriott', 'Hyatt', 'Wyndham', 'Choice', 'Accor', 'Best Western', 'Independent hotel', 'Airbnb', 'Vrbo', 'Vacation rental', 'Other'];
const BOOKED_VIA = ['Direct', 'Chase Travel', 'Capital One Travel', 'Amex Travel', 'Airbnb', 'Vrbo', 'Booking.com', 'Expedia', 'Hotels.com', 'Costco Travel', 'Someone else booked', 'Other'];
let stayEdit = null;
function sortStays(a) { return a.sort((x, y) => String(y.checkIn).localeCompare(String(x.checkIn))); }
const monthOnly = (s) => String(s.checkIn || '').length === 7;
function stayEnd(s) { if (monthOnly(s)) return null; const d = new Date(s.checkIn + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + (+s.nights || 0)); return d.toISOString().slice(0, 10); }
function stayDates(s) {
  const o = { timeZone: 'UTC' };
  if (monthOnly(s)) return new Date(s.checkIn + '-01T12:00:00Z').toLocaleDateString(undefined, { ...o, month: 'short', year: 'numeric' });
  const a = new Date(s.checkIn + 'T12:00:00Z'), b = new Date(stayEnd(s) + 'T12:00:00Z');
  const same = a.getUTCFullYear() === b.getUTCFullYear();
  return `${a.toLocaleDateString(undefined, { ...o, month: 'short', day: 'numeric', year: same ? undefined : 'numeric' })} – ${b.toLocaleDateString(undefined, { ...o, month: 'short', day: 'numeric', year: 'numeric' })}`;
}
const tripById = (id) => TRIPS.find((t) => t.id === id);
function stayCount(arr, key) { const m = {}; arr.forEach((s) => { const k = key(s); if (k) m[k] = (m[k] || 0) + (+s.nights || 0); }); return Object.entries(m).sort((a, b) => b[1] - a[1]); }
function barsHTML(rows, unit) { if (!rows.length) return `<p class="empty">Nothing yet.</p>`; const max = Math.max(...rows.map((r) => r[1]), 1); return `<ul class="bars">${rows.map(([k, n]) => `<li><span title="${esc(k)}">${esc(k)}</span><i style="--w:${Math.round(n / max * 100)}%"></i><b class="num">${n}</b></li>`).join('')}</ul>${unit ? `<span class="lw">${unit}</span>` : ''}`; }
// Fallback coordinates for common places, when a stay has no pin of its own
const PLACES = { 'seattle': [47.61, -122.33], 'portland': [45.52, -122.68], 'san francisco': [37.77, -122.42], 'los angeles': [34.05, -118.24], 'san diego': [32.72, -117.16], 'las vegas': [36.17, -115.14],
  'phoenix': [33.45, -112.07], 'denver': [39.74, -104.99], 'chicago': [41.88, -87.63], 'new york': [40.71, -74.01], 'boston': [42.36, -71.06], 'washington': [38.90, -77.04], 'miami': [25.76, -80.19],
  'orlando': [28.54, -81.38], 'atlanta': [33.75, -84.39], 'dallas': [32.78, -96.80], 'houston': [29.76, -95.37], 'austin': [30.27, -97.74], 'new orleans': [29.95, -90.07], 'nashville': [36.16, -86.78],
  'honolulu': [21.31, -157.86], 'maui': [20.80, -156.33], 'anchorage': [61.22, -149.90], 'vancouver': [49.28, -123.12], 'toronto': [43.65, -79.38], 'montreal': [45.50, -73.57], 'mexico city': [19.43, -99.13],
  'cancun': [21.16, -86.85], 'london': [51.51, -0.13], 'paris': [48.86, 2.35], 'madrid': [40.42, -3.70], 'barcelona': [41.39, 2.17], 'rome': [41.90, 12.50], 'lisbon': [38.71, -9.14], 'amsterdam': [52.37, 4.90],
  'tokyo': [35.68, 139.69], 'kyoto': [35.01, 135.77], 'osaka': [34.69, 135.50], 'seoul': [37.57, 126.98], 'singapore': [1.35, 103.82], 'sydney': [-33.87, 151.21] };
const placeKey = (c) => String(c || '').toLowerCase().split(',')[0].replace(/\s+(area|downtown)$/, '').trim();
function stayLoc(s) {
  if (s.lat != null && s.lat !== '' && isFinite(+s.lat) && isFinite(+s.lon)) return { lat: +s.lat, lon: +s.lon, how: 'pin' };
  const p = PLACES[placeKey(s.city)]; if (p) return { lat: p[0], lon: p[1], how: 'city' };
  const t = s.trip && tripById(s.trip); if (t) { const a = A(destOf(t)); if (a) return { lat: a.lat, lon: a.lon, how: 'approx' }; }
  return null;
}
let smRegion = null, smZoom = null, smProj = null, smT = d3.zoomIdentity, picking = false;
// Stays filters (Stays tab: list, totals and map together): hotel type (the stay's brand) and how it was paid
const STAY_F = { type: 'all', pay: 'all' };
const stayFiltered = () => STAY_F.type !== 'all' || STAY_F.pay !== 'all';
const shownStays = () => STAYS.filter((s) => (STAY_F.type === 'all' || (s.brand || 'Other') === STAY_F.type) && (STAY_F.pay === 'all' || (s.pay || 'none') === STAY_F.pay));
function renderStayFilters() {
  // Options come only from the stays you have
  const types = [...new Set(STAYS.map((s) => s.brand || 'Other'))].sort();
  const pays = [...new Set(STAYS.map((s) => s.pay || 'none'))].sort((a, b) => String(PAY_LABEL[a] || a).localeCompare(PAY_LABEL[b] || b));
  if (!types.includes(STAY_F.type)) STAY_F.type = 'all';
  if (!pays.includes(STAY_F.pay)) STAY_F.pay = 'all';
  $id('stayTypeSel').innerHTML = `<option value="all">All types</option>` + types.map((t) => `<option${t === STAY_F.type ? ' selected' : ''}>${esc(t)}</option>`).join('');
  $id('stayPaySel').innerHTML = `<option value="all">Any payment</option>` + pays.map((p) => `<option value="${esc(p)}"${p === STAY_F.pay ? ' selected' : ''}>${esc(p === 'none' ? 'Not recorded' : PAY_LABEL[p] || p)}</option>`).join('');
  $id('stayClear').hidden = !stayFiltered();
  const n = shownStays().length;
  $id('stayCount').textContent = stayFiltered() ? `Showing ${n} of ${STAYS.length} stays` : '';
}
function renderStayMap() {
  const svgS = d3.select('#stayMap'); if (svgS.empty()) return;
  const SH = shownStays();
  const placed = SH.map((s) => ({ s, loc: stayLoc(s) })).filter((x) => x.loc), missing = SH.filter((s) => !stayLoc(s));
  const isUSs = (x) => String(x.s.country || 'United States').trim() === 'United States';
  const regions = [['all', 'All'], ...(placed.some(isUSs) ? [['us', 'USA']] : []), ...(placed.some((x) => !isUSs(x)) ? [['abroad', 'Abroad']] : [])];
  // The map area you picked (or the starting one) is kept while filters narrow the stays, so
  // clearing them brings the same view back
  const fallback = regions.length > 2 && placed.filter(isUSs).length >= placed.length / 2 ? 'us' : 'all';
  if (smRegion == null && !stayFiltered()) smRegion = fallback;
  const reg = regions.some((r) => r[0] === smRegion) ? smRegion : fallback;
  $id('smRegion').innerHTML = regions.length > 2 ? regions.map(([k, l]) => `<button type="button" class="tab" data-smr="${k}" aria-selected="${k === reg}">${l}</button>`).join('') : '';
  const shown = placed.filter((x) => reg === 'all' || (reg === 'us') === isUSs(x));
  const groups = []; shown.forEach((x) => { const g = groups.find((q) => Math.abs(q.lat - x.loc.lat) < 0.02 && Math.abs(q.lon - x.loc.lon) < 0.02); if (g) g.items.push(x); else groups.push({ lat: x.loc.lat, lon: x.loc.lon, items: [x] }); });
  groups.forEach((g) => { g.nights = g.items.reduce((a, x) => a + (+x.s.nights || 0), 0); g.rental = g.items.every((x) => RENTAL.has(x.s.brand)); g.approx = g.items.every((x) => x.loc.how === 'approx'); g.city = String(g.items[0].s.city || '').split(',')[0]; });
  const mob = window.innerWidth < 640, Wm = mob ? 520 : 1000, Hm = mob ? 560 : 480; svgS.attr('viewBox', `0 0 ${Wm} ${Hm}`);
  const pr = d3.geoNaturalEarth1(), path = d3.geoPath(pr); smProj = pr;
  // A single place (e.g. after filtering) has no extent to fit, so frame a few degrees around it
  const fitAt = groups.length === 1 ? [-4, 4].flatMap((d) => [{ lon: groups[0].lon + d, lat: groups[0].lat + d / 2 }]) : groups;
  const pts = { type: 'MultiPoint', coordinates: (fitAt.length ? fitAt : [{ lon: -118.4, lat: 33.9 }, { lon: -74, lat: 40.7 }]).map((g) => [g.lon, g.lat]) };
  const lons = pts.coordinates.map((c) => c[0]); pr.rotate([lons.some((l) => l > 100) && lons.some((l) => l < -60) ? 150 : -d3.mean(lons), 0]);
  pr.fitExtent([[mob ? 30 : 60, 50], [Wm - (mob ? 120 : 170), Hm - 40]], pts);
  if (pr.scale() > 2600) { pr.scale(2600); const c = pr([d3.mean(lons), d3.mean(pts.coordinates.map((q) => q[1]))]); const t = pr.translate(); pr.translate([t[0] + Wm / 2 - c[0], t[1] + Hm / 2 - c[1]]); }
  svgS.selectAll('*').remove();
  const gz = svgS.append('g');
  gz.append('path').datum({ type: 'Sphere' }).attr('class', 'sea').attr('d', path);
  gz.append('path').datum(land).attr('class', 'landp').attr('d', path);
  const gd = svgS.append('g');
  const r = (n) => 4 + Math.sqrt(Math.max(1, n)) * 3.2;
  const xy = groups.map((g) => ({ g, p: pr([g.lon, g.lat]) })).sort((a, b) => b.g.nights - a.g.nights);
  const drawDots = (t) => {
    gd.selectAll('*').remove();
    const k = t.k, placedLbl = [];
    xy.forEach(({ g, p }) => {
      const [x, y] = t.apply(p); if (x < -20 || x > Wm + 20 || y < -20 || y > Hm + 20) return;
      const rr = r(g.nights) * Math.min(1.6, Math.sqrt(k)), el = gd.append('g').attr('transform', `translate(${x},${y})`);
      const c = el.append('circle').attr('r', rr).attr('class', 'smdot ' + (g.rental ? 'rental' : 'hotel')).attr('tabindex', 0).attr('role', 'button')
        .attr('aria-label', `${g.city}: ${g.items.map((i) => i.s.name).join(', ')}`).attr('stroke-dasharray', g.approx ? '3 2' : null);
      c.append('title').text(`${g.city}${g.approx ? ' (approximate)' : ''}\n` + g.items.map((i) => `${i.s.name} · ${+i.s.nights} night${+i.s.nights === 1 ? '' : 's'} · ${stayDates(i.s)}`).join('\n'));
      const go = (e) => { if (picking) return; e?.stopPropagation(); flashEl($id('stay-' + g.items[0].s.id)); };
      c.on('click', go).on('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(e); } });
      if (g.items.length > 1) el.append('text').attr('class', 'smcount').attr('text-anchor', 'middle').attr('dy', '0.35em').text(g.items.length);
      if (!placedLbl.some((q) => Math.abs(q[0] - x) < 70 && Math.abs(q[1] - y) < 16)) { placedLbl.push([x, y]); el.append('text').attr('class', 'smlbl').attr('x', rr + 4).attr('y', 4).text(g.city); }
    });
  };
  smZoom = d3.zoom().scaleExtent([1, 20]).on('zoom', (e) => { smT = e.transform; gz.attr('transform', e.transform); gz.selectAll('path').attr('stroke-width', 0.6 / e.transform.k); drawDots(e.transform); });
  svgS.call(smZoom).on('dblclick.zoom', null);
  smT = d3.zoomIdentity; drawDots(smT);
  const approx = placed.filter((x) => x.loc.how === 'approx').length;
  $id('smMissing').textContent = [missing.length ? `Not on the map yet: ${missing.map((s) => s.name).join(', ')}. Edit the stay to add its map pin.` : '', approx ? 'Dashed dots are approximate (no exact location saved).' : ''].filter(Boolean).join(' ');
}
// Pick a stay's pin by tapping the stay map
$id('stayMap').addEventListener('click', (e) => {
  if (!picking || !smProj) return;
  const [x, y] = smT.invert(d3.pointer(e, $id('stayMap'))); const ll = smProj.invert([x, y]);
  if (!ll || !isFinite(ll[0])) return;
  picking = false; $id('pickHint').hidden = true; $id('stayMap').classList.remove('picking');
  const f = $id('stayForm'); if (!f) return;
  f.pin.value = `${ll[1].toFixed(4)}, ${ll[0].toFixed(4)}`; f.querySelector('.msg').textContent = 'Pin set from the map.';
  f.scrollIntoView({ block: 'center' }); f.pin.focus();
});
root.addEventListener('click', (e) => { const b = e.target.closest('[data-smr]'); if (b) { smRegion = b.dataset.smr; renderStayMap(); } });
$id('smIn').addEventListener('click', () => { if (smZoom) d3.select('#stayMap').transition().duration(250).call(smZoom.scaleBy, 1.8); });
$id('smOut').addEventListener('click', () => { if (smZoom) d3.select('#stayMap').transition().duration(250).call(smZoom.scaleBy, 1 / 1.8); });
function renderStays() {
  $id('staysState').textContent = store.mode === 'demo' ? 'Demo · not saved' : 'Saved to your account';
  renderStayFilters();
  const SH = shownStays(); // after the hotel-type and payment filters
  const nights = SH.reduce((a, s) => a + (+s.nights || 0), 0);
  const hotelN = SH.filter((s) => !RENTAL.has(s.brand)).reduce((a, s) => a + (+s.nights || 0), 0);
  const portal = SH.filter((s) => /Travel$/.test(s.booked || '')).length;
  const pts = SH.filter((s) => s.pay !== 'other').reduce((a, s) => a + (+s.payPoints || 0), 0);
  const items = [[SH.length, 'Stays'], [nights, 'Nights'], [hotelN, 'Hotel nights'], [nights - hotelN, 'Rental nights'], [portal, 'Booked via card portals']];
  if (pts) items.push([pts >= 1e5 ? Math.round(pts / 1000) + 'k' : pts.toLocaleString(), 'Points used']);
  $id('stayStats').innerHTML = items.map(([v, k]) => `<div class="stat"><b class="num">${v}</b><span>${k}</span></div>`).join('');
  $id('stayBrands').innerHTML = `<span class="eyebrow">Nights by brand</span>${barsHTML(stayCount(SH, (s) => s.brand))}`;
  $id('stayChannels').innerHTML = `<span class="eyebrow">Nights by how it was booked</span>${barsHTML(stayCount(SH, (s) => s.booked || 'Not set'))}`;
  let html = '', yr = null;
  if (!STAYS.length) html = `<div class="panel empty-card"><b>No stays yet.</b><span class="lw">Add hotels and rentals to see them on the map and in your stats.</span></div>`;
  else if (!SH.length) html = `<div class="panel empty-card"><b>No stays match these filters.</b><span class="lw">Clear the filters above to see every stay.</span></div>`;
  SH.forEach((s) => {
    const y = String(s.checkIn).slice(0, 4); if (y !== yr) { yr = y; html += `<div class="year">${y}</div>`; }
    const t = s.trip && tripById(s.trip);
    const tr = t ? tierOf(t) : null;
    const chips = [`<span class="chip">${esc(s.brand || 'Other')}</span>`, `<span class="chip">${+s.nights || '?'} night${+s.nights === 1 ? '' : 's'}${+s.rooms > 1 ? ` · ${+s.rooms} rooms` : ''}</span>`,
      s.booked ? `<span class="chip">${esc(s.booked)}</span>` : '', s.pay ? `<span class="chip paychip pm-${esc(s.pay)}">${esc(payShort(s, 'stay'))}</span>` : '',
      t ? `<button type="button" class="chip linkchip" data-trip-go="${t.id}">✈ ${esc(t.name)} trip</button>` : ''].join('');
    html += `<article class="stay ${tr && tr !== 'past' ? 'up' : ''}" id="stay-${esc(s.id)}">
      <div class="stop"><div><h3>${esc(s.name)}</h3><span class="lw">${esc([s.city, s.country === 'United States' ? '' : s.country].filter(Boolean).join(', '))}</span></div><span class="mono num stdate">${esc(stayDates(s))}</span></div>
      <span class="chips">${chips}</span>
      ${s.note ? `<p class="lw stnote">${esc(s.note)}</p>` : ''}
      <div class="row"><button type="button" class="linkbtn" data-sedit="${esc(s.id)}">Edit</button><button type="button" class="linkbtn" data-sdel="${esc(s.id)}">Remove</button></div>
    </article>`;
  });
  const el = $id('stays'); el.innerHTML = html;
  el.querySelectorAll('[data-trip-go]').forEach((b) => b.addEventListener('click', () => { const t = tripById(b.dataset.tripGo); selTrip = t; editing = null; showTab('trips'); renderTrips(); draw(); requestAnimationFrame(() => root.querySelector(`.strip-head[data-id="${t.id}"]`)?.scrollIntoView({ block: 'start' })); }));
  el.querySelectorAll('[data-sedit]').forEach((b) => b.addEventListener('click', () => openStayForm(STAYS.find((x) => x.id === b.dataset.sedit))));
  el.querySelectorAll('[data-sdel]').forEach((b) => b.addEventListener('click', async () => { if (!twoStep(b, 'sdel' + b.dataset.sdel, 'Tap again to remove')) return; const s = STAYS.find((x) => x.id === b.dataset.sdel); await store.remove('stays', b.dataset.sdel); toast(`${s.name} removed`); }));
  if (!stayEdit) $id('stayFormPanel').innerHTML = '';
  try { renderStayMap(); } catch (err) { console.warn(err); }
}

// Finding a stay on the map: OpenStreetMap's Nominatim. Its usage policy asks for at most one
// request a second and caching, so lookups queue up and each answer is kept on the stay.
const geoCache = new Map();
let geoLast = 0;
async function geocode(q) {
  q = q.trim(); if (!q) return null;
  if (geoCache.has(q)) return geoCache.get(q);
  const wait = Math.max(0, geoLast + 1100 - Date.now()); geoLast = Date.now() + wait;
  if (wait) await new Promise((r) => setTimeout(r, wait));
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(q)}`, { headers: { 'Accept-Language': 'en' } });
    const [hit] = res.ok ? await res.json() : [];
    const out = hit ? { lat: +(+hit.lat).toFixed(5), lon: +(+hit.lon).toFixed(5) } : null;
    geoCache.set(q, out); return out;
  } catch { return null; }
}
function openStayForm(s) {
  stayEdit = s || {};
  const p = $id('stayFormPanel'), n = s || {};
  const trips = [...TRIPS].sort((a, b) => b.start - a.start);
  p.innerHTML = `<form class="panel purpose stayform" id="stayForm">
    <h3 style="font-size:20px;text-transform:uppercase;margin:0">${s ? 'Edit stay' : 'Add a stay'}</h3>
    <div class="paygrid">
      <label class="pf wide">Hotel or rental name<input name="name" required maxlength="100" value="${esc(n.name || '')}"></label>
      <label class="pf">Brand<select name="brand">${STAY_BRANDS.map((b) => `<option ${n.brand === b ? 'selected' : ''}>${b}</option>`).join('')}</select></label>
      <label class="pf">City<input name="city" maxlength="60" value="${esc(n.city || '')}" placeholder="e.g. Portland, OR"></label>
      <label class="pf">Country<input name="country" maxlength="40" value="${esc(n.country || 'United States')}"></label>
      <label class="pf">Check-in<input name="checkIn" type="date" value="${monthOnly(n) ? '' : esc(n.checkIn || '')}" ${s && monthOnly(n) ? '' : 'required'}></label>
      <label class="pf">Nights<input name="nights" type="number" min="1" max="90" required value="${esc(n.nights || 1)}"></label>
      <label class="pf">Rooms<input name="rooms" type="number" min="1" max="10" value="${esc(n.rooms || 1)}"></label>
      <label class="pf">Booked through<select name="booked"><option value="">Not set</option>${BOOKED_VIA.map((b) => `<option ${n.booked === b ? 'selected' : ''}>${b}</option>`).join('')}</select></label>
      <label class="pf">Part of trip<select name="trip"><option value="">No flight trip</option>${trips.map((t) => `<option value="${t.id}" ${n.trip === t.id ? 'selected' : ''}>${esc(t.name)} · ${t.startLocal.slice(0, 7)}</option>`).join('')}</select></label>
      <label class="pf wide">Note<input name="note" maxlength="300" value="${esc(n.note || '')}"></label>
      <label class="pf wide">Map pin (latitude, longitude)<input name="pin" maxlength="40" inputmode="decimal" placeholder="Leave empty to look it up from the name and city" value="${n.lat != null && n.lat !== '' ? esc(n.lat + ', ' + n.lon) : ''}"></label>
    </div>
    <div class="row" style="justify-content:flex-start"><button type="button" class="btn" data-geo>Find it on the map</button><button type="button" class="btn" data-pick>Pick on the map</button></div>
    ${payFormHTML(n, 'stay')}
    <div class="row"><span class="msg lw" style="margin-right:auto">${where()}</span>
      <button type="button" class="btn" data-scancel>Cancel</button><button type="submit" class="btn primary">${s ? 'Save' : 'Add stay'}</button></div>
  </form>`;
  const f = $id('stayForm'), msg = () => f.querySelector('.msg');
  syncPayForm(f); f.addEventListener('change', (e) => { if (e.target.name === 'pay' || e.target.name === 'payCard') syncPayForm(f); });
  f.querySelector('[data-scancel]').addEventListener('click', () => { stayEdit = null; picking = false; $id('pickHint').hidden = true; p.innerHTML = ''; renderStays(); });
  f.querySelector('[data-geo]').addEventListener('click', async () => {
    msg().textContent = 'Looking it up…';
    const hit = await geocode([f.name.value, f.city.value, f.country.value].filter(Boolean).join(', ')) || await geocode([f.city.value, f.country.value].filter(Boolean).join(', '));
    if (hit) { f.pin.value = `${hit.lat}, ${hit.lon}`; msg().textContent = 'Found it. Check the pin, then save.'; }
    else msg().textContent = "Couldn't find that. Pick the spot on the map, or paste coordinates.";
  });
  f.querySelector('[data-pick]').addEventListener('click', () => {
    picking = true; $id('pickHint').hidden = false; $id('stayMap').classList.add('picking');
    $id('stayMap').scrollIntoView({ block: 'center', behavior: reduceMotion() ? 'auto' : 'smooth' });
  });
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = { name: f.name.value.trim(), brand: f.brand.value, city: f.city.value.trim(), country: f.country.value.trim(),
      checkIn: f.checkIn.value || (s && monthOnly(s) ? s.checkIn : ''), nights: Math.max(1, Math.round(+f.nights.value || 1)), rooms: Math.max(1, Math.round(+f.rooms.value || 1)),
      booked: f.booked.value, trip: f.trip.value, note: f.note.value.trim(), ...readPay(f) };
    const m = String(f.pin.value || '').match(/(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)/);
    if (m && Math.abs(+m[1]) <= 90 && Math.abs(+m[2]) <= 180) { d.lat = +(+m[1]).toFixed(5); d.lon = +(+m[2]).toFixed(5); }
    else if (String(f.pin.value || '').trim()) { msg().textContent = 'Map pin should look like 41.147, -8.611.'; return; }
    if (!d.name || !d.checkIn) { msg().textContent = 'Add a name and check-in date.'; return; }
    if (d.rooms === 1) delete d.rooms;
    const btn = f.querySelector('[type="submit"]'); btn.disabled = true;
    if (d.lat == null && d.city) { msg().textContent = 'Placing it on the map…'; const hit = await geocode([d.name, d.city, d.country].join(', ')) || await geocode([d.city, d.country].join(', ')); if (hit) Object.assign(d, hit); }
    const prev = s ? (await store.list('stays')).find((x) => x.id === s.id) : { createdAt: new Date().toISOString() };
    stayEdit = null; picking = false; $id('pickHint').hidden = true; p.innerHTML = '';
    await store.put('stays', fromStay(d, prev)); toast(s ? 'Stay updated' : 'Stay added');
  });
  p.scrollIntoView({ block: 'start' }); f.name.focus();
}
$id('addStayBtn').addEventListener('click', () => openStayForm(null));
function tripStaysHTML(t) {
  const ss = STAYS.filter((s) => s.trip === t.id).sort((a, b) => String(a.checkIn).localeCompare(String(b.checkIn)));
  if (!ss.length) return '';
  return `<div class="purpose"><span class="eyebrow">Where you stayed</span><ul class="tl">${ss.map((s) => `<li><button type="button" class="linkbtn" data-stay-go="${esc(s.id)}">${esc(s.name)}</button> <span class="lw">${esc(stayDates(s))} · ${+s.nights} night${+s.nights === 1 ? '' : 's'} · ${esc(s.brand)}${s.pay ? ' · ' + esc(payShort(s, 'stay')) : ''}</span></li>`).join('')}</ul></div>`;
}

// ---------- settings ----------
let csvPreview = null;
function renderSettings() {
  const p = $id('p-settings');
  const who = whoNow() === 'Anyone' ? (owners()[0] || OWNER) : whoNow();
  const held = new Set(WALLET.filter((c) => (c.owner || OWNER) === who).map((c) => c.key));
  const homes = PROFILE.homeAirports || ['LAX'];
  p.innerHTML = `<div class="grid">
  <div class="col">
    <form class="panel addform" id="profileForm">
      <h3 style="font-size:20px;text-transform:uppercase">You</h3>
      <div class="frow">
        <label class="fl">Name on the log<input name="displayName" maxlength="40" value="${esc(PROFILE.displayName || '')}" placeholder="e.g. Alex & Jordan"></label>
      </div>
      <div class="paygrid">${aptField('Home airport', 'home1', homes[0])}${aptField('Second home airport (optional)', 'home2', homes[1] || '')}</div>
      <div class="row"><span class="msg lw" style="margin-right:auto">${where()}</span><button type="submit" class="btn primary">Save</button></div>
    </form>
    <div class="panel">
      <h3 style="font-size:20px;text-transform:uppercase">Cards I hold</h3>
      ${owners().length > 1 ? whoChooser({ anyone: false }) : ''}
      <p class="lw" style="margin:0">Tick the cards ${esc(who)} carries. Lounge access across Contrail follows these. More options on <button type="button" class="linkbtn" data-goto="cards">My cards</button>.</p>
      <div class="checks cardchecks">${CARD_CATALOG.map((c) => `<label><input type="checkbox" data-hold="${c.k}" ${held.has(c.k) ? 'checked' : ''}> ${esc(c.n)}${c.t.length ? '' : ' <span class="lw">(no lounges)</span>'}</label>`).join('')}</div>
    </div>
    <div class="panel">
      <h3 style="font-size:20px;text-transform:uppercase">Color mode</h3>
      <p class="lw" style="margin:0">Contrail follows the site's color mode switch at the top of the page.</p>
      <div class="row" style="justify-content:flex-start"><button type="button" class="btn" data-theme-next>Switch color mode</button></div>
    </div>
  </div>
  <div class="col">
    <div class="panel">
      <h3 style="font-size:20px;text-transform:uppercase">Import flights from a CSV</h3>
      <p class="lw" style="margin:0">${CSV_HELP}</p>
      <label class="fl" for="csvFile">CSV file<input type="file" id="csvFile" accept=".csv,text/csv"></label>
      <div id="csvOut">${csvPreview ? csvPreviewHTML() : ''}</div>
    </div>
    <div class="panel">
      <h3 style="font-size:20px;text-transform:uppercase">Back up and restore</h3>
      <p class="lw" style="margin:0">Everything in Contrail (trips, stays, cards, settings) as one JSON file.</p>
      <div class="row" style="justify-content:flex-start"><button type="button" class="btn" data-export>Download JSON</button></div>
      <label class="fl" for="jsonFile">Restore from a JSON file<input type="file" id="jsonFile" accept="application/json,.json"></label>
      <p class="lw" style="margin:0">Restoring replaces everything currently in Contrail.</p>
    </div>
    <div class="panel">
      <h3 style="font-size:20px;text-transform:uppercase">Sample data</h3>
      <p class="lw" style="margin:0">The demo starts with Alex &amp; Jordan's made-up travels. Clear them to see Contrail empty, or bring them back.</p>
      <div class="row" style="justify-content:flex-start"><button type="button" class="btn" data-clear>Clear sample data</button><button type="button" class="btn" data-sample>Load sample data</button></div>
    </div>
  </div></div>`;
}
function csvPreviewHTML() {
  const c = csvPreview;
  if (c.error) return `<p class="empty">${esc(c.error)}</p>`;
  return `<p class="lw">${c.flights} flights in ${c.trips.length} trips${c.skipped ? `; ${c.skipped} rows skipped (unknown airport or missing date)` : ''}.</p>
    <ul class="tl">${c.trips.slice(0, 8).map((t) => `<li><b>${esc(t.name)}</b> <span class="lw">${esc(t.legs[0].depLocal.slice(0, 10))} · ${t.legs.map((l) => l.from).concat(t.legs[t.legs.length - 1].to).join(' → ')}</span></li>`).join('')}${c.trips.length > 8 ? `<li class="lw">and ${c.trips.length - 8} more</li>` : ''}</ul>
    <div class="row" style="justify-content:flex-start"><button type="button" class="btn primary" data-csv-go>Import ${c.flights} flights</button><button type="button" class="btn" data-csv-cancel>Cancel</button></div>`;
}
root.addEventListener('submit', async (e) => {
  if (e.target.id !== 'profileForm') return;
  e.preventDefault();
  const f = e.target, h1 = codeOf(f.home1.value), h2 = codeOf(f.home2.value);
  if (!h1) { f.querySelector('.msg').textContent = 'Pick a home airport from the list.'; return; }
  await saveProfile({ displayName: f.displayName.value.trim(), homeAirports: [h1, ...(h2 && h2 !== h1 ? [h2] : [])] });
  toast('Settings saved');
});
root.addEventListener('change', async (e) => {
  const t = e.target;
  if (t.dataset.hold) {
    const who = whoNow() === 'Anyone' ? (owners()[0] || OWNER) : whoNow(), c = CAT[t.dataset.hold];
    if (t.checked) await addCard({ key: c.k, name: c.short, owner: who, tags: [] });
    else await saveProfile({ cards: WALLET.filter((x) => !(x.key === c.k && (x.owner || OWNER) === who)) });
  } else if (t.id === 'csvFile' && t.files[0]) {
    csvPreview = parseFlightsCsv(await t.files[0].text(), { home: PROFILE.homeAirports || [HOME] });
    $id('csvOut').innerHTML = csvPreviewHTML();
  } else if (t.id === 'jsonFile' && t.files[0]) {
    // Any problem (not JSON, wrong shape, a bad field) stops here with a message; nothing is replaced
    try { await importJson(JSON.parse(await t.files[0].text())); } catch (err) { toast(err instanceof BackupError ? err.message : "That file isn't a Contrail backup."); }
    t.value = ''; // the same file can be picked again after fixing it
  }
});
root.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-export],[data-clear],[data-sample],[data-csv-go],[data-csv-cancel],[data-theme-next]'); if (!b) return;
  if (b.dataset.themeNext !== undefined) document.querySelector('.theme-toggle')?.click();
  if (b.dataset.export !== undefined) {
    const data = { app: 'Contrail', version: 1, exportedAt: new Date().toISOString(), profile: PROFILE, trips: await store.list('trips'), stays: await store.list('stays') };
    saveFile(`contrail-backup-${isoDate(new Date())}.json`, JSON.stringify(data, null, 2));
  }
  if (b.dataset.clear !== undefined && twoStep(b, 'clear', 'Tap again to clear')) { await store.reset({ docs: { profile: { displayName: '', homeAirports: PROFILE.homeAirports || ['LAX'], cards: [] } } }); toast('Sample data cleared'); }
  if (b.dataset.sample !== undefined) { await store.reset(contrailDemo(airport)); toast('Sample data loaded'); }
  if (b.dataset.csvCancel !== undefined) { csvPreview = null; $id('csvOut').innerHTML = ''; $id('csvFile').value = ''; }
  if (b.dataset.csvGo !== undefined && csvPreview?.trips) {
    const n = csvPreview.flights; for (const t of csvPreview.trips) await store.put('trips', t);
    csvPreview = null; toast(`Imported ${n} flights`); showTab('trips');
  }
});
// A backup from Contrail (this version), or Billy's extracted seed: { profile?, trips[], stays[] }
async function importJson(o) {
  // Checked in full first (contrail/backup.js): only clean, known fields get through
  const { trips, stays, profile } = checkBackup(o, (code) => Boolean(airport(code)));
  await store.reset({ collections: { trips, stays }, docs: { profile: profile || PROFILE } });
  toast(`Restored ${trips.length} trips and ${stays.length} stays`);
}

// ---------- start ----------
let chipsYears = [];
function renderYearChips() {
  const allYears = [...new Set(TRIPS.map((t) => t.startLocal.slice(0, 4)))].sort();
  [...YEARS].forEach((y) => { if (!allYears.includes(y)) YEARS.delete(y); });
  chipsYears = allYears;
  $id('yearChips').innerHTML = `<button type="button" class="yr" data-y="all" aria-pressed="${YEARS.size === 0}">All</button>` + allYears.map((y) => `<button type="button" class="yr" data-y="${y}" aria-pressed="${YEARS.has(y)}">${y}</button>`).join('');
  // Airlines: only the ones in your flights, by name
  const codes = [...new Set(TRIPS.flatMap((t) => t.legs.map((l) => l.airline)).filter(Boolean))].sort((a, b) => airlineName(a).localeCompare(airlineName(b)));
  if (AIRLINE !== 'all' && !codes.includes(AIRLINE)) AIRLINE = 'all';
  $id('airlineSel').innerHTML = `<option value="all">All airlines</option>` + codes.map((c) => `<option value="${esc(c)}"${c === AIRLINE ? ' selected' : ''}>${esc(airlineName(c))}</option>`).join('');
}
function renderAll() {
  // In the demo each page starts fresh, so tell the analytics page when the sample data is gone
  $id('analyticsLink').href = '/contrail/analytics/' + (store.mode === 'demo' && !TRIPS.length && !STAYS.length ? '?sample=none' : '');
  renderOwner(); renderYearChips(); renderLegend(); renderNext(); renderStats();
  if (!editing) renderTrips();
  renderApts(); renderAptDetail(); renderWallet(); renderAddForm();
  if (TAB === 'stays' && !stayEdit) renderStays();
  if (TAB === 'settings') renderSettings();
  draw();
}
(function wire() {
  const st = prefs.get('mapstyle'); if (st && styleSel.querySelector(`option[value="${st}"]`)) { styleSel.value = st; mapbox.dataset.mapstyle = st; }
  $id('soonSel').value = String(SOON);
  const v = prefs.get('view'); if (v && v !== 'all') { view = v; root.querySelectorAll('.maptools .tab').forEach((x) => x.setAttribute('aria-selected', x.dataset.v === v)); }
  try { const sy = JSON.parse(prefs.get('years') || '[]'); if (Array.isArray(sy)) sy.forEach((y) => YEARS.add(y)); } catch { /* ignore */ }
  $id('yearChips').addEventListener('click', (e) => {
    const b = e.target.closest('.yr'); if (!b) return;
    const y = b.dataset.y;
    if (y === 'all') YEARS.clear(); else { if (YEARS.has(y)) YEARS.delete(y); else YEARS.add(y); if (YEARS.size === chipsYears.length) YEARS.clear(); }
    prefs.set('years', JSON.stringify([...YEARS])); selTrip = null; editing = null;
    renderYearChips(); renderStats(); renderTrips(); draw();
  });
  const rc = $id('regionChips');
  const drawRegion = () => rc.querySelectorAll('.yr').forEach((b) => b.setAttribute('aria-pressed', b.dataset.r === REGION));
  { const sr = prefs.get('region'); if (sr && REGION_LABEL[sr]) REGION = sr; }
  rc.addEventListener('click', (e) => {
    const b = e.target.closest('.yr'); if (!b) return;
    REGION = b.dataset.r; prefs.set('region', REGION); selTrip = null; editing = null;
    drawRegion(); renderStats(); renderTrips(); draw();
  });
  drawRegion();
  { const sa = prefs.get('airline'); if (sa) AIRLINE = sa; }
  // Stays filters
  $id('stayTypeSel').addEventListener('change', (e) => { STAY_F.type = e.target.value; renderStays(); });
  $id('stayPaySel').addEventListener('change', (e) => { STAY_F.pay = e.target.value; renderStays(); });
  $id('stayClear').addEventListener('click', () => { STAY_F.type = STAY_F.pay = 'all'; renderStays(); });
  $id('airlineSel').addEventListener('change', (e) => {
    AIRLINE = e.target.value; prefs.set('airline', AIRLINE); selTrip = null; editing = null;
    renderStats(); renderTrips(); draw();
  });
  // Clear filters: every year, both regions, any airline
  $id('clearFilt').addEventListener('click', () => {
    YEARS.clear(); REGION = 'all'; AIRLINE = 'all';
    prefs.set('years', '[]'); prefs.set('region', 'all'); prefs.set('airline', 'all'); selTrip = null; editing = null;
    renderYearChips(); drawRegion(); renderStats(); renderTrips(); draw();
  });
  const ft = $id('filtToggle'), fp = $id('filtPanel');
  const setFilt = (on) => { fp.hidden = !on; ft.setAttribute('aria-expanded', on); prefs.set('filters', on ? 'open' : 'closed'); if (mapbox.classList.contains('expanded')) requestAnimationFrame(draw); };
  ft.addEventListener('click', () => setFilt(fp.hidden));
  setFilt(prefs.get('filters') === 'open');
})();

demoBanner($id('demoBanner'), 'Contrail');
await store.reset(contrailDemo(airport));
await load();
let t0 = prefs.get('tab') || 'overview'; try { const h = location.hash.slice(1); if (TABS.includes(h)) t0 = h; } catch { /* ignore */ }
TAB = t0;
renderAll();
showTab(t0);
// Any change (a form, an import, sample data) reloads from the store and redraws
store.subscribe(async () => { const keep = selTrip?.id; await load(); selTrip = keep ? TRIPS.find((t) => t.id === keep) || null : null; renderAll(); });
setInterval(renderAptDetail, 60000);
