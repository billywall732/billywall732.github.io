// Off the Wall's visit counter. A small stand-in for GoatCounter's count.js that sends less:
// aggregate counts only, no cookies, no IDs. The only thing kept in the browser is the time the
// current visit started, in this tab's sessionStorage (gone when the tab closes, never sent), so
// the visit's length can be counted in a bucket when it ends.
//
// Load it like GoatCounter's script (same attributes, so pages only change the src):
//   <script data-goatcounter="https://offthewall.goatcounter.com/count"
//           data-goatcounter-settings='{"path":"/wallet/"}' async src="/shared/count.js"></script>
// Settings: "path" (a fixed page name) and "no_onload" (the page counts its own views, e.g. tabs).
// Pages that count tabs call window.goatcounter.count({ path, title }), as with GoatCounter.
//
// What it sends, and nothing else:
//   - the page path, never the query string (it can hold personal data)
//   - the referrer's origin only (https://example.com), and nothing for links within the site
//   - a few aggregate events:
//       "client <device> <browser> <path>"  device = phone / tablet / laptop; browser family only
//       "entry <path>"                      the first page of a visit (arrived from elsewhere)
//       "time <path> <bucket>"              time on the page, in buckets (0-10s … 10m+)
//       "exit <path>"                       leaving the site from this page (an estimate)
//       "visit <bucket>"                    the visit's length when it ends (<30s, 30s-1m, 1-5m, 5m+)
//       "scroll <path> <0|25|50|75|100>"    how far down the page this view got, in quarters
//       "out <domain>"                      a click to another site: its domain only, never the address
//       "flow <from> > <to>"                one move between two pages of the site (paths only)
//       "screen <phone|tablet|desktop>"     the window's width, in three sizes
// The device and browser are worked out here, so GoatCounter needn't keep browser versions.
// GoatCounter receives the request (and so the visitor's IP and browser header, as any web request
// does), uses the IP only to look up the country and region, and doesn't store either.
(() => {
  const me = document.currentScript;
  const endpoint = me && me.dataset.goatcounter;
  if (!endpoint) return;
  let settings = {};
  try { settings = JSON.parse(me.dataset.goatcounterSettings || '{}'); } catch { /* defaults */ }

  // The owner's own browsers can opt out, GoatCounter's way: open any page with #toggle-goatcounter
  // on the end of the address (or use the switch on /stats/). That saves "skipgc" in this browser's
  // localStorage, for this whole site (the apps and the league share it). Visitors never get it.
  let skipped = false;
  try {
    if (location.hash === '#toggle-goatcounter') {
      if (localStorage.getItem('skipgc') === 't') localStorage.removeItem('skipgc'); else localStorage.setItem('skipgc', 't');
      alert(localStorage.getItem('skipgc') === 't' ? 'Visits from this browser are no longer counted.' : 'Visits from this browser are counted again.');
    }
    skipped = localStorage.getItem('skipgc') === 't';
  } catch { /* storage blocked: count as usual */ }

  // Not counted: local copies, pages shown inside another page, automated browsers, and opted-out ones
  const off = skipped || location.protocol === 'file:' || /^(localhost|127\.|\[::1\]|0\.0\.0\.0)/.test(location.hostname)
    || window !== window.top || navigator.webdriver || /bot|crawl|spider|headless|lighthouse/i.test(navigator.userAgent);

  function send(params) {
    if (off) return;
    const url = `${endpoint}?${new URLSearchParams({ ...params, rnd: Math.random().toString(36).slice(2, 7) })}`;
    if (!(navigator.sendBeacon && navigator.sendBeacon(url))) new Image().src = url;
  }
  const event = (name) => send({ p: name, e: 'true' });

  const cleanPath = (p) => String(p || location.pathname).split('?')[0] || '/';
  let referrer = '';
  try { const r = new URL(document.referrer); if (r.host !== location.host) referrer = r.origin; } catch { /* none */ }
  const internalArrival = (() => { try { return new URL(document.referrer).host === location.host; } catch { return false; } })();

  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\/|Opera/.test(ua) ? 'Opera' : /SamsungBrowser/.test(ua) ? 'Samsung Internet'
    : /Firefox\/|FxiOS/.test(ua) ? 'Firefox' : /Chrome\/|CriOS/.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Other';
  const short = Math.min(screen.width, screen.height), touch = matchMedia('(pointer: coarse)').matches;
  const device = touch && short < 600 ? 'phone' : touch && short < 1100 ? 'tablet' : 'laptop';

  const BUCKETS = [[10, '0-10s'], [30, '10-30s'], [60, '30-60s'], [180, '1-3m'], [600, '3-10m'], [Infinity, '10m+']];
  const bucket = (s) => BUCKETS.find(([max]) => s < max)[1];
  const VISIT = [[30, '<30s'], [60, '30s-1m'], [300, '1-5m'], [Infinity, '5m+']];
  const screenSize = () => (innerWidth < 600 ? 'phone' : innerWidth < 1024 ? 'tablet' : 'desktop');

  // The visit's start time, kept in this tab only (see the top of this file)
  const VISIT_KEY = 'otw-visit-start';
  const visitStart = (reset) => {
    try {
      if (reset || !sessionStorage.getItem(VISIT_KEY)) sessionStorage.setItem(VISIT_KEY, String(Date.now()));
      return Number(sessionStorage.getItem(VISIT_KEY));
    } catch { return 0; } // storage blocked: no visit length
  };

  // How far down the page this view got (0 to 1)
  let deepest = 0;
  const depthNow = () => {
    const h = Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0);
    return h <= innerHeight ? 1 : Math.min(1, (scrollY + innerHeight) / h);
  };
  addEventListener('scroll', () => { deepest = Math.max(deepest, depthNow()); }, { passive: true });

  let current = null, shownAt = 0, visible = 0, first = true, leavingWithin = false;
  // Time on page counts only while the page is on screen
  const onScreen = () => (document.visibilityState === 'visible' ? visible + (Date.now() - shownAt) : visible);
  function finishPage(exit) {
    if (!current) return;
    event(`time ${current} ${bucket(onScreen() / 1000)}`);
    deepest = Math.max(deepest, depthNow());
    event(`scroll ${current} ${[100, 75, 50, 25].find((q) => deepest >= q / 100 - 0.02) ?? 0}`);
    if (exit) {
      event(`exit ${current}`);
      const start = visitStart(false);
      if (start) { event(`visit ${VISIT.find(([max]) => (Date.now() - start) / 1000 < max)[1]}`); try { sessionStorage.removeItem(VISIT_KEY); } catch { /* fine */ } }
    }
  }
  function count(vars = {}) {
    const path = cleanPath(vars.path || settings.path);
    if (path === current) return;
    // A move between two pages of the site: from the page before (a tab here, or the same-site
    // page that linked here, by its path only)
    let from = current;
    if (!from && internalArrival) { try { from = cleanPath(new URL(document.referrer).pathname); } catch { from = null; } }
    finishPage(false); // switching tabs within a page: the last tab's time and scroll
    current = path; visible = 0; shownAt = Date.now(); deepest = 0;
    send({ p: path, t: vars.title || document.title, r: first ? referrer : '' });
    event(`client ${device} ${browser} ${path}`);
    event(`screen ${screenSize()}`);
    if (from && from !== path) event(`flow ${from} > ${path}`);
    if (first && !internalArrival) { event(`entry ${path}`); visitStart(true); } else if (first) visitStart(false);
    first = false;
  }

  // Leaving within the site: a click on a same-site link just before the page goes away.
  // A click to another site counts its domain only.
  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('a[href]');
    if (!a) return;
    try {
      const u = new URL(a.href, location.href);
      leavingWithin = u.host === location.host && u.protocol.startsWith('http');
      if (!leavingWithin && u.protocol.startsWith('http')) event(`out ${u.hostname.toLowerCase()}`);
    } catch { leavingWithin = false; }
    setTimeout(() => { leavingWithin = false; }, 3000);
  }, true);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') visible += Date.now() - shownAt; else shownAt = Date.now();
  });
  let done = false;
  addEventListener('pagehide', () => { if (done) return; done = true; finishPage(!leavingWithin); });

  window.goatcounter = { count, endpoint };
  if (!settings.no_onload) count();
})();
