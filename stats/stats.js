// The hidden /stats/ page: aggregate visit counts from the stats Worker (worker-stats/), which reads
// GoatCounter with a key that never reaches this page. Everything shown is a count; there are no
// visitor rows, IPs or anything about a person. Charts are plain SVG (no chart library).
// Settings are loaded fresh each time (GitHub Pages lets browsers keep files for 10 minutes)
const { config } = await import(`/shared/config.js?t=${Date.now()}`);

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => Number(n || 0).toLocaleString();
const pct = (n, of) => (of ? `${Math.round(n / of * 100)}%` : '');
const plural = (n, one, many = `${one}s`) => `${fmt(n)} ${n === 1 ? one : many}`;
const RANGE_LABEL = { today: 'today', week: 'the last 7 days', month: 'the last 30 days' };
const IN_RANGE = { today: 'today', week: 'in the last 7 days', month: 'in the last 30 days' };
const BUCKETS = ['0-10s', '10-30s', '30-60s', '1-3m', '3-10m', '10m+'];
// Middle of each time bucket in seconds, for an estimated average (10m+ counts as 10 minutes)
const BUCKET_MID = { '0-10s': 5, '10-30s': 20, '30-60s': 45, '1-3m': 120, '3-10m': 390, '10m+': 600 };
const DEVICE = { phone: 'Phone', tablet: 'Tablet', laptop: 'Laptop or desktop' };
// One wording for an empty range, one for a breakdown these views didn't record
const EMPTY = 'No views yet in this range.';
const NONE = 'None recorded in this range.';

