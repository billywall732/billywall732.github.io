// Off the Wall's stats Worker: reads a GoatCounter account with a read-only key (a Worker secret,
// never on any page) and returns aggregate counts for the hidden /stats/ page.
//
//   GET /summary?site=offthewall  →  { site, generatedAt, ranges: { today, week, month } }
//   GET /summary?site=fantasy     →  the same, for the league's Fantasy Feetpics site
//
// Each range has a trend: views per hour (today) or per day (7 and 30 days), summed over all pages.
//
// Only totals leave this Worker: views per page, referrer domains, countries and regions, device
// and browser counts, entry/exit pages and time-on-page buckets. No IDs, no individual visits,
// nothing about any one person. Answers are cached for 15 minutes. Nothing is logged.

const RANGES = { today: 0, week: 6, month: 29 }; // days before today, inclusive
const CACHE_SEC = 15 * 60;
// GoatCounter site → the Worker secret holding its read-only key
const SITES = { offthewall: 'GOATCOUNTER_TOKEN', fantasy: 'GOATCOUNTER_TOKEN_FANTASY' };

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
    const token = env[SITES[site]];
    if (!token) return json({ error: 'not set up', detail: `add the ${SITES[site]} secret (see README)` }, 503, cors);

    const cacheKey = new Request(`https://stats.cache/summary/v3/${site}`);
    const cached = await caches.default.match(cacheKey);
    if (cached) return new Response(cached.body, { headers: { ...Object.fromEntries(cached.headers), ...cors } });
    try {
      const body = JSON.stringify({ site, ...(await summary(site, token)) });
      ctx.waitUntil(caches.default.put(cacheKey, new Response(body, { headers: { 'Content-Type': 'application/json', 'Cache-Control': `max-age=${CACHE_SEC}` } })));
      return new Response(body, { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...cors } });
    } catch (e) {
      return json({ error: 'GoatCounter is unavailable', detail: String(e.message || e).slice(0, 120) }, 502, cors);
    }
  },
};

async function summary(site, token) {
  // GoatCounter's API allows only a few requests a second: one at a time, a short gap between them,
  // and when it says "429 Too Many Requests", wait as long as it asks and try again.
  const pause = (ms) => new Promise((r) => setTimeout(r, ms));
  let last = 0;
  const api = async (path, params = {}) => {
    for (let attempt = 0; attempt < 6; attempt++) {
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
  // Days in the account's own time zone
  const me = await api('/me');
  const tz = String(me.user?.settings?.timezone || 'UTC').split('.').pop();
  const day = (offset) => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(Date.now() - offset * 864e5));

  const ranges = {};
  for (const [name, back] of Object.entries(RANGES)) {
    // GoatCounter treats the end date as exclusive and the dates as UTC, while each path's per-day
    // stats come in the account's time zone. So ask from a day early to tomorrow, and count each
    // path from its per-day stats, keeping only days inside the range.
    const span = { start: day(back + 1), end: day(-1) };
    const hits = await api('/stats/hits', { ...span, limit: 200 });
    const refs = await api('/stats/toprefs', { start: day(back), end: day(-1), limit: 25 }).catch(() => ({ stats: [] }));
    const locs = await api('/stats/locations', { start: day(back), end: day(-1), limit: 40 }).catch(() => ({ stats: [] }));
    const r = { start: day(back), end: day(0), views: 0, visitorsEstimate: null, pages: [], referrers: [], countries: [], regions: [], devices: {}, browsers: {}, entry: {}, exit: {}, time: {}, perPage: {} };
    const add = (o, k, n) => { o[k] = (o[k] || 0) + n; };
    const byDay = {}, hours = Array(24).fill(0);
    const daily = (st) => Number(st.daily) || (st.hourly || []).reduce((a, b) => a + (Number(b) || 0), 0);
    const inRange = (h) => (h.stats ? h.stats.filter((st) => st.day >= r.start && st.day <= r.end).reduce((a, st) => a + daily(st), 0) : Number(h.count) || 0);
    for (const h of hits.hits || []) {
      const n = inRange(h);
      if (!n) continue;
      if (!h.event) {
        r.pages.push({ path: h.path, title: h.title || '', views: n, visitorsEstimate: null, pathId: name === 'month' ? h.path_id : undefined });
        r.views += n;
        // Views per day (and per hour, for Today) across all pages: the trend chart
        for (const st of h.stats || []) {
          if (st.day >= r.start && st.day <= r.end) add(byDay, st.day, daily(st));
          if (name === 'today' && st.day === r.end) (st.hourly || []).forEach((c, i) => { if (i < 24) hours[i] += Number(c) || 0; });
        }
        continue;
      }
      // Our aggregate events (shared/count.js): client / entry / exit / time
      const [kind, ...rest] = String(h.path).split(' ');
      if (kind === 'client' && rest.length >= 3) {
        const [device, ...more] = rest; const path = more.pop(); const browser = more.join(' ');
        add(r.devices, device, n); add(r.browsers, browser, n);
        const pp = (r.perPage[path] ??= { devices: {}, browsers: {} }); add(pp.devices, device, n); add(pp.browsers, browser, n);
      } else if (kind === 'entry') add(r.entry, rest.join(' '), n);
      else if (kind === 'exit') add(r.exit, rest.join(' '), n);
      else if (kind === 'time' && rest.length >= 2) { const b = rest.pop(); const path = rest.join(' '); add((r.time[path] ??= {}), b, n); }
    }
    // Every day in the range, zeros included (a count, never a list of visits)
    r.trend = name === 'today'
      ? { unit: 'hour', points: hours.map((views, hour) => ({ hour, views })) }
      : { unit: 'day', points: Array.from({ length: back + 1 }, (_, i) => day(back - i)).map((d) => ({ day: d, views: byDay[d] || 0 })) };
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
