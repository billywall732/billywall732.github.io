// Security headers for offthewall.dev. GitHub Pages can't set response headers, so this Worker
// sits in front of it (Cloudflare route offthewall.dev/*), passes every request through to
// GitHub Pages unchanged, and adds the headers on the way back:
//
//   Strict-Transport-Security   HTTPS only, for a year, subdomains too (preload-ready)
//   Content-Security-Policy     what each app may load and talk to (built from an audit of the
//                               code, Nov 2026: see ALLOW below), and frame-ancestors 'self'
//   X-Frame-Options             SAMEORIGIN (older browsers)
//   X-Content-Type-Options      nosniff
//   Referrer-Policy             strict-origin-when-cross-origin
//   Permissions-Policy          no camera, microphone, payment...; geolocation only for this
//                               site itself (Snow & Surf's "Use my location")
//
// It also removes GitHub Pages' "Access-Control-Allow-Origin: *": nothing on this site needs
// to be read by other websites. (The site's own APIs are separate Workers with their own
// origin allowlists.)
//
// Nothing about a request is logged or stored.

// Every page may use: its own files, Google Fonts, and the visit counter.
const BASE = {
  'default-src': ["'self'"],
  // 'unsafe-inline': every page has a small inline script (the color-mode switch runs before the
  // page draws) and the single-file apps are inline. A static site can't use per-request nonces.
  'script-src': ["'self'", "'unsafe-inline'"],
  'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
  'font-src': ["'self'", 'https://fonts.gstatic.com'],
  'img-src': ["'self'", 'data:', 'blob:'],
  'connect-src': ["'self'", 'https://offthewall.goatcounter.com'],
  'worker-src': ["'self'"],
  'manifest-src': ["'self'"],
  'frame-src': ["'none'"],
  'object-src': ["'none'"],
  'base-uri': ["'self'"],
  'form-action': ["'self'"],
  'frame-ancestors': ["'self'"],
};

// What each part of the site needs on top of BASE (longest matching path wins). Only the third
// parties the code actually calls from the browser; Open-Meteo, NOAA and ESPN are fetched by
// GitHub Actions, never by visitors' browsers, so they aren't here.
const ALLOW = {
  // The stats page reads the stats Worker
  '/stats/': { 'connect-src': ['https://otw-stats.offthewall-dev.workers.dev'] },
  // The admin page: sign-in and the admin_* database functions in Supabase
  '/admin/': { 'connect-src': ['https://yxdmuznxcqcauyehhfmp.supabase.co', 'wss://yxdmuznxcqcauyehhfmp.supabase.co'] },
  // Contrail: D3 + TopoJSON from cdnjs, map outlines from jsDelivr, OpenStreetMap place search,
  // members' saved data in Supabase
  '/contrail/': {
    'script-src': ['https://cdnjs.cloudflare.com'],
    'connect-src': ['https://cdn.jsdelivr.net', 'https://nominatim.openstreetmap.org', 'https://yxdmuznxcqcauyehhfmp.supabase.co', 'wss://yxdmuznxcqcauyehhfmp.supabase.co'],
  },
  '/wallet/': {
    'script-src': ['https://cdnjs.cloudflare.com'],
    'connect-src': ['https://cdn.jsdelivr.net', 'https://yxdmuznxcqcauyehhfmp.supabase.co', 'wss://yxdmuznxcqcauyehhfmp.supabase.co'],
  },
  // Krillion Code Breaker: its Worker (scores, the live play-by-play and screenshots)
  '/code-breaker/': {
    'connect-src': ['https://krillion-code-breaker.offthewall-dev.workers.dev'],
    'img-src': ['https://krillion-code-breaker.offthewall-dev.workers.dev'],
  },
  // Snow & Surf: saved settings in Supabase (sign-in is a full-page trip to Google)
  '/snow-surf-report/': {
    'connect-src': ['https://yxdmuznxcqcauyehhfmp.supabase.co', 'wss://yxdmuznxcqcauyehhfmp.supabase.co'],
  },
  // Budget Ledger: saves to Supabase (sign-in is a full-page trip to Google, so no frames or
  // Google scripts), Google profile pictures, SheetJS from cdnjs
  '/my-budget-ledger/': {
    'script-src': ['https://cdnjs.cloudflare.com'],
    'connect-src': ['https://yxdmuznxcqcauyehhfmp.supabase.co', 'wss://yxdmuznxcqcauyehhfmp.supabase.co'],
    'img-src': ['https://*.googleusercontent.com'],
  },
  // Fantasy Football: the league's refresh Worker
  '/fantasy-football/': { 'connect-src': ['https://league-refresh.offthewall-dev.workers.dev'] },
  '/fantasy-feetpics/': { 'connect-src': ['https://league-refresh.offthewall-dev.workers.dev', 'https://fantasy.goatcounter.com'] },
};

export function cspFor(pathname) {
  const key = Object.keys(ALLOW).filter((p) => pathname.startsWith(p)).sort((a, b) => b.length - a.length)[0];
  const extra = key ? ALLOW[key] : {};
  const dirs = { ...BASE };
  for (const [d, list] of Object.entries(extra)) dirs[d] = [...(dirs[d] ?? []).filter((x) => x !== "'none'"), ...list];
  return `${Object.entries(dirs).map(([d, list]) => `${d} ${list.join(' ')}`).join('; ')}; upgrade-insecure-requests`;
}

export function securityHeaders(pathname) {
  return {
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
    'Content-Security-Policy': cspFor(pathname),
    'X-Frame-Options': 'SAMEORIGIN',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(self), payment=(), usb=(), serial=(), bluetooth=(), hid=(), midi=(), magnetometer=(), gyroscope=(), accelerometer=(), browsing-topics=()',
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    // On the offthewall.dev route, a fetch to the same host goes straight to GitHub Pages.
    // (On the workers.dev preview address, fetch the real site.)
    if (url.hostname !== env.SITE_HOST) url.hostname = env.SITE_HOST;
    const res = await fetch(new Request(url, request), { redirect: 'manual' });
    const out = new Response(res.body, res);
    out.headers.delete('Access-Control-Allow-Origin');
    for (const [k, v] of Object.entries(securityHeaders(url.pathname))) out.headers.set(k, v);
    return out;
  },
};
