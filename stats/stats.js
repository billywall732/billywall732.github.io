// The hidden /stats/ page: aggregate visit counts from the stats Worker (worker-stats/), which reads
// GoatCounter with a key that never reaches this page. Everything shown is a count; there are no
// visitor rows, IPs or anything about a person.
import { config } from '/shared/config.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => Number(n || 0).toLocaleString();
const RANGE_LABEL = { today: 'today', week: 'the last 7 days', month: 'the last 30 days' };
const BUCKETS = ['0-10s', '10-30s', '30-60s', '1-3m', '3-10m', '10m+'];
const DEVICE = { phone: 'Phone', tablet: 'Tablet', laptop: 'Laptop or desktop' };

// Friendly names for paths
const APPS = { 'snow-surf-report': 'Snow and Surf Report', 'fantasy-football': 'Fantasy Football', 'my-budget-ledger': 'Budget Ledger', contrail: 'Contrail', wallet: 'What’s in My Wallet?' };
function pageName(path) {
  if (path === '/') return 'Cover';
  const m = path.match(/^\/home\/(?:#(.+))?$/);
  if (m) return m[1] ? `Home · ${m[1]} tab` : 'Home';
  const pr = path.match(/^\/projects\/([^/]+)\/$/);
  if (pr) return `Project page · ${pr[1]}`;
  const app = path.split('/')[1];
  const rest = path.slice(app.length + 2);
  return APPS[app] ? `${APPS[app]}${rest ? ` · ${rest.replace(/^app\.html#?/, '').replace(/\/$/, '') || 'app'}` : ''}` : path;
}
const bars = (rows, unit, max = 10) => {
  rows = rows.filter((r) => r[1] > 0).sort((a, b) => b[1] - a[1]).slice(0, max);
  if (!rows.length) return '<p class="empty">Nothing yet.</p>';
  const top = Math.max(...rows.map((r) => r[1]));
  return `<ul class="bars">${rows.map(([k, n]) => `<li><span title="${esc(k)}">${esc(k)}</span><i style="--w:${Math.round(n / top * 100)}%"></i><b>${fmt(n)}</b></li>`).join('')}</ul>${unit ? `<p class="sub" style="margin:6px 0 0">${unit}</p>` : ''}`;
};
const panel = (title, sub, body) => `<section class="stat-panel"><h2>${title}</h2>${sub ? `<p class="sub">${sub}</p>` : ''}${body}</section>`;
// The middle bucket a page's time falls in (a rough "typical time on page")
function typical(buckets = {}) {
  const total = Object.values(buckets).reduce((a, b) => a + b, 0); if (!total) return '—';
  let run = 0; for (const b of BUCKETS) { run += buckets[b] || 0; if (run >= total / 2) return b; }
  return '—';
}

let DATA = null, RANGE = 'week';
function render() {
  const r = DATA.ranges[RANGE], all = DATA.ranges;
  document.querySelectorAll('[data-range]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.range === RANGE)));
  const paths = [...new Set(Object.values(all).flatMap((x) => x.pages.map((p) => p.path)))];
  const views = (rr, path) => rr.pages.filter((p) => p.path === path).reduce((a, p) => a + p.views, 0);
  const rows = paths.map((path) => ({ path, today: views(all.today, path), week: views(all.week, path), month: views(all.month, path) })).sort((a, b) => b.month - a.month || b.week - a.week);
  const timeAll = {}; Object.values(r.time).forEach((b) => Object.entries(b).forEach(([k, n]) => { timeAll[k] = (timeAll[k] || 0) + n; }));
  const detail = (path) => {
    const pp = all.month.perPage[path] || {}, cur = r.perPage[path] || {};
    const list = (o, names = {}) => Object.entries(o || {}).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${esc(names[k] || k)} ${fmt(n)}`).join(' · ') || '—';
    return `<div class="detail">
      <span>Devices (${RANGE_LABEL[RANGE]}): ${list(cur.devices, DEVICE)}</span>
      <span>Browsers (${RANGE_LABEL[RANGE]}): ${list(cur.browsers)}</span>
      <span>Referrer domains (last 30 days): ${(pp.referrers || []).map((x) => `${esc(x.domain)} ${fmt(x.views)}`).join(' · ') || '—'}</span>
      <span>Time on page (${RANGE_LABEL[RANGE]}): ${BUCKETS.map((b) => (r.time[path]?.[b] ? `${b} ${fmt(r.time[path][b])}` : '')).filter(Boolean).join(' · ') || '—'}</span></div>`;
  };
  $('#stats').innerHTML = `
    <div class="stat-cards">
      <div class="stat-card"><b>${fmt(r.views)}</b><span>Page views ${RANGE_LABEL[RANGE]}</span></div>
      <div class="stat-card"><b>${r.visitorsEstimate == null ? '—' : '≈ ' + fmt(r.visitorsEstimate)}</b><span>Visitors (estimate: no cookies, so repeat visits can't be told apart exactly)</span></div>
      <div class="stat-card"><b>${fmt(Object.values(r.entry).reduce((a, b) => a + b, 0))}</b><span>Visits started (entry pages)</span></div>
      <div class="stat-card"><b>${typical(timeAll)}</b><span>Typical time on a page</span></div>
    </div>
    <section class="stat-panel"><h2>Views per page and app</h2><p class="sub">Open a row for its devices, browsers, referrer domains and time on page.</p>
      <div class="table-scroll"><table class="page-table"><thead><tr><th>Page</th><th class="n">Today</th><th class="n">7 days</th><th class="n">30 days</th></tr></thead><tbody>
      ${rows.length ? rows.map((x) => `<tr><td><details><summary>${esc(pageName(x.path))} <span class="sub">${esc(x.path)}</span></summary>${detail(x.path)}</details></td><td class="n">${fmt(x.today)}</td><td class="n">${fmt(x.week)}</td><td class="n">${fmt(x.month)}</td></tr>`).join('') : '<tr><td colspan="4" class="empty">No views yet.</td></tr>'}
      </tbody></table></div></section>
    <div class="stat-grid">
      ${panel('Top pages', `Views, ${RANGE_LABEL[RANGE]}`, bars(r.pages.map((p) => [pageName(p.path), p.views])))}
      ${panel('Top referrer domains', 'Domain only, never the full address', bars(r.referrers.map((x) => [x.domain, x.views])))}
      ${panel('Countries', 'From the visitor’s network, worked out by GoatCounter (which keeps no IP addresses)', bars(r.countries.map((x) => [x.name, x.views]), '', 15))}
      ${panel('US states', 'The finest place detail kept', bars(r.regions.map((x) => [x.name, x.views]), '', 15))}
      ${panel('Devices', 'Phone, tablet, or laptop/desktop', bars(Object.entries(r.devices).map(([k, n]) => [DEVICE[k] || k, n])))}
      ${panel('Browsers', 'Browser family only, no versions', bars(Object.entries(r.browsers)))}
      ${panel('Entry pages', 'Where visits start', bars(Object.entries(r.entry).map(([k, n]) => [pageName(k), n])))}
      ${panel('Exit pages', 'Where visits end (an estimate)', bars(Object.entries(r.exit).map(([k, n]) => [pageName(k), n])))}
      ${panel('Time on page', 'All pages, counted only while the page is on screen', bars(BUCKETS.map((b) => [b, timeAll[b] || 0]).filter(([, n]) => n).map((x) => x), '', 6))}
    </div>
    <p class="stats-note">Counts from ${esc(r.start)} to ${esc(r.end)} (${esc(DATA.timezone)}), updated ${new Date(DATA.generatedAt).toLocaleString()} and at most every 15 minutes.</p>`;
}

document.addEventListener('click', (e) => { const b = e.target.closest('[data-range]'); if (b && DATA) { RANGE = b.dataset.range; render(); } });

if (!config.statsUrl) {
  $('#stats').innerHTML = '<p class="stats-note">Not connected yet: set <code>statsUrl</code> in <code>shared/config.js</code> to the stats Worker’s address (see <code>worker-stats/README.md</code>).</p>';
} else {
  try {
    const res = await fetch(`${config.statsUrl.replace(/\/$/, '')}/summary`);
    DATA = await res.json();
    if (!res.ok || DATA.error) throw new Error(DATA.error || res.status);
    render();
  } catch (e) {
    $('#stats').innerHTML = `<p class="stats-note">Couldn’t load the counts (${esc(e.message)}). Try again in a minute.</p>`;
  }
}
