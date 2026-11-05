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
// Mouse only, and off with reduced motion. The wall itself stays put; the bricks under the cursor
// swell like a lens, brighten, and trail a few pixels behind the cursor as it moves, springing
// back when it stops. One update per frame, only while something is changing; transforms and
// opacity only, all of it behind the words.

function bricks() {
  const holder = document.querySelector('.wall');
  // The lens: its radius, and how much its bricks swell around the cursor
  const lenses = [{ r: 190, pull: 1.14 }].map(({ r, pull }) => {
    const lamp = Object.assign(document.createElement('div'), { className: 'wall-lamp' });
    const glow = Object.assign(document.createElement('div'), { className: 'wall-lamp-bricks' });
    lamp.style.width = lamp.style.height = `${r * 2}px`;
    lamp.append(glow);
    holder.append(lamp);
    return { r, pull, lamp, glow };
  });
  const LEAN = 9; // how far (px) the bricks can trail behind a moving cursor
  let x = 0;
  let y = 0;
  let last = null;
  let vx = 0;
  let vy = 0;
  let queued = 0;
  function draw() {
    queued = 0;
    vx *= 0.84;
    vy *= 0.84;
    const sx = Math.max(-LEAN, Math.min(LEAN, vx));
    const sy = Math.max(-LEAN, Math.min(LEAN, vy));
    for (const { r, pull, lamp, glow } of lenses) {
      // The lens sits on the cursor; its bricks line up with the wall's, trail behind the cursor's
      // movement, and swell around it (the scale is centred on the brick under it)
      const lx = x - r;
      const ly = y - r;
      const tx = -lx - sx;
      const ty = -ly - sy;
      lamp.style.transform = `translate3d(${lx}px, ${ly}px, 0)`;
      glow.style.transformOrigin = `${(r + 24 - tx).toFixed(1)}px ${(r + 24 - ty).toFixed(1)}px`;
      glow.style.transform = `translate3d(${tx.toFixed(1)}px, ${ty.toFixed(1)}px, 0) scale(${pull})`;
    }
    if (Math.abs(vx) + Math.abs(vy) > 0.15) queued = requestAnimationFrame(draw); // still settling
  }
  addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    x = e.clientX;
    y = e.clientY;
    if (last) { vx += (x - last.x) * 0.35; vy += (y - last.y) * 0.35; }
    last = { x, y };
    for (const l of lenses) l.lamp.classList.add('is-on');
    if (!queued) queued = requestAnimationFrame(draw);
  }, { passive: true });
  document.documentElement.addEventListener('pointerleave', () => { for (const l of lenses) l.lamp.classList.remove('is-on'); });
}
if (mouse.matches && !still.matches) bricks();
