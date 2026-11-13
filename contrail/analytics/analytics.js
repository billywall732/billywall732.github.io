// Contrail's analytics page: nine sections of charts built from the same trips and stays as the
// app. SVG and D3, colors from the app's CSS variables so every chart follows the color mode.
/* global d3, topojson */
import { connectStore, store } from '/shared/store.js?v=3';
import { airlineName, airport, deriveTrip, loadAirports, nightsOf, RENTAL } from '/shared/trips.js';
import { PAY_LABEL } from '/shared/travel.js';
import { demoBanner, setUpApp } from '/shared/app-shell.js?v=4';
import { contrailDemo } from '/contrail/demo-data.js';

setUpApp();
// On a phone the Contrail tab bar scrolls sideways; bring the active Analytics tab into view
{ const bar = document.querySelector('.pagetabs .tabscroll'), a = bar?.querySelector('[aria-current="page"]'); if (a) bar.scrollLeft = a.offsetLeft + a.offsetWidth - bar.clientWidth + 24; }
const $id = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => Math.round(n).toLocaleString();
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const NOW = Date.now();
const EARTH = 24901; // miles around the equator

await loadAirports();
const [WORLD, US] = await Promise.all([
  fetch('https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-110m.json').then((r) => r.json()),
  fetch('https://cdn.jsdelivr.net/npm/us-atlas@3.0.1/states-10m.json').then((r) => r.json()),
]);
// Approved members see their own trips. Demo: the same sample data as the app (edits made on
// the app page aren't kept between pages); ?sample=none starts empty, as after "Clear sample
// data" in Contrail's settings.
demoBanner($id('demoBanner'), 'Contrail', await connectStore('contrail'));
const noSample = new URLSearchParams(location.search).get('sample') === 'none';
if (store.mode === 'demo') await store.reset(noSample ? { docs: { profile: { homeAirports: ['LAX'] } } } : contrailDemo(airport));

