// The cover: the opening, the bricks that answer a mouse, and the paint wipe into the home
// page. Every link here is a plain link, so all of it is extra:
// without JavaScript (or with reduced motion) the cover is the same page, standing still.

const root = document.documentElement;
const still = matchMedia('(prefers-reduced-motion: reduce)');
const mouse = matchMedia('(hover: hover) and (pointer: fine)');

// ---------- The opening: the wall settles in, then the words (under a second) ----------
// Any key or tap finishes it at once. It plays once per visit (see the <head>).

function endIntro() {
  if (!root.classList.contains('cover-intro')) return;
  root.classList.remove('cover-intro');
  try { sessionStorage.setItem('otw-cover-seen', '1'); } catch { /* private mode: fine */ }
}
if (root.classList.contains('cover-intro')) {
  for (const ev of ['pointerdown', 'keydown', 'wheel', 'touchstart']) addEventListener(ev, endIntro, { once: true, passive: true });
  setTimeout(endIntro, 950);
}

// ---------- The paint wipe: from a button into its page ----------
// Orange paint rolls up over the wall (under half a second), then the page opens and the paint
// rolls off it (js/main.js). A key or tap mid-wipe goes straight there. New-tab clicks, modified
// clicks and reduced motion just follow the link.

let leaving = false;
for (const a of document.querySelectorAll('[data-wipe]')) {
  a.addEventListener('click', (e) => {
    if (still.matches || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    if (leaving) return;
    leaving = true;
    const go = () => { location.href = a.href; };
    try { sessionStorage.setItem('otw-wipe', '1'); } catch { go(); return; }
    const wipe = Object.assign(document.createElement('div'), { className: 'wipe', ariaHidden: 'true' });
    document.body.append(wipe);
    wipe.addEventListener('animationend', go, { once: true });
    for (const ev of ['pointerdown', 'keydown']) addEventListener(ev, go, { once: true });
    setTimeout(go, 700); // whatever happens, never stuck on the paint
  });
}
// Coming back with the back button can restore this page as it was left, paint and all: clear it
addEventListener('pageshow', (e) => {
  if (!e.persisted) return;
  leaving = false;
  document.querySelector('.wipe')?.remove();
  try { sessionStorage.removeItem('otw-wipe'); } catch { /* fine */ }
  endIntro();
});

// ---------- Bricks that answer a mouse ----------
// Mouse only, and off with reduced motion: the wall drifts a few pixels against the cursor
// (parallax), and the bricks nearest it brighten and shift by a pixel or two. One update per
// frame at most, transforms and opacity only, all of it behind the words.

function bricks() {
  const wall = document.querySelector('.wall-bricks');
  const lamp = Object.assign(document.createElement('div'), { className: 'wall-lamp' });
  const glow = Object.assign(document.createElement('div'), { className: 'wall-lamp-bricks' });
  lamp.append(glow);
  document.querySelector('.wall').append(lamp);
  const R = 170; // the lamp's radius
  let x = 0;
  let y = 0;
  let queued = 0;
  function draw() {
    queued = 0;
    const dx = x / innerWidth - 0.5;
    const dy = y / innerHeight - 0.5;
    const px = -dx * 14; // parallax, at most 7px each way
    const py = -dy * 10;
    wall.style.transform = `translate3d(${px.toFixed(1)}px, ${py.toFixed(1)}px, 0)`;
    // The lamp follows the cursor; its bricks line up with the wall's, nudged 1.5px toward the cursor
    const lx = x - R;
    const ly = y - R;
    lamp.style.transform = `translate3d(${lx}px, ${ly}px, 0)`;
    glow.style.transform = `translate3d(${(px - lx + dx * 3).toFixed(1)}px, ${(py - ly + dy * 3).toFixed(1)}px, 0)`;
  }
  addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    x = e.clientX;
    y = e.clientY;
    lamp.classList.add('is-on');
    if (!queued) queued = requestAnimationFrame(draw);
  }, { passive: true });
  document.documentElement.addEventListener('pointerleave', () => lamp.classList.remove('is-on'));
}
if (mouse.matches && !still.matches) bricks();
