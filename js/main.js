// The home page at /home/: two pages built from js/projects.js. Workshop (#workshop; #workbench and
// #toolkit open its boxes) and Off the Clock (#about; #hobbies goes to Hobbies & Interests). The
// address picks the page, so each can be linked to and the back button works.
import { clockPhotos, hobbies, projects, toolkit } from './projects.js';
import { $, accentStyle, actions, h, iconTile, markNav, preview, projectHref, setUpPage, spotlight, statusPill } from './ui.js';

const byStatus = (s) => projects.filter((p) => p.status === s);

// ---------- Polished and rough projects: big cards ----------

function card(p, wide) {
  return h('article', { class: `project${wide ? ' featured' : ''}`, style: accentStyle(p) },
    h('span', { class: 'spot', 'aria-hidden': 'true' }),
    // Icon, category and status sit above the preview window
    h('div', { class: 'project-meta' },
      iconTile(p),
      h('span', { class: 'kicker' }, p.kicker),
      statusPill(p)),
    preview(p),
    h('div', { class: 'project-body' },
      h('h2', {}, h('a', { href: projectHref(p) }, p.name)),
      h('p', { class: 'blurb' }, p.blurb),
      h('ul', { class: 'highlights' }, p.highlights.map((x) => h('li', {}, x))),
      h('ul', { class: 'tags', 'aria-label': 'Built with' }, p.tags.map((t) => h('li', {}, t))),
      actions(p, { code: false })));
}

const empty = (text) => h('p', { class: 'view-empty' }, text);

for (const grid of document.querySelectorAll('.projects')) {
  const list = byStatus(grid.dataset.status);
  // The first polished project gets the wide card; a lone card always does
  grid.replaceChildren(...(list.length
    ? list.map((p, i) => card(p, i === 0 && (grid.dataset.status === 'live' || list.length === 1)))
    : [empty('Nothing here right now. Check the other tabs.')]));
}
spotlight(document.querySelectorAll('.project'));

// ---------- Still on the workbench: a compact list (rough projects first, then the rest) ----------

const workshop = [...byStatus('rough'), ...byStatus('workshop')];
$('.workshop-list').replaceChildren(...(workshop.length ? workshop.map((p) => h('li', { style: accentStyle(p) },
  h('a', { class: 'workshop-item', href: projectHref(p) },
    iconTile(p),
    h('span', { class: 'workshop-text' },
      h('strong', {}, p.name),
      h('span', { class: 'workshop-line' }, p.tagline)),
    h('span', { class: 'workshop-status' }, p.statusNote),
    h('span', { class: 'workshop-more' }, 'Learn more ', h('span', { 'aria-hidden': 'true' }, '→'))))) : [empty('The bench is clear.')]));

// ---------- Workshop, Toolkit: each app's main tools, as checked in its code ----------

$('.toolkit').replaceChildren(...projects.filter((p) => toolkit[p.slug]?.length).map((p) => h('section', { class: 'kit', style: accentStyle(p), 'aria-labelledby': `kit-${p.slug}` },
  h('h3', { id: `kit-${p.slug}` }, h('a', { href: projectHref(p) }, p.name)),
  h('ul', { class: 'kit-tools' }, toolkit[p.slug].map((t) => h('li', {}, t))))));

// ---------- Off the clock, About: photos, the two numbers, the line through How it got here ----------

// Three Off the Clock photos above the bio, shown whole at their own portrait shape
const COLLAGE = ['snowboarding', 'surfing', 'mountain-biking'];
$('.collage').replaceChildren(...COLLAGE.map((id) => clockPhotos.find((p) => p.id === id)).filter(Boolean).map((p) => h('li', {},
  h('img', { src: `/img/clock/${p.id}.webp`, alt: p.alt, width: '1050', height: '1400', loading: 'lazy', decoding: 'async', style: `object-position:50% ${Math.round((p.focus?.[0] ?? 0.5) * 100)}%` }))));

