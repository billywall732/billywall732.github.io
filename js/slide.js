// Workshop, Off the Clock and Contact sit side by side, in that order. Moving between them slides
// the page content sideways: forward (to the right in the stack) slides it left, backward slides it
// right. The top bar and footer stay put (css/slide.css). Uses the browser's View Transitions:
// between /home/ and /contact/ it's a cross-document transition, and between Workshop and Off the
// Clock (both on /home/) js/main.js calls otwSlide. Where View Transitions aren't supported, or
// with reduced motion, pages just switch. Loaded as a plain script in the <head> of /home/ and
// /contact/, so it's listening before the page first draws.
(() => {
  const KEY = 'otw-stack';
  const CLOCK = ['about', 'off-the-clock', 'story', 'hobbies'];
  const root = document.documentElement;
  // Where a URL sits in the stack: 0 Workshop, 1 Off the Clock, 2 Contact; -1 anywhere else
  const place = (href) => {
    const url = new URL(href, location.href);
    if (url.origin !== location.origin) return -1;
    if (url.pathname === '/contact/') return 2;
    if (url.pathname === '/home/') return CLOCK.includes(decodeURIComponent(url.hash.slice(1))) ? 1 : 0;
    return -1;
  };
  const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const remember = (i) => { try { sessionStorage.setItem(KEY, String(i)); } catch { /* fine */ } };
  const recall = () => { try { const v = sessionStorage.getItem(KEY); return v === null ? -1 : Number(v); } catch { return -1; } };
  const main = () => document.getElementById('main');
  // Play a slide: back slides the other way; tidy up when it's done (or skipped)
  function play(vt, back) {
    root.classList.toggle('slide-back', back);
    vt.finished.finally(() => {
      root.classList.remove('slide-back', 'vt-in');
      const m = main(); if (m) m.style.viewTransitionName = '';
    });
  }

  // Leaving for another page: the outgoing content is named on its own, so it slides out from
  // exactly where it was on screen (the arriving page decides whether there's a slide at all)
  addEventListener('pageswap', (e) => {
    const m = main();
    if (e.viewTransition && m) m.style.viewTransitionName = 'main-out';
  });

  // Arriving: slide only from another page in the stack. Never on a first load or a reload.
  addEventListener('pagereveal', (e) => {
    const m = main(); if (m) m.style.viewTransitionName = ''; // back from the back/forward cache
    const from = recall(), to = place(location.href);
    remember(to);
    const vt = e.viewTransition;
    if (!vt) return;
    if (from < 0 || to < 0 || from === to || still()) { vt.skipTransition(); return; }
    root.classList.add('vt-in'); // names the incoming content (css/slide.css)
    play(vt, to < from);
  });

  // Within /home/ (Workshop <-> Off the Clock): js/main.js passes the change in `update`
  window.otwSlide = (from, to, update) => {
    remember(to);
    const m = main();
    if (!document.startViewTransition || still() || from < 0 || to < 0 || from === to || !m) { update(); return; }
    m.style.viewTransitionName = 'main-out';
    const vt = document.startViewTransition(() => {
      m.style.viewTransitionName = '';
      root.classList.add('vt-in');
      update();
    });
    play(vt, to < from);
  };
})();
