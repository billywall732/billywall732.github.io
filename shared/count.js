// Off the Wall's visit counter. A small stand-in for GoatCounter's count.js that sends less:
// aggregate counts only, no cookies, nothing stored in the browser.
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
// The device and browser are worked out here, so GoatCounter needn't keep browser versions.
// GoatCounter receives the request (and so the visitor's IP and browser header, as any web request
// does), uses the IP only to look up the country and region, and doesn't store either.
(() => {
  const me = document.currentScript;
  const endpoint = me && me.dataset.goatcounter;
  if (!endpoint) return;
  let settings = {};
  try { settings = JSON.parse(me.dataset.goatcounterSettings || '{}'); } catch { /* defaults */ }

  // Not counted: local copies, pages shown inside another page, and automated browsers
  const off = location.protocol === 'file:' || /^(localhost|127\.|\[::1\]|0\.0\.0\.0)/.test(location.hostname)
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

  let current = null, shownAt = 0, visible = 0, first = true, leavingWithin = false;
  // Time on page counts only while the page is on screen
  const onScreen = () => (document.visibilityState === 'visible' ? visible + (Date.now() - shownAt) : visible);
  function finishPage(exit) {
    if (!current) return;
    event(`time ${current} ${bucket(onScreen() / 1000)}`);
    if (exit) event(`exit ${current}`);
  }
  function count(vars = {}) {
    const path = cleanPath(vars.path || settings.path);
    if (path === current) return;
    finishPage(false); // switching tabs within a page: the last tab's time
    current = path; visible = 0; shownAt = Date.now();
    send({ p: path, t: vars.title || document.title, r: first ? referrer : '' });
    event(`client ${device} ${browser} ${path}`);
    if (first && !internalArrival) event(`entry ${path}`);
    first = false;
  }

  // Leaving within the site: a click on a same-site link just before the page goes away
  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('a[href]');
    if (!a) return;
    try { const u = new URL(a.href, location.href); leavingWithin = u.host === location.host && u.protocol.startsWith('http'); } catch { leavingWithin = false; }
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