// Friendly names for paths
const APPS = { 'snow-surf-report': 'Snow and Surf Report', 'fantasy-football': 'Fantasy Football', 'my-budget-ledger': 'Budget Ledger', contrail: 'Contrail', wallet: 'What’s in My Wallet?' };
// The league site counts its cover as /cover and each tab as /<tab> (/standings, /ice…)
const LEAGUE_TABS = { standings: 'Standings', matchups: 'Matchups', ice: 'Ice', power: 'Power', teams: 'Teams', wire: 'Wire & Trades', draft: 'Draft', awards: 'Awards', history: 'History', rules: 'League Rules' };
function pageName(path) {
  if (SITE === 'fantasy') {
    if (path === '/cover' || path === '/') return 'Cover';
    const tab = path.replace(/^\//, '');
    return LEAGUE_TABS[tab] ? `${LEAGUE_TABS[tab]} tab` : path;
  }
  if (path === '/') return 'Cover';
  const m = path.match(/^\/home\/(?:#(.+))?$/);
  if (m) return m[1] ? `Home · ${m[1]} tab` : 'Home';
  const pr = path.match(/^\/projects\/([^/]+)\/$/);
  if (pr) return `Project page · ${pr[1]}`;
  const app = path.split('/')[1];
  const rest = path.slice(app.length + 2);
  return APPS[app] ? `${APPS[app]}${rest ? ` · ${rest.replace(/^app\.html#?/, '').replace(/\/$/, '') || 'app'}` : ''}` : path;
}
// Referrers: one line per domain. Visits recorded before the counter sent domains only came in as
// full addresses, and links from the site's own pages (old or new address) are moves within the site.
const OWN = new Set(['offthewall.dev', 'www.offthewall.dev', 'billywall732.github.io']);
const DIRECT = '(direct or unknown)';
function mergeRefs(list = []) {
  const m = new Map();
  for (const x of list) { const d = OWN.has(x.domain) ? '(within the site)' : x.domain === DIRECT ? '(direct)' : x.domain; m.set(d, (m.get(d) || 0) + x.views); }
  return [...m];
}
const sumOf = (o) => Object.values(o || {}).reduce((a, b) => a + b, 0);
const topOf = (rows) => rows.filter((r) => r[1] > 0).sort((a, b) => b[1] - a[1]);

// Dates: the Worker's days are in the counter's time zone, as YYYY-MM-DD
const dayDate = (d) => new Date(`${d}T12:00:00Z`);
const dayLong = (d) => dayDate(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
const dayShort = (d) => dayDate(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const hourName = (h) => `${h % 12 || 12}${h < 12 ? 'am' : 'pm'}`;
const hourSpan = (h) => `${hourName(h)}–${hourName((h + 1) % 24)}`;

// Bar list with counts and shares (biggest first, or in the given order for buckets)
function bars(rows, { max = 8, none = NONE, name = (k) => k, keepOrder = false } = {}) {
  rows = keepOrder ? (rows.some((r) => r[1] > 0) ? rows : []) : topOf(rows);
  if (!rows.length) return `<p class="empty">${none}</p>`;
  const total = rows.reduce((a, r) => a + r[1], 0), top = Math.max(...rows.map((r) => r[1]));
  const shown = rows.slice(0, max);
  return `<ul class="bars">${shown.map(([k, n]) => `<li><span class="bl" title="${esc(name(k))}">${esc(name(k))}</span><i style="--w:${Math.max(2, Math.round(n / top * 100))}%"></i><b>${fmt(n)}</b><em>${pct(n, total)}</em></li>`).join('')}</ul>${rows.length > max ? `<p class="sub more">+${rows.length - max} more</p>` : ''}`;
}
const panel = (title, sub, body, cls = '') => `<section class="stat-panel ${cls}"><h2>${title}</h2>${sub ? `<p class="sub">${sub}</p>` : ''}${body}</section>`;

// The trend: views per hour (today, up to now) or per day. Plain SVG drawn at the panel's own
// width, so text stays crisp at any size.
function trendPoints(r) {
  const t = r.trend;
  if (!t) return null; // an older Worker without trends
  if (t.unit === 'hour') {
    const nowH = Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone: DATA.timezone || 'UTC' }).format(new Date(DATA.generatedAt)));
    return t.points.slice(0, nowH + 1).map((p) => ({ key: p.hour, label: hourSpan(p.hour), tick: hourName(p.hour), views: p.views }));
  }
  return t.points.map((p) => ({ key: p.day, label: dayLong(p.day), tick: t.points.length <= 8 ? dayLong(p.day).split(',')[0] + ' ' + dayDate(p.day).getUTCDate() : dayShort(p.day), views: p.views }));
}
function trendSvg(pts, width) {
  const narrow = width < 520, h = narrow ? 200 : 240, pad = { l: 34, r: 14, t: 22, b: 28 };
  const n = pts.length, max = Math.max(...pts.map((p) => p.views), 0);
  // Round steps (1, 2, 5, 10, 20, 50…), at most five gridlines
  const raw = Math.max(max, 4) / 4, mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw), nice = Math.ceil(Math.max(max, 4) / step) * step;
  const ticks = Array.from({ length: nice / step + 1 }, (_, i) => i * step);
  const x = (i) => (n === 1 ? (pad.l + width - pad.r) / 2 : pad.l + i * (width - pad.l - pad.r) / (n - 1));
  const y = (v) => h - pad.b - v / nice * (h - pad.t - pad.b);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.views).toFixed(1)}`).join('');
  const area = `${line}L${x(n - 1).toFixed(1)},${y(0)}L${x(0).toFixed(1)},${y(0)}Z`;
  const every = Math.max(1, Math.ceil(n / (narrow ? 4 : n <= 8 ? 8 : 7)));
  const peak = pts.reduce((b, p, i) => (p.views > pts[b].views ? i : b), 0);
  TREND = { pts, x, y };
  return `<svg class="trend" viewBox="0 0 ${width} ${h}" width="${width}" height="${h}" role="img" aria-label="Views per ${pts.length && typeof pts[0].key === 'number' ? 'hour' : 'day'}: ${pts.map((p) => `${p.label} ${p.views}`).join(', ')}">
    ${ticks.map((v) => `<line class="grid" x1="${pad.l}" x2="${width - pad.r}" y1="${y(v)}" y2="${y(v)}"/><text class="ax" x="${pad.l - 8}" y="${y(v) + 4}" text-anchor="end">${fmt(v)}</text>`).join('')}
    ${max ? `<path class="area" d="${area}"/><path class="line" d="${line}"/>` : `<line class="line flat" x1="${pad.l}" x2="${width - pad.r}" y1="${y(0)}" y2="${y(0)}"/>`}
    ${max && n <= 8 ? pts.map((p, i) => `<circle class="dot" cx="${x(i)}" cy="${y(p.views)}" r="4"/>`).join('') : ''}
    ${max ? `<text class="peak" x="${Math.min(Math.max(x(peak), pad.l + 14), width - pad.r - 14)}" y="${y(pts[peak].views) - 9}" text-anchor="middle">${fmt(pts[peak].views)}</text>` : ''}
    ${pts.map((p, i) => ((n - 1 - i) % every === 0 ? `<text class="ax" x="${x(i)}" y="${h - 8}" text-anchor="${i === 0 && n > 1 ? 'start' : i === n - 1 && n > 1 ? 'end' : 'middle'}">${esc(p.tick)}</text>` : '')).join('')}
    <line class="cross" x1="0" x2="0" y1="${pad.t}" y2="${y(0)}" hidden/><circle class="hov" r="5" cx="0" cy="0" hidden/>
    <rect class="hit" x="${pad.l}" y="0" width="${width - pad.l - pad.r}" height="${h - pad.b}"/>
  </svg>`;
}
// Hover or tap on the trend: crosshair, dot and a small box for the nearest point
let TREND = null;
function trendHover(e) {
  const svg = e.target.closest?.('svg.trend'); const tip = $('#trend-tip');
  if (!svg || !TREND || !tip) { if (tip) tip.hidden = true; document.querySelectorAll('svg.trend .cross, svg.trend .hov').forEach((el) => el.setAttribute('hidden', '')); return; }
  const { pts, x, y } = TREND, box = svg.getBoundingClientRect();
  const px = (e.clientX - box.left) * (svg.viewBox.baseVal.width / box.width);
  let i = 0; pts.forEach((_, j) => { if (Math.abs(x(j) - px) < Math.abs(x(i) - px)) i = j; });
  const cross = svg.querySelector('.cross'), dot = svg.querySelector('.hov');
  cross.setAttribute('x1', x(i)); cross.setAttribute('x2', x(i)); cross.removeAttribute('hidden');
  dot.setAttribute('cx', x(i)); dot.setAttribute('cy', y(pts[i].views)); dot.removeAttribute('hidden');
  tip.innerHTML = `<b>${esc(pts[i].label)}</b><span>${plural(pts[i].views, 'view')}</span>`;
  tip.hidden = false;
  const wrap = svg.parentElement.getBoundingClientRect(), sx = box.width / svg.viewBox.baseVal.width;
  tip.style.left = `${Math.min(Math.max(0, box.left - wrap.left + x(i) * sx - tip.offsetWidth / 2), wrap.width - tip.offsetWidth)}px`;
  tip.style.top = `${Math.max(0, box.top - wrap.top + y(pts[i].views) * sx - tip.offsetHeight - 12)}px`;
}
document.addEventListener('pointermove', trendHover);
document.addEventListener('pointerdown', trendHover);

// Short sentences from the totals only. Thin data says so instead of guessing.
const THIN = 5;
function insights(r, pts) {
  if (!r.views) return [`${EMPTY} There’s nothing to summarize yet.`];
  const out = [], hourly = r.trend?.unit === 'hour', unit = hourly ? 'hour' : 'day';
  // Busiest day (or hour)
  if (!pts) out.push('Views by day aren’t available from this version of the stats Worker.');
  else if (r.views < THIN) out.push(`Only ${plural(r.views, 'view')} ${IN_RANGE[RANGE]}: too few to name a busiest ${unit}.`);
  else {
    const busy = [...pts].sort((a, b) => b.views - a.views), active = pts.filter((p) => p.views);
    if (active.length === 1) out.push(`All ${fmt(r.views)} views came ${hourly ? 'between ' + busy[0].label : 'on ' + busy[0].label}.`);
    else if (busy[0].views === busy[1].views) out.push(`No single busiest ${unit}: ${busy[0].label} and ${busy[1].label} tied at ${plural(busy[0].views, 'view')}.`);
    else out.push(`The busiest ${unit} was ${busy[0].label}, with ${fmt(busy[0].views)} of ${fmt(r.views)} views (${pct(busy[0].views, r.views)}).`);
  }
  // Most-viewed page or app
  const pages = [...r.pages].sort((a, b) => b.views - a.views);
  if (r.views < THIN) out.push(`Too few views to say which page leads; ${pageName(pages[0].path)} has ${plural(pages[0].views, 'view')} so far.`);
  else if (pages[1] && pages[1].views === pages[0].views) out.push(`${pageName(pages[0].path)} and ${pageName(pages[1].path)} tied for most viewed, at ${plural(pages[0].views, 'view')} each.`);
  else out.push(`${pageName(pages[0].path)} was the most-viewed page, with ${fmt(pages[0].views)} of ${fmt(r.views)} views (${pct(pages[0].views, r.views)}).`);
  // Top outside referrer
  const refs = mergeRefs(r.referrers), outside = topOf(refs.filter(([d]) => d !== '(direct)' && d !== '(within the site)'));
  if (!refs.length) out.push('No referrer data in this range.');
  else if (!outside.length) out.push('No outside site sent visitors in this range: views came directly or from links within the site.');
  else out.push(`The top outside referrer was ${outside[0][0]}, with ${plural(outside[0][1], 'view')}.`);
  // Main device
  const dev = sumOf(r.devices), devs = topOf(Object.entries(r.devices));
  if (dev < THIN) out.push(dev ? `Only ${plural(dev, 'view')} recorded a device type ${IN_RANGE[RANGE]}: too few to call a main device.` : `No device types recorded ${IN_RANGE[RANGE]}, so there’s no main device to name.`);
  else out.push(`${DEVICE[devs[0][0]] || devs[0][0]} made up ${pct(devs[0][1], dev)} of views with a recorded device.`);
  return out;
}

// Entry and exit card: top entry page, top exit page, time on page
function entryExit(r) {
  const entries = topOf(Object.entries(r.entry)), exits = topOf(Object.entries(r.exit));
  const time = {}; Object.values(r.time).forEach((b) => Object.entries(b).forEach(([k, n]) => { time[k] = (time[k] || 0) + n; }));
  const timed = sumOf(time);
  const avg = timed ? BUCKETS.reduce((a, b) => a + (time[b] || 0) * BUCKET_MID[b], 0) / timed : 0;
  const dur = (s) => (s < 60 ? `${Math.round(s)}s` : `${Math.floor(s / 60)}m ${String(Math.round(s % 60)).padStart(2, '0')}s`);
  if (!r.views) return `<p class="empty">${EMPTY}</p>`;
  if (!entries.length && !exits.length && !timed) return `<p class="empty">${NONE}</p>`;
  const row = (label, val, note) => `<div class="ee-row"><span>${label}</span><b>${val}</b>${note ? `<small>${note}</small>` : ''}</div>`;
  return `<div class="ee">
    ${row('Top entry page', entries.length ? esc(pageName(entries[0][0])) : '—', entries.length ? `${plural(entries[0][1], 'visit')} started here, of ${fmt(sumOf(r.entry))} (estimate)` : NONE)}
    ${row('Top exit page', exits.length ? esc(pageName(exits[0][0])) : '—', exits.length ? `${plural(exits[0][1], 'visit')} ended here (estimate)` : NONE)}
    ${row('Average time on a page', timed ? `≈ ${dur(avg)}` : '—', timed ? `estimated from ${plural(timed, 'timed view')}, counted only while the page is on screen` : NONE)}
  </div>
  ${timed ? bars(BUCKETS.map((b) => [b, time[b] || 0]), { max: 6 }) : ''}`;
}

// ---------- Audience: counts and buckets only ----------
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const VISIT_BUCKETS = [['<30s', 'Under 30 seconds'], ['30s-1m', '30 seconds to 1 minute'], ['1-5m', '1 to 5 minutes'], ['5m+', '5 minutes or more']];
const SCREENS = { phone: 'Phone (under 600px wide)', tablet: 'Tablet (600–1023px)', desktop: 'Desktop (1024px and up)' };
// Views by hour: 24 small columns, labeled every 3 hours
function hourColumns(byHour) {
  const max = Math.max(...byHour, 0);
  if (!max) return `<p class="empty">${EMPTY}</p>`;
  return `<div class="hours" role="img" aria-label="Views by hour of day: ${byHour.map((n, h) => `${hourName(h)} ${n}`).join(', ')}">
    ${byHour.map((n, h) => `<div class="hcol" title="${hourSpan(h)}: ${plural(n, 'view')}"><i style="--h:${n ? Math.max(4, Math.round(n / max * 100)) : 0}%"></i><span>${h % 3 === 0 ? hourName(h) : ''}</span></div>`).join('')}
  </div>`;
}
// Scroll depth: the share of views that got at least 25 / 50 / 75 / 100% down the page
function scrollReach(scroll) {
  const total = sumOf(scroll);
  if (!total) return `<p class="empty">${NONE}</p>`;
  const atLeast = (q) => Object.entries(scroll).filter(([k]) => Number(k) >= q).reduce((a, [, n]) => a + n, 0);
  return `<ul class="bars">${[25, 50, 75, 100].map((q) => { const n = atLeast(q); return `<li><span class="bl">Reached ${q}%</span><i style="--w:${Math.max(2, Math.round(n / total * 100))}%"></i><b>${fmt(n)}</b><em>${pct(n, total)}</em></li>`; }).join('')}</ul>
    <p class="sub more">Of ${plural(total, 'measured view')}</p>`;
}
function audience(r) {
  if (!r.byHour) return `<p class="stats-note">These need the updated stats Worker.</p>`;
  const none = r.views ? NONE : EMPTY;
  const flows = Object.entries(r.flows || {}).map(([k, n]) => { const [a, b] = k.split(' > '); return [`${pageName(a)} → ${pageName(b)}`, n]; });
  return `<div class="stat-grid">
    ${panel('Views by hour of day', `All pages and apps (${esc(DATA.timezone)} time)`, hourColumns(r.byHour), 'wide')}
    ${panel('Views by day of week', '', bars(WEEKDAYS.map((d, i) => [d, r.byWeekday[i]]), { none: EMPTY, keepOrder: true, max: 7 }))}
    ${panel('Visit length', 'From arriving to leaving the site, in buckets', bars(VISIT_BUCKETS.map(([k, l]) => [l, r.visit?.[k] || 0]), { none, keepOrder: true }))}
    ${panel('Scroll depth', 'How far down a page each view got', scrollReach(r.scroll || {}))}
    ${panel('Outbound clicks', 'Clicks to other sites: the domain only, never the address', bars(Object.entries(r.outbound || {}), { none }))}
    ${panel('Page to page', 'Moves from one page to the next, counted together (never one person’s path)', bars(flows, { none, max: 10 }), 'wide')}
    ${panel('Screen size', 'The window’s width, in three sizes', bars(Object.entries(r.screens || {}), { none, name: (k) => SCREENS[k] || k }))}
  </div>`;
}

let DATA = null, RANGE = 'week';
let NOTICE = ''; // a message above the numbers (e.g. "showing saved numbers")
// Which counter: Off the Wall, or the league's Fantasy Feetpics. The address remembers it (#fantasy).
const SITE_NAMES = { offthewall: 'Off the Wall', fantasy: 'Fantasy Feetpics (league)' };
let SITE = location.hash === '#fantasy' ? 'fantasy' : 'offthewall';
const loaded = {};
function render() {
  const r = DATA.ranges[RANGE];
  document.querySelectorAll('[data-range]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.range === RANGE)));
  const pts = trendPoints(r), hourly = r.trend?.unit === 'hour';
  TREND = null; // set again by trendSvg (the scales for the hover layer)
  const pages = [...r.pages].sort((a, b) => b.views - a.views), topPage = pages[0];
  const busy = pts && r.views ? [...pts].sort((a, b) => b.views - a.views)[0] : null;
  const width = Math.round($('#stats').clientWidth - 34);

  const kpi = (v, label, sub = '', small = false) => `<div class="stat-card"><span class="k">${label}</span><b class="${small ? 'small' : ''}">${v}</b><span>${sub}</span></div>`;
  const cards = [
    kpi(fmt(r.views), 'Total views', `pages and apps, ${RANGE_LABEL[RANGE]}`),
    // Visitors only when the counter can estimate them (it can't without cookies, so this is normally skipped)
    r.visitorsEstimate != null ? kpi(`≈ ${fmt(r.visitorsEstimate)}`, 'Visitors (estimate)', 'no cookies, so repeat visits can’t be told apart exactly') : '',
    kpi(topPage ? esc(pageName(topPage.path)) : '—', 'Top page or app', topPage ? `${plural(topPage.views, 'view')}, ${pct(topPage.views, r.views)} of all` : EMPTY, true),
    kpi(busy ? esc(busy.label) : '—', `Busiest ${hourly ? 'hour' : 'day'}`, busy ? plural(busy.views, 'view') : r.views ? 'Not available' : EMPTY, true),
  ].join('');

  const maxViews = topPage?.views || 1;
  const detail = (path) => {
    const pp = DATA.ranges.month.perPage[path] || {}, cur = r.perPage[path] || {};
    const list = (o, names = {}) => topOf(Object.entries(o || {})).map(([k, n]) => `${esc(names[k] || k)} ${fmt(n)}`).join(' · ') || NONE;
    return `<div class="detail">
      <span><i>Devices</i> ${list(cur.devices, DEVICE)}</span>
      <span><i>Browsers</i> ${list(cur.browsers)}</span>
      <span><i>Referrer domains</i> (last 30 days) ${mergeRefs(pp.referrers).sort((a, b) => b[1] - a[1]).map(([d, n]) => `${esc(d)} ${fmt(n)}`).join(' · ') || NONE}</span>
      <span><i>Time on page</i> ${BUCKETS.map((b) => (r.time[path]?.[b] ? `${b} ${fmt(r.time[path][b])}` : '')).filter(Boolean).join(' · ') || NONE}</span></div>`;
  };
  const table = pages.length
    ? `<div class="table-scroll"><table class="page-table"><thead><tr><th>Page or app</th><th class="n">Views</th></tr></thead><tbody>
      ${pages.map((p) => `<tr><td><details><summary><span class="pn">${esc(pageName(p.path))}</span> <span class="sub">${esc(p.path)}</span></summary>${detail(p.path)}</details></td>
        <td class="n"><span class="vbar"><i style="--w:${Math.max(2, Math.round(p.views / maxViews * 100))}%"></i><b>${fmt(p.views)}</b><em>${pct(p.views, r.views)}</em></span></td></tr>`).join('')}
      </tbody></table></div>`
    : `<p class="empty">${EMPTY}</p>`;

  const none = r.views ? NONE : EMPTY;
  $('#stats').innerHTML = `${NOTICE}
    <div class="stat-cards">${cards}</div>
    <section class="stat-panel trend-panel"><h2>Views per ${hourly ? 'hour' : 'day'}</h2><p class="sub">${hourly ? 'Today so far' : `${dayShort(r.start)} to ${dayShort(r.end)}`}, all pages and apps (${esc(DATA.timezone)} time)</p>
      <div class="trend-wrap">${pts ? trendSvg(pts, width) : '<p class="empty">Views by day need the updated stats Worker.</p>'}
      ${pts && !r.views ? `<div class="trend-empty"><b>${EMPTY}</b><span>Counts started Nov 1, 2026.</span></div>` : ''}<div class="trend-tip" id="trend-tip" hidden></div></div></section>
    <section class="stat-panel insights"><h2>What stands out</h2><ul>${insights(r, pts).map((s) => `<li>${esc(s)}</li>`).join('')}</ul></section>
    <section class="stat-panel"><h2>Views per page and app</h2><p class="sub">${RANGE_LABEL[RANGE][0].toUpperCase() + RANGE_LABEL[RANGE].slice(1)}. Open a row for its devices, browsers, referrer domains and time on page.</p>${table}</section>
    <div class="stat-grid">
      ${panel('Referrer domains', 'Domain only, never the full address', bars(mergeRefs(r.referrers), { none }))}
      ${panel('Countries', 'Worked out by GoatCounter from the visitor’s network; it keeps no IP addresses', bars(r.countries.map((x) => [x.name, x.views]), { none }))}
      ${panel('US states', 'The finest place detail kept', bars(r.regions.map((x) => [x.name, x.views]), { none }))}
      ${panel('Devices', 'Phone, tablet, or laptop/desktop', bars(Object.entries(r.devices), { none, name: (k) => DEVICE[k] || k }))}
      ${panel('Browsers', 'Browser family only, no versions', bars(Object.entries(r.browsers), { none }))}
      ${panel('Entry and exit', 'Where visits start and end, and how long a page stays on screen', entryExit(r))}
    </div>
    <h2 class="st-section">Audience</h2>
    <p class="stats-note">Counts and buckets only. Visit length, scroll depth, outbound clicks, page-to-page moves and screen size started Nov 3, 2026.</p>
    ${audience(r)}
    <p class="stats-note">Counts from ${esc(dayShort(r.start))} to ${esc(dayShort(r.end))} (${esc(DATA.timezone)}), worked out ${new Date(DATA.generatedAt).toLocaleString()}. They refresh about every 20 minutes.</p>`;
}

document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-range]'); if (b && DATA) { RANGE = b.dataset.range; render(); return; }
  const s = e.target.closest('[data-site]'); if (s && s.dataset.site !== SITE) { SITE = s.dataset.site; history.replaceState(null, '', SITE === 'fantasy' ? '#fantasy' : location.pathname); load(); }
});
addEventListener('hashchange', () => { const want = location.hash === '#fantasy' ? 'fantasy' : 'offthewall'; if (want !== SITE) { SITE = want; load(); } });
let rz; addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => DATA && render(), 150); });

async function load() {
  document.querySelectorAll('[data-site]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.site === SITE)));
  document.title = `Visit counts · ${SITE_NAMES[SITE]}`;
  if (!config.statsUrl) {
    $('#stats').innerHTML = '<p class="stats-note">Not connected yet: set <code>statsUrl</code> in <code>shared/config.js</code> to the stats Worker’s address (see <code>worker-stats/README.md</code>).</p>';
    return;
  }
  if (loaded[SITE]) { DATA = loaded[SITE]; NOTICE = ''; render(); return; }
  const want = SITE, copy = savedCopy(want);
  // The last numbers this browser got show straight away, marked, while the new ones load
  if (copy) { DATA = copy.data; NOTICE = notice('loading', copy); render(); }
  else { DATA = null; $('#stats').innerHTML = `<p class="stats-note">Loading ${esc(SITE_NAMES[want])}…</p>`; }
  const stop = new AbortController(), timer = setTimeout(() => stop.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${config.statsUrl.replace(/\/$/, '')}/summary?site=${want}`, { signal: stop.signal });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error([data.error || res.status, data.detail].filter(Boolean).join(': '));
    loaded[want] = data; saveCopy(want, data);
    if (want === SITE) { DATA = data; NOTICE = ''; render(); }
  } catch (e) {
    if (want !== SITE) return;
    const why = e.name === 'AbortError' ? `no answer within ${TIMEOUT_MS / 1000} seconds` : e.message;
    if (copy) { NOTICE = notice('failed', copy, why); render(); }
    else $('#stats').innerHTML = `<div class="st-notice warn" role="alert"><b>Couldn’t load the counts for ${esc(SITE_NAMES[want])}</b> (${esc(why)}). <button type="button" class="st-retry" data-act="retry">Try again</button></div>`;
  } finally { clearTimeout(timer); }
}