$('.count-live').textContent = byStatus('live').length;
$('.count-bench').textContent = byStatus('rough').length + byStatus('workshop').length;

// One curving line snakes down through the timeline cards (they zig-zag left and right): from the
// bottom of each card to the top of the next, as a soft S. Drawn from layout positions, so the
// cards' fade-in never bends it; redrawn whenever the cards change size.
const snake = $('.snake');
function drawSnake() {
  const cards = [...snake.querySelectorAll('.timeline li')];
  if (!snake.offsetWidth || cards.length < 2) return;
  const svg = $('.snake-line', snake);
  svg.setAttribute('viewBox', `0 0 ${snake.offsetWidth} ${snake.offsetHeight}`);
  let d = '';
  cards.slice(0, -1).forEach((a, i) => {
    const b = cards[i + 1];
    const x1 = a.offsetLeft + a.offsetWidth / 2, y1 = a.offsetTop + a.offsetHeight;
    const x2 = b.offsetLeft + b.offsetWidth / 2, y2 = b.offsetTop;
    const k = (y2 - y1) * 0.95;
    d += `M${x1} ${y1}C${x1} ${y1 + k} ${x2} ${y2 - k} ${x2} ${y2}`;
  });
  $('path', svg).setAttribute('d', d);
}
new ResizeObserver(drawSnake).observe(snake);
document.fonts?.ready.then(drawSnake);

// Gentle reveal as each part scrolls into view, set up when the tab first opens (so nothing waits
// at zero opacity in a hidden tab); whatever is already on screen shows at once. None of it with
// reduced motion.
let aboutWatched = false;
function revealAbout() {
  if (aboutWatched || still.matches || !('IntersectionObserver' in window)) return;
  aboutWatched = true;
  const items = [...document.querySelectorAll('#view-about .about-reveal')];
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
  }, { rootMargin: '0px 0px -6% 0px' });
  for (const el of items) {
    if (el.getBoundingClientRect().top < innerHeight) continue; // on screen now: no fade
    el.classList.add('will-reveal');
    io.observe(el);
  }
}

// ---------- Off the clock, Hobbies: proudly mediocre at ----------

// Each block with photos is a button that puts its photo in the carousel
const VERDICT = ['', 'A hazard', 'Survives', 'Solidly mediocre', 'Suspiciously decent', 'Lying'];
const photos = clockPhotos;
const blocks = hobbies.map((x) => {
  const ids = (x.photos ?? []).filter((id) => photos.some((p) => p.id === id));
  const label = `${x.name}, self-rated ${x.rating} out of 5: ${VERDICT[x.rating]}`;
  const block = h(ids.length ? 'button' : 'div', ids.length
    ? { type: 'button', class: 'hobby is-pickable', 'aria-pressed': 'false', 'aria-label': `${label}. Show photo` }
    : { class: 'hobby', role: 'group', 'aria-label': label },
  h('span', { class: 'hobby-head' },
    h('span', { class: 'hobby-icon', 'aria-hidden': 'true' }, x.icon),
    h('strong', { class: 'hobby-name' }, x.name),
    ids.length ? h('span', { class: 'hobby-cam', 'aria-hidden': 'true' }, '📷') : null),
  h('span', { class: 'mediocre', 'aria-hidden': 'true' },
    h('span', { class: 'mediocre-bar' }, [1, 2, 3, 4, 5].map((n) => h('i', { class: n <= x.rating ? 'on' : null }))),
    h('span', { class: 'mediocre-text' }, `${x.rating}/5 · ${VERDICT[x.rating]}`)));
  block.ids = ids;
  return block;
});
$('.hobbies').replaceChildren(...blocks.map((b) => h('li', {}, b)));

// ---------- Off the clock: the photo carousel ----------
// Crossfades to the next photo every few seconds, with a slow zoom. Pauses
// while another tab is open, while the page is in the background, and on
// hover or focus; starts paused for reduced motion. Only the photo on screen
// and the next one are ever loaded.

