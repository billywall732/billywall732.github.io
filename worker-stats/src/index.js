// Off the Wall's stats Worker: reads a GoatCounter account with a read-only key (a Worker secret,
// never on any page) and serves aggregate counts to the hidden /stats/ page.
//
//   GET /summary?site=offthewall  →  { site, generatedAt, timezone, ranges: { today, week, month } }
//   GET /summary?site=fantasy     →  the same, for the league's own Fantasy Football site
//
// The summaries are worked out ahead of time: a scheduled run (every 10 minutes, one site each
// time) asks GoatCounter and saves the result in Workers KV. A page load just reads that saved
// copy, so it answers in well under a second. If a copy is getting old, the request also starts a
// refresh in the background; only when there's no copy at all does it ask GoatCounter on the spot.
//
// Only totals leave this Worker or are saved: views per page, per day and per hour, referrer
// domains, countries and US states, and counts of the counter's aggregate events (device and
// browser family, entry/exit pages, time on page, visit length, scroll depth, outbound domains,
// page-to-page moves, screen size). No IDs, no individual visits, nothing about any one person.
// Nothing is logged.

const RANGES = { today: 0, week: 6, month: 29 }; // days before today, inclusive
const STALE_MS = 20 * 60 * 1000; // older than this: refresh in the background while serving it
// GoatCounter site → the Worker secret holding its read-only key
const SITES = { offthewall: 'GOATCOUNTER_TOKEN', fantasy: 'GOATCOUNTER_TOKEN_FANTASY' };
const kvKey = (site) => `summary:v6:${site}`; // v6: referrers and places over the same days as the views

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin') || '';
    const cors = corsHeaders(origin, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: cors ? 204 : 403, headers: cors || {} });
    const url = new URL(request.url);
    if (url.pathname !== '/summary' || request.method !== 'GET') return json({ error: 'not found' }, 404, cors || {});
    if (!cors) return json({ error: 'origin' }, 403, {});

    const site = url.searchParams.get('site') || 'offthewall';
    if (!SITES[site]) return json({ error: 'unknown site' }, 404, cors);
    if (!env[SITES[site]]) return json({ error: 'not set up', detail: `add the ${SITES[site]} secret (see README)` }, 503, cors);

    const saved = await env.STATS.get(kvKey(site));
    if (saved) {
      const age = Date.now() - Date.parse(JSON.parse(saved).generatedAt);
      if (age > STALE_MS) ctx.waitUntil(refresh(env, site).catch(() => {}));
      return new Response(saved, { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...cors } });
    }
    try {
      return new Response(await refresh(env, site), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...cors } });
    } catch (e) {
      return json({ error: 'GoatCounter is unavailable', detail: String(e.message || e).slice(0, 120) }, 502, cors);
    }
  },

  // Every 10 minutes: refresh the site whose saved summary is oldest (one site per run keeps each
  // run well inside the Worker's limit on outgoing requests)
  async scheduled(event, env, ctx) {
    const ages = await Promise.all(Object.keys(SITES).map(async (site) => {
      const s = await env.STATS.get(kvKey(site));
      return [site, s ? Date.parse(JSON.parse(s).generatedAt) : 0];
    }));
    const [oldest] = ages.filter(([site]) => env[SITES[site]]).sort((a, b) => a[1] - b[1])[0] ?? [];
    if (oldest) ctx.waitUntil(refresh(env, oldest));
  },
};

// Ask GoatCounter, save the summary in KV, and return it (as JSON text)
async function refresh(env, site) {
  const prevTz = await env.STATS.get(`tz:${site}`);
  const body = JSON.stringify({ site, ...(await summary(site, env[SITES[site]], prevTz)) });
  await env.STATS.put(kvKey(site), body);
  await env.STATS.put(`tz:${site}`, JSON.parse(body).timezone);
  return body;
}