// ---------- Loading: a time limit, and the last numbers kept in this browser ----------
// The saved copy is the same aggregate summary the page shows (counts only), kept per site in
// this browser so a slow or failed load still shows something, clearly marked with its time.
const TIMEOUT_MS = 10000;
const copyKey = (site) => `otw-stats-copy-${site}`;
function saveCopy(site, data) { try { localStorage.setItem(copyKey(site), JSON.stringify({ savedAt: Date.now(), data })); } catch { /* private window */ } }
function savedCopy(site) { try { const c = JSON.parse(localStorage.getItem(copyKey(site))); return c?.data?.ranges ? c : null; } catch { return null; } }
function notice(kind, copy, why = '') {
  const when = new Date(copy.data.generatedAt).toLocaleString();
  return kind === 'loading'
    ? `<div class="st-notice" role="status">Showing the numbers saved in this browser (worked out ${esc(when)}) while the latest load…</div>`
    : `<div class="st-notice warn" role="alert"><b>Couldn’t load the latest counts</b> (${esc(why)}). Showing the numbers saved in this browser, worked out ${esc(when)}. <button type="button" class="st-retry" data-act="retry">Try again</button></div>`;
}
document.addEventListener('click', (e) => { if (e.target.closest('[data-act="retry"]')) { delete loaded[SITE]; load(); } });

load();