const carousel = $('.carousel');
const STEP = 6000;
const still = matchMedia('(prefers-reduced-motion: reduce)');
let at = 0;
let timer = 0;
let playing = !still.matches;
let held = false; // hovered or focused

const layers = [0, 1].map(() => h('img', { class: 'carousel-img', alt: '', width: '1050', height: '1400', decoding: 'async' }));
const caption = h('span', { class: 'carousel-caption' });
const count = h('span', { class: 'carousel-count' });
const button = (cls, label, text, onClick) => {
  const b = h('button', { type: 'button', class: `carousel-btn ${cls}`, 'aria-label': label }, text);
  b.addEventListener('click', onClick);
  return b;
};
const playBtn = button('is-play', '', '', () => { playing = !playing; drawPlay(); restart(); });
const live = h('p', { class: 'sr', 'aria-live': 'polite' });
carousel.replaceChildren(
  h('div', { class: 'carousel-frame is-loading' }, ...layers),
  // One row that never changes height: previous, the caption (two lines at most), count, play, next
  h('figcaption', { class: 'carousel-bar' },
    button('is-prev', 'Previous photo', '←', () => go(at - 1, true)),
    caption,
    count,
    playBtn,
    button('is-next', 'Next photo', '→', () => go(at + 1, true))),
  live);

// Fixed strings, so innerHTML is safe
const ICON = {
  pause: '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><rect x="3" y="2" width="3.5" height="12" rx="1" fill="currentColor"/><rect x="9.5" y="2" width="3.5" height="12" rx="1" fill="currentColor"/></svg>',
  play: '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M4 2.5v11a1 1 0 0 0 1.5.86l9-5.5a1 1 0 0 0 0-1.72l-9-5.5A1 1 0 0 0 4 2.5z" fill="currentColor"/></svg>',
};

function drawPlay() {
  playBtn.innerHTML = playing ? ICON.pause : ICON.play;
  playBtn.setAttribute('aria-label', playing ? 'Pause the slideshow' : 'Play the slideshow');
}

// Frame a photo on its people. The photos are portrait and fill the frame's width, so only the
// top and bottom are ever cut: pick the slice that centers the people, but never starts below
// the top person's head, with a little headroom. The slow zoom (drift, up to 1.07x) trims the
// edges a bit more, so that's allowed for too. Uses the photo's real shape once it's known.
const ZOOM = 1.07;
function frameOn(img) {
  const [center, head] = (img.dataset.focus || '0.5,0').split(',').map(Number);
  const frame = img.parentElement.getBoundingClientRect();
  const ratio = img.naturalWidth ? img.naturalHeight / img.naturalWidth : 1400 / 1050;
  const shown = frame.width ? Math.min(1, frame.height / (frame.width * ratio)) : 0.75; // share of the photo's height on screen
  if (shown >= 1) { img.style.objectPosition = '50% 50%'; return; }
  const zoomTrim = (shown * (1 - 1 / ZOOM)) / 2; // what the zoom hides at the top, at its closest
  const top = Math.max(0, Math.min(1 - shown, center - shown / 2, head - 0.05 - zoomTrim));
  img.style.objectPosition = `50% ${(top / (1 - shown) * 100).toFixed(1)}%`;
}
// Again whenever the frame changes size (including when the Off the Clock tab first shows)
new ResizeObserver(() => layers.forEach((l) => l.dataset.focus && frameOn(l))).observe(layers[0].parentElement);