async function summary(site, token, prevTz) {
  // GoatCounter's API allows only a few requests a second: one at a time, a short gap between them,
  // and when it says "429 Too Many Requests", wait as long as it asks and try again.
  const pause = (ms) => new Promise((r) => setTimeout(r, ms));
  let last = 0;
  const api = async (path, params = {}) => {
    for (let attempt = 0; attempt < 5; attempt++) {
      const wait = last + 300 - Date.now(); if (wait > 0) await pause(wait);
      last = Date.now();
      const res = await fetch(`https://${site}.goatcounter.com/api/v0${path}?${new URLSearchParams(params)}`, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
      if (res.status === 429) { await pause(Math.min(10, Number(res.headers.get('X-Rate-Limit-Reset')) || 1) * 1000 + 200); continue; }
      if (!res.ok) throw new Error(`GoatCounter ${res.status} for ${path}`);
      return res.json();
    }
    throw new Error(`GoatCounter kept saying 429 for ${path}`);
  };
  // Days in the account's own time zone (the last one known if GoatCounter doesn't answer)
  let tz = prevTz || 'America/Los_Angeles';
  try {
    const me = await api('/me');
    tz = String(me.user?.settings?.timezone || tz).split('.').pop();
  } catch { /* keep the known zone */ }
  const day = (offset) => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(Date.now() - offset * 864e5));
  const weekday = (d) => new Date(`${d}T12:00:00Z`).getUTCDay(); // 0 = Sunday
  // Midnight starting a day in the account's zone, as a UTC time. GoatCounter's referrer and place
  // lists take times as well as dates; asking from midnight to midnight in this zone lines them up
  // with the page views (counted per day in this zone). Plain dates are UTC days, 7 or 8 hours off.
  const offsetAt = (ms) => {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' })
      .formatToParts(new Date(ms)).filter((x) => x.type !== 'literal').map((x) => [x.type, Number(x.value)]));
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - ms;
  };
  const midnight = (d) => { const g = Date.parse(`${d}T00:00:00Z`); return new Date(g - offsetAt(g)).toISOString().replace(/\.\d+Z$/, 'Z'); };
  const dayAfter = (d) => new Date(Date.parse(`${d}T12:00:00Z`) + 864e5).toISOString().slice(0, 10);

  // Every page and event once, with its per-day (and per-hour) counts for the last 31 days.
  // GoatCounter treats the end date as exclusive and the dates as UTC while each path's per-day
  // stats come in the account's time zone, so ask from a day early to tomorrow and keep only days
  // inside each range. Paged: GoatCounter returns up to 200 paths at a time.
  const all = [];
  for (let page = 0; page < 6; page++) {
    const params = { start: day(RANGES.month + 1), end: day(-1), limit: 200 };
    if (all.length) params.exclude_paths = all.map((h) => h.path_id).join(',');
    const res = await api('/stats/hits', params);
    all.push(...(res.hits || []));
    if (!res.more || !(res.hits || []).length) break;
  }
  const daily = (st) => Number(st.daily) || (st.hourly || []).reduce((a, b) => a + (Number(b) || 0), 0);
  // The ids of real pages (not the counter's events), for the referrer and place lists below
  const pageIds = all.filter((h) => !h.event && h.path_id != null).map((h) => h.path_id).join(',');
  const add = (o, k, n) => { o[k] = (o[k] || 0) + n; };

  const ranges = {};
  for (const [name, back] of Object.entries(RANGES)) {
    const r = {
      start: day(back), end: day(0), views: 0, visitorsEstimate: null, pages: [], referrers: [], countries: [], regions: [],
      devices: {}, browsers: {}, entry: {}, exit: {}, time: {}, perPage: {},
      // Audience (aggregate counts only)
      byHour: Array(24).fill(0), byWeekday: Array(7).fill(0), visit: {}, scroll: {}, outbound: {}, flows: {}, screens: {},
    };
    const days = (h) => (h.stats || []).filter((st) => st.day >= r.start && st.day <= r.end);
    const byDay = {};
    for (const h of all) {
      const n = h.stats ? days(h).reduce((a, st) => a + daily(st), 0) : Number(h.count) || 0;
      if (!n) continue;
      if (!h.event) {
        r.pages.push({ path: h.path, title: h.title || '', views: n, visitorsEstimate: null, pathId: name === 'month' ? h.path_id : undefined });
        r.views += n;
        for (const st of days(h)) {
          add(byDay, st.day, daily(st));
          r.byWeekday[weekday(st.day)] += daily(st);
          (st.hourly || []).forEach((c, i) => { if (i < 24) r.byHour[i] += Number(c) || 0; });
        }
        continue;
      }
      // The counter's aggregate events (shared/count.js)
      const [kind, ...rest] = String(h.path).split(' ');
      if (kind === 'client' && rest.length >= 3) {
        const [device, ...more] = rest; const path = more.pop(); const browser = more.join(' ');
        add(r.devices, device, n); add(r.browsers, browser, n);
        const pp = (r.perPage[path] ??= { devices: {}, browsers: {} }); add(pp.devices, device, n); add(pp.browsers, browser, n);
      } else if (kind === 'entry') add(r.entry, rest.join(' '), n);
      else if (kind === 'exit') add(r.exit, rest.join(' '), n);
      else if (kind === 'time' && rest.length >= 2) { const b = rest.pop(); const path = rest.join(' '); add((r.time[path] ??= {}), b, n); }
      else if (kind === 'visit' && rest.length === 1) add(r.visit, rest[0], n);
      else if (kind === 'scroll' && rest.length >= 2) add(r.scroll, rest.pop(), n);
      else if (kind === 'out' && rest.length === 1) add(r.outbound, rest[0], n);
      else if (kind === 'screen' && rest.length === 1) add(r.screens, rest[0], n);
      else if (kind === 'flow') { const [from, to] = rest.join(' ').split(' > '); if (from && to) add(r.flows, `${from} > ${to}`, n); }
    }
    // Every day in the range, zeros included (a count, never a list of visits)
    r.trend = name === 'today'
      ? { unit: 'hour', points: r.byHour.map((views, hour) => ({ hour, views })) }
      : { unit: 'day', points: Array.from({ length: back + 1 }, (_, i) => day(back - i)).map((d) => ({ day: d, views: byDay[d] || 0 })) };
    // The 25 busiest page-to-page moves only
    r.flows = Object.fromEntries(Object.entries(r.flows).sort((a, b) => b[1] - a[1]).slice(0, 25));

    // Referrers and places count page views only, like the totals above. (Without this,
    // GoatCounter also counts the counter's own events, about 4 per view, so these lists
    // added up to ~4x the page views for the same days.) And over the same days: midnight to
    // midnight in the account's zone, not UTC days (which added ~8 hours of the day before).
    const span = { start: midnight(r.start), end: midnight(dayAfter(r.end)), include_paths: pageIds };
    const refs = await api('/stats/toprefs', { ...span, limit: 25 }).catch(() => ({ stats: [] }));
    const locs = await api('/stats/locations', { ...span, limit: 40 }).catch(() => ({ stats: [] }));
    // Referrers are sent as an origin only; keep just the host name
    r.referrers = (refs.stats || []).map((x) => ({ domain: hostOf(x.name), views: Number(x.count) || 0 })).filter((x) => x.views);
    r.countries = (locs.stats || []).map((x) => ({ code: x.id || '', name: x.name || x.id || 'Unknown', views: Number(x.count) || 0 })).filter((x) => x.views);
    // US states (the finest place detail shown)
    if (r.countries.some((c) => c.code === 'US')) {
      const us = await api('/stats/locations/US', { ...span, limit: 60 }).catch(() => ({ stats: [] }));
      r.regions = (us.stats || []).map((x) => ({ name: x.name || 'Unknown', views: Number(x.count) || 0 })).filter((x) => x.views && x.name !== 'United States');
    }
    ranges[name] = r;
  }
  // Referrer domains for the busiest pages (last 30 days)
  for (const p of ranges.month.pages.sort((a, b) => b.views - a.views).slice(0, 8)) {
    if (p.pathId == null) continue;
    const pr = await api(`/stats/hits/${p.pathId}`, { start: ranges.month.start, end: day(-1), limit: 8 }).catch(() => ({ refs: [] }));
    const list = pr.refs || pr.stats || [];
    (ranges.month.perPage[p.path] ??= { devices: {}, browsers: {} }).referrers = list.map((x) => ({ domain: hostOf(x.name || x.ref), views: Number(x.count) || 0 })).filter((x) => x.views);
  }
  for (const r of Object.values(ranges)) for (const p of r.pages) delete p.pathId;
  return { generatedAt: new Date().toISOString(), timezone: tz, ranges };
}

// "https://news.example.com/whatever" → "news.example.com"; empty → direct
function hostOf(s) {
  if (!s) return '(direct or unknown)';
  try { return new URL(/^[a-z]+:\/\//i.test(s) ? s : `https://${s}`).host || String(s); } catch { return String(s).split('/')[0]; }
}
function corsHeaders(origin, env) {
  const allowed = env.ALLOWED_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean);
  const ok = allowed.includes(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  return ok ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Max-Age': '86400', Vary: 'Origin' } : null;
}
function json(body, status, headers) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers } });
}
