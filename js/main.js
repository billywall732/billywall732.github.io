// The home page at /home/: four tabs built from js/projects.js, each shown as
// its own page. The address picks the tab (#polished, #rough, #workshop,
// #off-the-clock), so every tab can be linked to and the back button works.
import { clockPhotos, hobbies, projects } from './projects.js';
import { $, accentStyle, actions, h, iconTile, preview, projectHref, setUpPage, spotlight, statusPill } from './ui.js';

const byStatus = (s) => projects.filter((p) => p.status === s);

// ---------- Polished and rough projects: big cards ----------

function card(p, wide) {
  return h('article', { class: `project${wide ? ' featured' : ''}`, style: accentStyle(p) },
    h('span', { class: 'spot', 'aria-hidden': 'true' }),
    preview(p),
    h('div', { class: 'project-body' },
      h('div', { class: 'project-meta' },
        iconTile(p),
        h('span', { class: 'kicker' }, p.kicker),
        statusPill(p)),
      h('h2', {}, h('a', { href: projectHref(p) }, p.name)),
      h('p', { class: 'blurb' }, p.blurb),
      h('ul', { class: 'highlights' }, p.highlights.map((x) => h('li', {}, x))),
      h('ul', { class: 'tags', 'aria-label': 'Built with' }, p.tags.map((t) => h('li', {}, t))),
      actions(p)));
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

// ---------- In the workshop: a compact list ----------

const workshop = byStatus('workshop');
$('.workshop-list').replaceChildren(...(workshop.length ? workshop.map((p) => h('li', { style: accentStyle(p) },
  h('a', { class: 'workshop-item', href: projectHref(p) },
    iconTile(p),
    h('span', { class: 'workshop-text' },
      h('strong', {}, p.name),
      h('span', { class: 'workshop-line' }, p.tagline)),
    h('span', { class: 'workshop-status' }, p.statusNote),
    h('span', { class: 'workshop-more' }, 'Learn more ', h('span', { 'aria-hidden': 'true' }, '→'))))) : [empty('The bench is clear.')]));

// ---------- Off the clock: proudly mediocre at ----------

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
  h('div', { class: 'carousel-frame' }, ...layers),
  h('figcaption', { class: 'carousel-bar' },
    caption,
    h('span', { class: 'carousel-controls' },
      button('is-prev', 'Previous photo', '←', () => go(at - 1, true)),
      count,
      playBtn,
      button('is-next', 'Next photo', '→', () => go(at + 1, true)))),
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

function go(i, byHand = false) {
  at = (i + photos.length) % photos.length;
  const p = photos[at];
  const [front, back] = layers[0].classList.contains('is-on') ? layers : [layers[1], layers[0]];
  back.src = `/img/clock/${p.id}.webp`;
  back.alt = p.alt;
  const swap = () => {
    back.classList.add('is-on');
    front.classList.remove('is-on');
    front.alt = '';
  };
  back.decode().then(swap, swap);
  caption.textContent = p.caption;
  count.textContent = `${at + 1} / ${photos.length}`;
  if (byHand) live.textContent = `${p.caption}. ${p.alt}`;
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
// Start the first time it's on screen, so other tabs don't download photos
new IntersectionObserver((entries, seen) => {
  if (!entries.some((e) => e.isIntersecting)) return;
  seen.disconnect();
  if (!layers.some((l) => l.src)) go(0);
}).observe(carousel);

// ---------- Tabs ----------

const tabs = [...document.querySelectorAll('.tablist a')];
for (const t of tabs) {
  const count = $('.tab-count', t);
  const n = { polished: 'live', rough: 'rough', workshop: 'workshop' }[t.dataset.view];
  if (count && n) count.textContent = byStatus(n).length;
}
const OLD = { work: 'polished' }; // links from before the tabs

function viewFromHash() {
  const id = decodeURIComponent(location.hash.slice(1));
  const name = OLD[id] ?? id;
  return tabs.some((t) => t.dataset.view === name) ? name : 'polished';
}

function show(name, { scroll = false } = {}) {
  for (const t of tabs) {
    const on = t.dataset.view === name;
    if (on) t.setAttribute('aria-current', 'page'); else t.removeAttribute('aria-current');
    const view = $(`#view-${t.dataset.view}`);
    view.hidden = !on;
    if (on) {
      document.title = `${$('h1', view).textContent} · Off the Wall`;
      // On a phone the row scrolls sideways: center the open tab in it
      const row = t.closest('.tablist');
      const [a, b] = [t.getBoundingClientRect(), row.getBoundingClientRect()];
      row.scrollLeft += a.left + a.width / 2 - (b.left + b.width / 2);
    }
  }
  // If the visitor had scrolled down, bring the new page's top into view under the tabs
  const nav = $('.tabs');
  if (scroll && window.scrollY > nav.offsetTop) window.scrollTo({ top: nav.offsetTop });
}

window.addEventListener('hashchange', () => show(viewFromHash(), { scroll: true }));
show(viewFromHash());

setUpPage();