let asked = 0; // the latest photo asked for; an older one that finishes loading later is ignored
let waiting = 0;
const frameEl = carousel.querySelector('.carousel-frame');
function go(i, byHand = false) {
  at = (i + photos.length) % photos.length;
  const p = photos[at];
  const ticket = ++asked;
  const [front, back] = layers[0].classList.contains('is-on') ? layers : [layers[1], layers[0]];
  back.src = `/img/clock/${p.id}.webp`;
  back.alt = p.alt;
  back.dataset.focus = (p.focus ?? [0.5, 0]).join(',');
  frameOn(back);
  const swap = () => {
    if (ticket !== asked) return;
    frameOn(back); // again, now that the photo's real shape is known
    back.classList.add('is-on');
    front.classList.remove('is-on');
    front.alt = '';
    clearTimeout(waiting);
    frameEl.classList.remove('is-loading', 'is-waiting');
    // The caption changes with the photo, so the two always match
    caption.textContent = p.caption;
    count.textContent = `${at + 1} / ${photos.length}`;
    if (byHand) live.textContent = `${p.caption}. ${p.alt}`;
  };
  back.decode().then(swap, swap);
  // A slow connection: if the next photo isn't here in a moment, say so over the current one
  clearTimeout(waiting);
  waiting = setTimeout(() => { if (ticket === asked) frameEl.classList.add('is-waiting'); }, 200);
  for (const b of blocks) if (b.ids.length) b.setAttribute('aria-pressed', String(b.ids.includes(p.id)));
  new Image().src = `/img/clock/${photos[(at + 1) % photos.length].id}.webp`; // ready for next time
  restart();
}

function restart() {
  clearTimeout(timer);
  if (playing && !held) timer = setTimeout(() => {
    // Wait while the Off the Clock tab isn't the one showing, or the page is in the background
    if (carousel.offsetParent && !document.hidden) go(at + 1); else restart();
  }, STEP);
}

for (const [on, off] of [['pointerenter', 'pointerleave'], ['focusin', 'focusout']]) {
  carousel.addEventListener(on, () => { held = true; restart(); });
  carousel.addEventListener(off, () => { held = false; restart(); });
}
document.addEventListener('visibilitychange', restart);

for (const b of blocks) {
  if (!b.ids.length) continue;
  b.addEventListener('click', () => {
    // Its first photo, or the next of its photos if one is already showing
    const i = b.ids.indexOf(photos[at].id);
    go(photos.findIndex((p) => p.id === b.ids[(i + 1) % b.ids.length]), true);
    // On a phone the carousel sits above the blocks: bring it into view
    const r = carousel.getBoundingClientRect();
    if (r.top < 0 || r.bottom > innerHeight) carousel.scrollIntoView({ behavior: still.matches ? 'auto' : 'smooth', block: 'center' });
  });
}

drawPlay();
// Load the first photo as soon as the Off the Clock section opens (any of its tabs), so it's
// there the moment Hobbies is: never an empty frame. Workshop visitors don't download photos.
function startPhotos() {
  if (layers.some((l) => l.src)) return;
  layers.forEach((l, n) => { l.fetchPriority = n ? 'auto' : 'high'; l.loading = 'eager'; });
  go(0);
}

// ---------- The two pages ----------
// Each sits under a big outlined title that fades as you scroll. Workshop: the production-ready
// projects, then two boxes that open the projects still on the workbench and the Toolkit. Off the
// Clock: about me, how it got here, the numbers, then Hobbies & Interests. The top bar's Workshop
// and Off the Clock links say which page is open.

const SECTIONS = {
  work: { title: 'Workshop', views: ['workshop', 'workbench', 'toolkit'] },
  clock: { title: 'Off the Clock', views: ['about', 'hobbies'] },
};
// Links from before (and the Off the Clock link); the old tabs go to the box or part they became
const OLD = { work: 'workshop', polished: 'workshop', rough: 'workbench', 'off-the-clock': 'about', story: 'about' };
const sectionOf = (view) => Object.keys(SECTIONS).find((k) => SECTIONS[k].views.includes(view));

function viewFromHash() {
  const id = decodeURIComponent(location.hash.slice(1));
  const name = OLD[id] ?? id;
  // An old link (#polished, #rough...) shows the new address too
  if (OLD[id] && sectionOf(name)) history.replaceState(null, '', `#${name}`);
  return sectionOf(name) ? name : 'workshop';
}