const STATE_NAMES = { AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming', PR: 'Puerto Rico' };
// OurAirports country names that the world map spells differently
const MAP_NAME = { 'United States': 'United States of America', 'Czechia': 'Czechia', 'Bosnia and Herzegovina': 'Bosnia and Herz.', 'Dominican Republic': 'Dominican Rep.', 'South Korea': 'South Korea', 'Russia': 'Russia' };

let TRIPS = [], STAYS = [], PROFILE = {}, YEAR = 'all';
async function load() {
  PROFILE = (await store.getDoc('profile')) || {};
  TRIPS = (await store.list('trips')).filter((t) => !t.hidden).map(deriveTrip).filter(Boolean).sort((a, b) => a.start - b.start);
  STAYS = (await store.list('stays')).filter((s) => !s.hidden && s.checkIn).map((s) => ({ ...s, nights: nightsOf(s) })).sort((a, b) => a.checkIn.localeCompare(b.checkIn));
}
const yearsOf = () => [...new Set([...TRIPS.map((t) => t.startLocal.slice(0, 4)), ...STAYS.map((s) => s.checkIn.slice(0, 4))])].sort();
const inYear = (d) => YEAR === 'all' || String(d).startsWith(YEAR);
const trips = () => TRIPS.filter((t) => inYear(t.startLocal));
const flown = () => trips().filter((t) => t.end < NOW);
const legs = () => trips().flatMap((t) => t.legs.map((l) => ({ ...l, t })));
const stays = () => STAYS.filter((s) => inYear(s.checkIn));
const countBy = (arr, key, val = () => 1) => { const m = new Map(); for (const x of arr) { const k = key(x); if (k != null && k !== '') m.set(k, (m.get(k) || 0) + val(x)); } return [...m].sort((a, b) => b[1] - a[1]); };
const empty = (what) => `<p class="empty an-empty">${what}</p>`;

// ---------- small chart helpers ----------
function bars(rows, { unit = '', fmtV = fmt, max = 10 } = {}) {
  if (!rows.length) return '';
  const top = rows.slice(0, max), m = Math.max(...top.map((r) => r[1]), 1);
  return `<ul class="bars">${top.map(([k, n]) => `<li><span title="${esc(k)}">${esc(k)}</span><i style="--w:${Math.round(n / m * 100)}%"></i><b class="num">${fmtV(n)}</b></li>`).join('')}</ul>${unit ? `<span class="lw">${unit}${rows.length > max ? ` · top ${max} of ${rows.length}` : ''}</span>` : ''}`;
}
function svgBox(w, h, label) { return d3.create('svg').attr('viewBox', `0 0 ${w} ${h}`).attr('role', 'img').attr('aria-label', label).attr('class', 'an-svg'); }
const mobile = () => innerWidth < 640;


// Activity columns: a month per column in a single year, a quarter per column across all years
// (monthly counts are too small to compare over several years). Done (flown, stayed) is solid
// accent; still to come (booked) is a lighter dashed segment on top. A summary row, a dashed
// average line, the busiest period labeled, and a hover box listing what happened then.
const UNIT = { flights: ['flight', 'flights'], miles: ['mile', 'miles'], nights: ['night', 'nights'] };
const per = (metric, n) => `${fmt(n)} ${UNIT[metric][Math.round(n) === 1 ? 0 : 1]}`;
const QMON = ['Jan–Mar', 'Apr–Jun', 'Jul–Sep', 'Oct–Dec'];
function activityChart(metric) {
  const today = new Date().toISOString().slice(0, 10), byQ = YEAR === 'all';
  const key = (d) => (byQ ? `${d.slice(0, 4)}-Q${Math.ceil(+d.slice(5, 7) / 3)}` : d.slice(0, 7));
  const label = (k) => (byQ ? `${QMON[+k.slice(-1) - 1]} ${k.slice(0, 4)}` : `${MON[+k.slice(5) - 1]} ${k.slice(0, 4)}`);
  const pname = byQ ? 'quarter' : 'month';
  const L = legs(), S = stays();
  // [date, value, still to come?, what it was]
  const val = metric === 'nights'
    ? S.map((s) => [s.checkIn, s.nights, s.checkIn > today, s.name || s.brand || s.city])
    : L.map((l) => { const d = l.dep || l.t.startLocal; return [d.slice(0, 10), metric === 'miles' ? l.mi : 1, d.slice(0, 10) > today, l.t.name]; });
  if (!val.length) return null;
  const sorted = val.map((v) => v[0]).sort();
  let periods;
  if (byQ) { periods = []; const [a, b] = [key(sorted[0]), key(sorted[sorted.length - 1])]; for (let y = +a.slice(0, 4); y <= +b.slice(0, 4); y++) for (let q = 1; q <= 4; q++) { const k = `${y}-Q${q}`; if (k >= a && k <= b) periods.push(k); } }
  else periods = MON.map((_, i) => `${YEAR}-${String(i + 1).padStart(2, '0')}`);
  const P = new Map(periods.map((k) => [k, { done: 0, booked: 0, what: new Map() }]));
  val.forEach(([d, v, future, what]) => { const o = P.get(key(d)); if (!o) return; o[future ? 'booked' : 'done'] += v; if (what) o.what.set(what, (o.what.get(what) || 0) + v); });
  const tot = (k) => P.get(k).done + P.get(k).booked;
  const total = periods.reduce((a, k) => a + tot(k), 0), booked = periods.reduce((a, k) => a + P.get(k).booked, 0);
  // The average runs over periods up to now (all of them if the whole span is in the past)
  const nowKey = key(today), counted = periods.filter((k) => k <= nowKey);
  const avg = counted.length ? counted.reduce((a, k) => a + P.get(k).done, 0) / counted.length : 0;
  const max = d3.max(periods, tot), tops = max ? periods.filter((k) => tot(k) === max) : [];
  const active = periods.filter((k) => tot(k) > 0).length;
  const short = (v) => (metric === 'miles' ? d3.format('.2~s')(v) : Number.isInteger(v) ? fmt(v) : v.toFixed(1));

  const narrow = mobile(), w = narrow ? 440 : 1000, h = narrow ? 250 : 270, pad = { l: narrow ? 34 : 46, r: narrow ? 46 : 64, t: 22, b: byQ ? 40 : 26 };
  const x = d3.scaleBand().domain(periods).range([pad.l, w - pad.r]).paddingInner(periods.length > 24 ? 0.14 : 0.28).paddingOuter(0.1);
  const y = d3.scaleLinear().domain([0, Math.max(max, avg) || 1]).nice(4).range([h - pad.b, pad.t]);
  const half = x.step() * x.paddingInner() / 2;
  // Whole-number steps for flights and nights; miles as 12k
  const ticks = y.ticks(4).filter((t) => metric === 'miles' || Number.isInteger(t));
  const svg = svgBox(w, h, `${UNIT[metric][1]} per ${pname}`);
  svg.append('g').attr('class', 'an-grid').selectAll('line').data(ticks).join('line').attr('x1', pad.l).attr('x2', w - pad.r).attr('y1', y).attr('y2', y);
  svg.append('g').attr('class', 'an-axis').selectAll('text').data(ticks).join('text').attr('x', pad.l - 6).attr('y', (d) => y(d) + 4).attr('text-anchor', 'end').text(metric === 'miles' ? d3.format('~s') : d3.format('d'));
  // Year boundaries across all years
  if (byQ) svg.append('g').attr('class', 'an-yeardiv').selectAll('line').data(periods.filter((k, i) => i && k.endsWith('Q1'))).join('line').attr('x1', (k) => x(k) - half).attr('x2', (k) => x(k) - half).attr('y1', pad.t - 10).attr('y2', h - 2);
  // "So far" marker when there are booked periods after today
  if (P.has(nowKey) && periods[periods.length - 1] !== nowKey) {
    const nx = x(nowKey) + x.bandwidth() + half;
    svg.append('line').attr('class', 'an-now').attr('x1', nx).attr('x2', nx).attr('y1', pad.t - 10).attr('y2', h - pad.b);
    svg.append('text').attr('class', 'an-axis an-nowlbl').attr('x', nx - 4).attr('y', pad.t - 4).attr('text-anchor', 'end').text('← so far');
  }
  const r = Math.min(4, x.bandwidth() / 3), base = y(0);
  // A column with rounded top corners, square at the baseline
  const col = (x0, y0, wd, hgt, round) => (hgt <= 0 ? '' : round
    ? `M${x0},${y0 + hgt}V${y0 + r}Q${x0},${y0} ${x0 + r},${y0}H${x0 + wd - r}Q${x0 + wd},${y0} ${x0 + wd},${y0 + r}V${y0 + hgt}Z`
    : `M${x0},${y0}h${wd}v${hgt}h${-wd}Z`);
  const g = svg.append('g');
  periods.forEach((k) => {
    const o = P.get(k), x0 = x(k), wd = x.bandwidth();
    if (!tot(k)) { g.append('rect').attr('class', 'an-zero').attr('x', x0).attr('y', base - 2).attr('width', wd).attr('height', 2); return; }
    const yDone = y(o.done), yAll = y(tot(k)), gap = o.done && o.booked ? 2 : 0;
    if (o.done) g.append('path').attr('class', 'an-bar').attr('d', col(x0, yDone, wd, base - yDone, !o.booked));
    if (o.booked) g.append('path').attr('class', 'an-bar an-booked').attr('d', col(x0 + .75, yAll + .75, wd - 1.5, yDone - yAll - gap - 1.5, true));
  });
  // Average, labeled in the right margin
  if (avg > 0) {
    svg.append('line').attr('class', 'an-avg').attr('x1', pad.l).attr('x2', w - pad.r + 4).attr('y1', y(avg)).attr('y2', y(avg));
    svg.append('text').attr('class', 'an-axis an-avglbl').attr('x', w - pad.r + 8).attr('y', y(avg) + 4).text(`avg ${short(avg)}`);
  }
  // Label the busiest period (only when one stands out)
  if (tops.length === 1) svg.append('text').attr('class', 'an-toplbl').attr('x', x(tops[0]) + x.bandwidth() / 2).attr('y', y(max) - 6).attr('text-anchor', 'middle').text(short(max));
  const ax = svg.append('g').attr('class', 'an-axis');
  if (byQ) {
    ax.selectAll('text.q').data(narrow ? periods.filter((k) => /Q[13]$/.test(k)) : periods).join('text').attr('class', 'q').attr('x', (k) => x(k) + x.bandwidth() / 2).attr('y', h - pad.b + 15).attr('text-anchor', 'middle').text((k) => k.slice(-2));
    const years = [...new Set(periods.map((k) => k.slice(0, 4)))];
    ax.selectAll('text.yr').data(years).join('text').attr('class', 'yr an-yrlbl').attr('text-anchor', 'middle').attr('y', h - 3)
      .attr('x', (yr) => { const ks = periods.filter((k) => k.startsWith(yr)); return (x(ks[0]) + x(ks[ks.length - 1]) + x.bandwidth()) / 2; }).text((yr) => yr);
  } else {
    ax.selectAll('text').data(periods).join('text').attr('x', (k) => x(k) + x.bandwidth() / 2).attr('y', h - 8).attr('text-anchor', 'middle').text((k) => (narrow ? MON[+k.slice(5) - 1][0] : MON[+k.slice(5) - 1]));
  }
  // Hover and tap targets: the full column height and the gaps either side
  svg.append('g').selectAll('rect').data(periods).join('rect').attr('class', 'an-hit').attr('x', (k) => x(k) - half).attr('width', x.step()).attr('y', pad.t).attr('height', h - pad.b - pad.t)
    .attr('data-tip', (k) => { const o = P.get(k), items = [...o.what].sort((a, b) => b[1] - a[1]); return JSON.stringify({ t: label(k), v: tot(k) ? per(metric, tot(k)) : `No ${UNIT[metric][1]}`, b: o.booked && o.done ? `${per(metric, o.done)} done · ${per(metric, o.booked)} booked` : o.booked ? 'Booked, still to come' : '', w: items.slice(0, 5).map(([n]) => n), more: Math.max(0, items.length - 5) }); })
    .attr('aria-label', (k) => `${label(k)}: ${per(metric, tot(k))}`);
  const busiest = !tops.length ? ['—', `busiest ${pname}`] : tops.length === 1 ? [label(tops[0]), `busiest ${pname}, ${per(metric, max)}`] : [per(metric, max), `most in a ${pname}, ${tops.length} ${pname}s tied`];
  const summary = [[per(metric, total), YEAR === 'all' ? 'in all' : `in ${YEAR}`], [`${short(avg)} ${UNIT[metric][1]}`, `a ${pname} on average`], busiest, [`${active} of ${periods.length}`, `${pname}s with ${UNIT[metric][1]}`]];
  return `<div class="an-sum">${summary.map(([v, k]) => `<div><b>${esc(v)}</b><span>${esc(k)}</span></div>`).join('')}</div>
    <div class="an-colchart">${svg.node().outerHTML}</div>
    <div class="legend an-legend"><span><i class="an-key l2"></i>${metric === 'nights' ? 'Stayed' : 'Flown'}</span>${booked ? '<span><i class="an-key an-key-booked"></i>Booked, still to come</span>' : ''}${avg ? `<span><i class="an-key an-key-avg"></i>${byQ ? 'Quarterly' : 'Monthly'} average so far</span>` : ''}<span>${byQ ? 'Pick a year above for month by month. ' : ''}Point at a column for details.</span></div>`;
}
// One shared hover box for the activity columns
const tip = document.createElement('div'); tip.className = 'an-tip'; tip.hidden = true; document.querySelector('.contrail-app').append(tip);
function showTip(hit, e) {
  const d = JSON.parse(hit.dataset.tip);
  tip.innerHTML = `<b>${esc(d.t)}</b><span class="num">${esc(d.v)}</span>${d.b ? `<small>${esc(d.b)}</small>` : ''}${d.w.length ? `<ul>${d.w.map((k) => `<li>${esc(k)}</li>`).join('')}${d.more ? `<li class="lw">+${d.more} more</li>` : ''}</ul>` : ''}`;
  tip.hidden = false;
  const bx = hit.getBoundingClientRect(), tw = tip.offsetWidth, th = tip.offsetHeight;
  const cx = e?.clientX ?? bx.left + bx.width / 2, cy = e?.clientY ?? bx.top + bx.height / 2;
  tip.style.left = `${Math.min(Math.max(8, cx - tw / 2), innerWidth - tw - 8)}px`;
  tip.style.top = `${cy - th - 14 < 8 ? cy + 18 : cy - th - 14}px`;
  document.querySelectorAll('.an-hit.on').forEach((x) => x.classList.remove('on')); hit.classList.add('on');
}
const hideTip = () => { tip.hidden = true; document.querySelectorAll('.an-hit.on').forEach((x) => x.classList.remove('on')); };
document.addEventListener('pointermove', (e) => { const hit = e.target.closest?.('.an-hit'); if (hit) showTip(hit, e); else if (!tip.hidden && e.pointerType === 'mouse') hideTip(); });
document.addEventListener('pointerdown', (e) => { const hit = e.target.closest?.('.an-hit'); if (hit) showTip(hit, e); else hideTip(); });
addEventListener('scroll', hideTip, { passive: true });
function yoyChart() {
  const ys = [...new Set(TRIPS.map((t) => t.startLocal.slice(0, 4)))].sort();
  if (ys.length < 2) return null;
  const allLegs = TRIPS.flatMap((t) => t.legs);
  const series = ys.map((y) => { let c = 0; return { y, v: MON.map((_, i) => (c += allLegs.filter((l) => (l.dep || '').startsWith(`${y}-${String(i + 1).padStart(2, '0')}`)).length)) }; });
  const w = 1000, h = 260, pad = { l: 40, r: 70, t: 12, b: 28 };
  const x = d3.scalePoint().domain(MON).range([pad.l, w - pad.r]);
  const y = d3.scaleLinear().domain([0, d3.max(series.flatMap((s) => s.v)) || 1]).nice().range([h - pad.b, pad.t]);
  const svg = svgBox(w, h, 'Flights by year, running total');
  svg.append('g').attr('class', 'an-grid').selectAll('line').data(y.ticks(4)).join('line').attr('x1', pad.l).attr('x2', w - pad.r).attr('y1', y).attr('y2', y);
  svg.append('g').attr('class', 'an-axis').selectAll('text').data(y.ticks(4)).join('text').attr('x', pad.l - 6).attr('y', (d) => y(d) + 4).attr('text-anchor', 'end').text((d) => d);
  svg.append('g').attr('class', 'an-axis').selectAll('text').data(MON).join('text').attr('x', x).attr('y', h - 8).attr('text-anchor', 'middle').text((d, i) => (mobile() && i % 2 ? '' : d));
  const curMonth = new Date().getMonth(), curYear = String(new Date().getFullYear());
  series.forEach((s, i) => {
    const v = s.y === curYear ? s.v.slice(0, curMonth + 1) : s.v;
    const line = d3.line().x((_, j) => x(MON[j])).y((d) => y(d));
    svg.append('path').attr('class', `an-line c${i % 5}`).attr('d', line(v));
    svg.append('text').attr('class', `an-lbl c${i % 5}`).attr('x', x(MON[v.length - 1]) + 6).attr('y', y(v[v.length - 1]) + 4).text(s.y);
  });
  return svg.node().outerHTML;
}
// Calendar of travel days: flight days darker, other days away lighter
function heatmap() {
  const y = YEAR === 'all' ? String(new Date().getFullYear()) : YEAR;
  const day = new Map();
  const mark = (d, lvl) => { const k = d.toISOString().slice(0, 10); if (k.startsWith(y)) day.set(k, Math.max(day.get(k) || 0, lvl)); };
  TRIPS.forEach((t) => {
    const a = new Date(t.startLocal.slice(0, 10) + 'T12:00:00Z'), b = new Date(t.endLocal.slice(0, 10) + 'T12:00:00Z');
    for (let d = new Date(a); d <= b; d.setUTCDate(d.getUTCDate() + 1)) mark(d, 1);
    t.legs.forEach((l) => l.dep && mark(new Date(l.dep.slice(0, 10) + 'T12:00:00Z'), 2));
  });
  STAYS.forEach((s) => { const a = new Date(s.checkIn + 'T12:00:00Z'); for (let i = 0; i < s.nights; i++) { const d = new Date(a); d.setUTCDate(a.getUTCDate() + i); mark(d, 1); } });
  const jan1 = new Date(`${y}-01-01T12:00:00Z`), off = jan1.getUTCDay(), cell = 16, w = 54 * cell + 30, h = 7 * cell + 26;
  const svg = svgBox(w, h, `Travel days in ${y}`);
  for (let i = 0; i < 366; i++) {
    const d = new Date(jan1); d.setUTCDate(1 + i); if (String(d.getUTCFullYear()) !== y) break;
    const k = d.toISOString().slice(0, 10), wk = Math.floor((i + off) / 7), dow = d.getUTCDay();
    svg.append('rect').attr('x', 28 + wk * cell).attr('y', 18 + dow * cell).attr('width', cell - 3).attr('height', cell - 3).attr('rx', 2).attr('class', `an-day l${day.get(k) || 0}`)
      .append('title').text(`${k}${day.get(k) === 2 ? ': flying' : day.get(k) ? ': away' : ''}`);
    if (d.getUTCDate() === 1) svg.append('text').attr('class', 'an-axis').attr('x', 28 + wk * cell).attr('y', 12).text(MON[d.getUTCMonth()]);
  }
  ['M', 'W', 'F'].forEach((t, i) => svg.append('text').attr('class', 'an-axis').attr('x', 0).attr('y', 18 + (1 + i * 2) * cell + 11).text(t));
  const away = [...day.values()].length;
  return { html: `<div class="an-scroll">${svg.node().outerHTML}</div><div class="legend an-legend"><span><i class="an-key l2"></i>Flying</span><span><i class="an-key l1"></i>Away</span><span>${away} day${away === 1 ? '' : 's'} away in ${y}${YEAR === 'all' ? ' (pick a year above to see another)' : ''}</span></div>`, any: away > 0 };
}
function choropleth(features, active, label, projection) {
  const w = 1000, h = projection === 'us' ? 600 : 500;
  const proj = projection === 'us' ? d3.geoAlbersUsa().fitSize([w, h], features) : d3.geoNaturalEarth1().fitExtent([[10, 10], [w - 10, h - 10]], { type: 'Sphere' });
  const path = d3.geoPath(proj), svg = svgBox(w, h, label);
  if (projection !== 'us') svg.append('path').datum({ type: 'Sphere' }).attr('class', 'sea').attr('d', path);
  svg.append('g').selectAll('path').data(features.features).join('path').attr('d', path).attr('class', (f) => `landp${active.has(f.properties.name) ? ' an-on' : ''}`)
    .append('title').text((f) => f.properties.name + (active.has(f.properties.name) ? ': visited' : ''));
  return svg.node().outerHTML;
}

// ---------- the sections ----------
const SECTIONS = [
  ['activity', 'Activity over time', () => {
    const m = ['flights', 'miles', 'nights'].map((k) => [k, activityChart(k)]);
    if (!m.some(([, s]) => s)) return empty('Add flights or stays to see your travel month by month.');
    const yoy = yoyChart(), hm = heatmap();
    return `<div class="an-tabs" role="tablist" aria-label="Measure">${m.map(([k], i) => `<button type="button" role="tab" class="tab" data-metric="${k}" aria-selected="${i === 0}">${k[0].toUpperCase() + k.slice(1)}</button>`).join('')}</div>
      ${m.map(([k, s], i) => `<div class="an-chart" data-metric-panel="${k}" ${i ? 'hidden' : ''}>${s || empty(k === 'nights' ? 'Add stays to see hotel nights per month.' : 'Add flights to see this.')}</div>`).join('')}
      <h3>Year over year</h3><p class="lw">Running total of flights through each year.</p>${yoy || empty('Two years of flights draw one line per year here.')}
      <h3>Travel calendar</h3>${hm.any ? hm.html : empty('Days you’re traveling light up here once there are trips in this year.')}`;
  }],
  ['totals', 'Totals and records', () => {
    const L = flown().flatMap((t) => t.legs);
    if (!L.length && !stays().length) return empty('Totals and records show up once you’ve flown or stayed somewhere.');
    const mi = L.reduce((s, l) => s + l.mi, 0), hrs = L.reduce((s, l) => s + (l.dur || 0), 0) / 60;
    const ctry = new Set([...L.flatMap((l) => [airport(l.o).country, airport(l.d).country]), ...stays().filter((s) => s.checkIn <= new Date().toISOString().slice(0, 10)).map((s) => s.country)].filter(Boolean));
    const states = new Set([...L.flatMap((l) => [l.o, l.d]).filter((c) => airport(c).cc === 'US').map((c) => airport(c).region), ...stays().filter((s) => s.country === 'United States').map((s) => (String(s.city).match(/,\s*([A-Z]{2})$/) || [])[1]).filter(Boolean)]);
    const longest = L.slice().sort((a, b) => b.mi - a.mi)[0];
    const busy = countBy(L, (l) => l.dep?.slice(0, 7))[0];
    const lt = flown().slice().sort((a, b) => (b.end - b.start) - (a.end - a.start))[0];
    const items = [[fmt(L.length), 'Flights flown'], [fmt(mi), 'Miles flown'], [fmt(hrs), 'Hours in the air'], [(mi / EARTH).toFixed(1) + '×', 'Times around the Earth'], [ctry.size, 'Countries'], [states.size, 'US states']];
    return `<section class="stats">${items.map(([v, k]) => `<div class="stat"><b class="num">${v}</b><span>${k}</span></div>`).join('')}</section>
      <dl class="an-records">
        ${longest ? `<dt>Longest flight</dt><dd>${esc(longest.f)} ${longest.o} → ${longest.d}, ${fmt(longest.mi)} mi${longest.dur ? ` (${Math.floor(longest.dur / 60)}h ${String(Math.round(longest.dur % 60)).padStart(2, '0')}m)` : ''}</dd>` : ''}
        ${busy ? `<dt>Busiest month</dt><dd>${MON[+busy[0].slice(5) - 1]} ${busy[0].slice(0, 4)}, ${busy[1]} flights</dd>` : ''}
        ${lt ? `<dt>Longest trip</dt><dd>${esc(lt.name)}, ${Math.round((lt.end - lt.start) / 864e5) + 1} days</dd>` : ''}
      </dl>`;
  }],
  ['airlines', 'Airlines', () => {
    const L = legs(); if (!L.length) return empty('Add flights to see which airlines you fly most.');
    return `<div class="an-two"><div><h3>Flights by airline</h3>${bars(countBy(L, (l) => airlineName(l.airline)), { unit: 'Flights' })}</div>
      <div><h3>Miles by airline</h3>${bars(countBy(L, (l) => airlineName(l.airline), (l) => l.mi), { unit: 'Miles' })}</div></div>
      <h3>Cabin and fare</h3>${countBy(L, (l) => l.cabin).length ? bars(countBy(L, (l) => l.cabin), { unit: 'Flights' }) : empty('Add the cabin or fare when you log a flight to see the mix here.')}`;
  }],
  ['airports', 'Airports', () => {
    const L = legs(); if (!L.length) return empty('Add flights to see your airports and routes.');
    const homes = new Set(PROFILE.homeAirports || ['LAX']);
    const homeShare = Math.round(L.filter((l) => homes.has(l.o)).length / L.length * 100);
    const firstYear = new Map(); TRIPS.flatMap((t) => t.legs).forEach((l) => [l.o, l.d].forEach((c) => { const y = (l.dep || '').slice(0, 4); if (y && (!firstYear.has(c) || y < firstYear.get(c))) firstYear.set(c, y); }));
    const newBy = countBy([...firstYear], ([, y]) => y).sort((a, b) => a[0].localeCompare(b[0]));
    return `<div class="an-two"><div><h3>Most-used airports</h3>${bars(countBy(L.flatMap((l) => [l.o, l.d]), (c) => `${c} · ${airport(c).city}`), { unit: 'Takeoffs and landings' })}</div>
      <div><h3>Top routes</h3>${bars(countBy(L, (l) => [l.o, l.d].sort().join(' ⇄ ')), { unit: 'Flights, both directions' })}</div></div>
      <p class="an-callout"><b class="num">${homeShare}%</b> of flights left from a home airport (${esc([...homes].join(' or '))}).</p>
      <h3>New airports by year</h3>${bars(newBy, { unit: 'Airports visited for the first time', max: 12 })}`;
  }],
  ['aircraft', 'Aircraft', () => {
    const L = TRIPS.flatMap((t) => t.legs).filter((l) => l.ac && inYear(l.dep || '')); if (!L.length) return empty('Add the aircraft when you log a flight to see what you’ve flown on.');
    const first = new Map(); L.slice().sort((a, b) => (a.dep || '').localeCompare(b.dep || '')).forEach((l) => { if (!first.has(l.ac)) first.set(l.ac, l); });
    const rows = countBy(L, (l) => l.ac);
    return `<div class="an-scroll"><table class="an-table"><thead><tr><th>Aircraft</th><th class="r">Flights</th><th>First flown</th></tr></thead><tbody>${rows.map(([ac, n]) => `<tr><td>${esc(ac)}</td><td class="r num">${n}</td><td class="num">${esc((first.get(ac).dep || '').slice(0, 10))} · ${esc(first.get(ac).f)}</td></tr>`).join('')}</tbody></table></div>`;
  }],
  ['places', 'Places', () => {
    const L = legs(), S = stays(); if (!L.length && !S.length) return empty('Countries and states you visit fill in on these maps.');
    const ctry = new Set([...L.flatMap((l) => [airport(l.o).country, airport(l.d).country]), ...S.map((s) => s.country)].filter(Boolean).map((c) => MAP_NAME[c] || c));
    const st = new Set([...L.flatMap((l) => [l.o, l.d]).filter((c) => airport(c).cc === 'US').map((c) => STATE_NAMES[airport(c).region]), ...S.filter((s) => s.country === 'United States').map((s) => STATE_NAMES[(String(s.city).match(/,\s*([A-Z]{2})$/) || [])[1]])].filter(Boolean));
    const T = trips(), intl = T.filter((t) => t.legs.some((l) => airport(l.o).cc !== 'US' || airport(l.d).cc !== 'US')).length;
    return `<p class="an-callout"><b class="num">${T.length - intl}</b> domestic and <b class="num">${intl}</b> international trip${intl === 1 ? '' : 's'} · ${ctry.size} countr${ctry.size === 1 ? 'y' : 'ies'} · ${st.size} state${st.size === 1 ? '' : 's'}</p>
      <h3>Countries</h3><div class="an-map">${choropleth(topojson.feature(WORLD, WORLD.objects.countries), ctry, 'World map of countries visited')}</div>
      <h3>US states</h3><div class="an-map">${choropleth(topojson.feature(US, US.objects.states), st, 'US map of states visited', 'us')}</div>`;
  }],
  ['stays', 'Stays', () => {
    const S = stays(); if (!S.length) return empty('Add hotels and rentals to see nights by brand and how long you stay.');
    const n = S.reduce((a, s) => a + s.nights, 0), hotel = S.filter((s) => !RENTAL.has(s.brand)).reduce((a, s) => a + s.nights, 0);
    return `<section class="stats">${[[S.length, 'Stays'], [n, 'Nights'], [hotel, 'Hotel nights'], [n - hotel, 'Rental nights'], [(n / S.length).toFixed(1), 'Nights per stay']].map(([v, k]) => `<div class="stat"><b class="num">${v}</b><span>${k}</span></div>`).join('')}</section>
      <div class="an-two"><div><h3>Nights by brand</h3>${bars(countBy(S, (s) => s.brand, (s) => s.nights), { unit: 'Nights' })}</div>
      <div><h3>Stays per year</h3>${bars(countBy(STAYS, (s) => s.checkIn.slice(0, 4)).sort((a, b) => a[0].localeCompare(b[0])), { unit: 'Stays (all years)', max: 12 })}</div></div>`;
  }],
  ['paying', 'Booking and paying', () => {
    const P = [...trips().map((t) => t.pay), ...stays().map((s) => s.pay)].filter((p) => p?.method);
    if (!P.length) return empty('Record how a trip or stay was paid to see points versus cash and which cards you use.');
    const cardRows = countBy(P.filter((p) => p.card), (p) => p.card, (p) => +p.amount || 0);
    return `<div class="an-two"><div><h3>How it was paid</h3>${bars(countBy(P, (p) => PAY_LABEL[p.method]), { unit: 'Trips and stays' })}</div>
      <div><h3>Which card paid</h3>${cardRows.length ? bars(cardRows, { unit: 'Dollars charged', fmtV: (v) => '$' + fmt(v) }) : empty('Add the card when you record a payment.')}</div></div>
      <h3>Points redeemed</h3>${bars(countBy(P.filter((p) => +p.points && p.method !== 'other'), (p) => p.program || 'Points', (p) => +p.points), { unit: 'Points and miles', fmtV: (v) => d3.format('.3~s')(v) }) || empty('No points redemptions recorded.')}
      <h3>Booking lead time</h3>${empty('Lead time needs the date each trip was booked. Gmail import (coming for approved users) fills it in from confirmation emails.')}`;
  }],
  ['purpose', 'Purpose', () => {
    const T = trips(); if (!T.some((t) => t.purpose)) return empty('Give trips a purpose (vacation, work, family…) to see why you travel.');
    const nightsFor = (t) => STAYS.filter((s) => s.trip === t.id).reduce((a, s) => a + s.nights, 0);
    const ps = countBy(T, (t) => t.purpose || 'Not set').map(([p]) => p);
    const grid = ps.map((p) => [p, MON.map((_, i) => T.filter((t) => (t.purpose || 'Not set') === p && +t.startLocal.slice(5, 7) === i + 1).length)]);
    const max = Math.max(...grid.flatMap(([, r]) => r), 1);
    return `<div class="an-two"><div><h3>Trips by purpose</h3>${bars(countBy(T, (t) => t.purpose || 'Not set'), { unit: 'Trips' })}</div>
      <div><h3>Nights by purpose</h3>${bars(countBy(T, (t) => t.purpose || 'Not set', nightsFor).filter(([, v]) => v), { unit: 'Nights in stays linked to trips' }) || empty('Link stays to trips to count nights by purpose.')}</div></div>
      <h3>By month</h3><div class="an-scroll"><table class="an-table an-grid-t"><thead><tr><th></th>${MON.map((m) => `<th>${m}</th>`).join('')}</tr></thead><tbody>${grid.map(([p, r]) => `<tr><th>${esc(p)}</th>${r.map((v) => `<td style="--a:${v / max}" class="num">${v || ''}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  }],
];

function render() {
  const ys = yearsOf();
  $id('yearSel').innerHTML = ['all', ...ys].map((y) => `<button type="button" class="yr" data-year="${y}" aria-pressed="${YEAR === y}">${y === 'all' ? 'All' : y}</button>`).join('');
  $id('anOwner').innerHTML = PROFILE.displayName ? `The travels of <b>${esc(PROFILE.displayName)}</b>` : '';
  $id('secnav').innerHTML = SECTIONS.map(([id, t]) => `<a href="#${id}">${t}</a>`).join('');
  $id('sections').innerHTML = SECTIONS.map(([id, t, fn]) => `<section class="panel an-sec" id="${id}" aria-labelledby="${id}-h"><h2 id="${id}-h">${t}</h2>${fn()}</section>`).join('');
}
document.addEventListener('click', (e) => {
  const y = e.target.closest('[data-year]'); if (y) { YEAR = y.dataset.year; render(); return; }
  const m = e.target.closest('[data-metric]'); if (m) {
    const sec = m.closest('.an-sec');
    sec.querySelectorAll('[data-metric]').forEach((b) => b.setAttribute('aria-selected', b === m));
    sec.querySelectorAll('[data-metric-panel]').forEach((p) => { p.hidden = p.dataset.metricPanel !== m.dataset.metric; });
  }
});
let rz; addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(render, 200); });
await load();
render();