let shownSection = null;
function show(name, { scroll = false } = {}) {
  const section = sectionOf(name);
  const work = section === 'work';
  const changed = section !== shownSection;
  $('#view-polished').hidden = !work;
  $('#view-about').hidden = work;
  document.documentElement.classList.toggle('on-workshop', work);
  document.documentElement.classList.toggle('on-clock', !work);
  document.title = `${SECTIONS[section].title} · Off the Wall`;
  $('#section-title').textContent = SECTIONS[section].title;
  markNav(section);
  shownSection = section;
  if (!work) { startPhotos(); revealAbout(); }
  // A link to a box opens it and goes there; a link to Hobbies goes to it
  if (boxes[name]) { boxes[name].set(true); jumpTo(boxes[name].btn, scroll); }
  else if (name === 'hobbies') jumpTo($('#hobbies-title'), scroll);
  else if (scroll || changed) window.scrollTo({ top: 0 });
  fadeTitle();
  countView(name);
}

// The boxes on the Workshop page (the workbench and the Toolkit): each opens and closes its panel
const boxes = Object.fromEntries(['workbench', 'toolkit'].map((id) => {
  const btn = $(`[aria-controls="${id}"]`), panel = $(`#${id}`);
  const set = (open) => { btn.setAttribute('aria-expanded', String(open)); panel.hidden = !open; };
  btn.addEventListener('click', () => {
    const open = btn.getAttribute('aria-expanded') !== 'true';
    set(open);
    history.replaceState(null, '', open ? `#${id}` : location.pathname);
  });
  return [id, { btn, set }];
}));

// Go to a group. On a fresh load the fonts and screenshots arrive afterwards and push the group
// down, so go there again once they have, unless the visitor has scrolled in the meantime.
function jumpTo(el, smooth) {
  const go = (behavior) => el.scrollIntoView({ behavior, block: 'start' });
  requestAnimationFrame(() => go(smooth && !still.matches ? 'smooth' : 'auto'));
  if (smooth) return;
  let moved = false;
  const stop = () => { moved = true; };
  for (const ev of ['wheel', 'touchstart', 'keydown']) addEventListener(ev, stop, { once: true, passive: true });
  const again = () => { if (!moved) go('auto'); };
  document.fonts?.ready.then(again);
  if (document.readyState === 'complete') setTimeout(again, 0); else addEventListener('load', again, { once: true });
}

// The page's big title fades a little more as you scroll down past it (it already dissolves toward
// its bottom edge). One update per frame at most; none with reduced motion.
const marks = [...document.querySelectorAll('.watermark')];
let fadeQueued = 0;
function fadeTitle() {
  if (still.matches || fadeQueued) return;
  fadeQueued = requestAnimationFrame(() => {
    fadeQueued = 0;
    const height = Math.max(...marks.map((m) => m.getBoundingClientRect().height)) || 150;
    const gone = Math.min(1, Math.max(0, window.scrollY / (height * 2)));
    for (const m of marks) m.style.opacity = (1 - gone * 0.85).toFixed(3);
  });
}
addEventListener('scroll', fadeTitle, { passive: true });

// Each tab counts as its own page in the visit counter (/home/#rough and so on). The counter
// script loads in the background, so the first count waits for it.
function countView(name) {
  const send = () => window.goatcounter?.count?.({ path: `/home/#${name}`, title: document.title });
  if (window.goatcounter?.count) send();
  else window.addEventListener('load', () => setTimeout(send, 0), { once: true });
}

// Switching between Workshop and Off the Clock slides sideways (js/slide.js): Workshop sits left of
// Off the Clock. A link within the same page (a box, Hobbies) just goes there.
const STACK = { work: 0, clock: 1 };
window.addEventListener('hashchange', () => {
  const next = viewFromHash();
  const to = sectionOf(next);
  if (shownSection && to !== shownSection && window.otwSlide) window.otwSlide(STACK[shownSection], STACK[to], () => show(next));
  else show(next, { scroll: true });
});
show(viewFromHash());

setUpPage();
