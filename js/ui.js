// Shared by every page: the element builder, the color-mode and board-cursor
// buttons in the header, the footer strip, and the bits of a project that show
// up on both the home page and its own page.
import { contact, projects } from './projects.js';

export const $ = (sel, root = document) => root.querySelector(sel);

// A tiny element builder: h('a', { href }, 'text', child, ...)
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style') el.style.cssText = v;
    else el.setAttribute(k, v);
  }
  el.append(...children.flat().filter((c) => c != null && c !== false));
  return el;
}

const store = {
  get(key) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch { /* private mode: fine */ } },
};
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

export const projectHref = (p) => `/projects/${p.slug}/`;

// ---------- Accent colors ----------

// Dark or white text, whichever reads better on the accent
function inkOn(hex) {
  const n = parseInt(hex.slice(1), 16);
  const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const lum = 0.2126 * lin(n >> 16) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  return lum > 0.18 ? '#141311' : '#ffffff';
}
export const accentStyle = (p) => `--accent:${p.accent};--accent-ink:${inkOn(p.accent)}`;

// ---------- Bits of a project ----------

export const iconTile = (p) => h('span', { class: 'icon-tile', 'aria-hidden': 'true' }, p.icon);
const STATUS = { live: 'Live', rough: 'Rough edges', workshop: 'In the workshop' };
export const statusPill = (p) => h('span', { class: `status is-${p.status}` }, STATUS[p.status]);

// The home page tab a project is listed on
const TAB = { live: 'polished', rough: 'rough', workshop: 'workshop' };
export const tabHref = (p) => `/home/#${TAB[p.status] ?? 'polished'}`;

// Open App / Learn More / See the Code. Workshop projects get "Coming soon" and
// "Follow along" instead of links that go nowhere; follow: false hides "Follow along".
export function actions(p, { learnMore = true } = {}) {
  return h('div', { class: 'project-actions' },
    p.url
      ? h('a', { class: 'button primary small', href: p.url }, 'Open App ', h('span', { 'aria-hidden': 'true' }, '↗'))
      : h('span', { class: 'button small is-soon', 'aria-disabled': 'true' }, 'Coming soon'),
    learnMore ? h('a', { class: 'button small', href: projectHref(p) }, 'Learn More', h('span', { class: 'sr' }, ` about ${p.name}`)) : null,
    p.code
      ? h('a', { class: 'button small ghost', href: p.code }, 'See the Code')
      : p.follow === false ? null
        : h('a', { class: 'button small ghost', href: contact.github, title: 'The code goes up on GitHub when it’s ready' }, 'Follow along ', h('span', { 'aria-hidden': 'true' }, '↗')));
}

// A screenshot in a little browser window, or a drawing for work in progress
export function preview(p, { link = true } = {}) {
  const bar = h('div', { class: 'frame-bar', 'aria-hidden': 'true' },
    h('span', { class: 'frame-dots' }, h('i'), h('i'), h('i')),
    h('span', { class: 'frame-url' }, p.url ? `offthewall.dev${p.url.split('?')[0]}` : 'coming soon'));
  const body = p.image
    ? h('img', { src: p.image, alt: `The ${p.name} cover page`, width: '1280', height: '800', loading: 'lazy', decoding: 'async' })
    : placeholder(p.art);
  const frame = h('div', { class: 'frame' }, bar, body);
  return link && p.url ? h('a', { class: 'frame-link', href: p.url, tabindex: '-1', 'aria-hidden': 'true' }, frame) : h('div', { class: 'frame-link' }, frame);
}

// Line drawings in the project's color.
// (Fixed strings written here, never visitor input, so innerHTML is safe.)
const ART = {
  chart: `<path class="a-line" d="M30 150 L80 118 L120 130 L170 82 L210 96 L270 44"/>
    <g class="a-fill">${[[40, 70], [80, 95], [120, 80], [160, 120], [200, 105], [240, 140]].map(([x, hgt]) => `<rect x="${x - 14}" y="${170 - hgt}" width="28" height="${hgt}" rx="4"/>`).join('')}</g>`,
  trivia: `<rect class="a-fill" x="70" y="18" width="160" height="62" rx="12"/>
    <text class="a-q" x="150" y="62" text-anchor="middle">?</text>
    ${[0, 1, 2, 3].map((i) => `<rect class="${i === 2 ? 'a-solid' : 'a-line'}" x="${i % 2 ? 158 : 50}" y="${96 + Math.floor(i / 2) * 38}" width="92" height="28" rx="14"/>`).join('')}`,
  snowboard: `<path class="a-line" d="M10 168 C90 140 170 120 290 70"/>
    <g transform="rotate(-18 150 100)">
      <rect class="a-fill" x="40" y="84" width="220" height="40" rx="20"/>
      <rect class="a-solid" x="98" y="90" width="22" height="28" rx="5"/>
      <rect class="a-solid" x="180" y="90" width="22" height="28" rx="5"/>
    </g>
    <circle class="a-dot" cx="60" cy="40" r="3"/><circle class="a-dot" cx="230" cy="150" r="3"/><circle class="a-dot" cx="250" cy="30" r="2"/>`,
  wedding: `<circle class="a-ring" cx="125" cy="98" r="44"/><circle class="a-ring" cx="175" cy="98" r="44"/>
    <path class="a-solid" d="M150 30 l9 -9 a6 6 0 0 1 9 9 l-18 18 l-18 -18 a6 6 0 0 1 9 -9 z"/>`,
  // A dive: the surface, a path down past depth marks, and something rare at the bottom
  dive: `<path class="a-line" d="M20 34 q20 -12 40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0"/>
    <path class="a-line" d="M92 52 C120 90 100 120 150 150" stroke-dasharray="2 12"/>
    ${[70, 110, 150].map((y) => `<path class="a-line" d="M240 ${y}h26"/>`).join('')}
    <circle class="a-fill" cx="92" cy="52" r="11"/>
    <path class="a-solid" d="M150 138 l14 12 l-14 12 l-14 -12z"/>
    <circle class="a-dot" cx="196" cy="96" r="3"/><circle class="a-dot" cx="60" cy="128" r="2.5"/><circle class="a-dot" cx="212" cy="160" r="2"/>`,
  // A step grid: four rows of eight steps, a few switched on, and the playhead
  steps: `${[0, 1, 2, 3].flatMap((r) => [0, 1, 2, 3, 4, 5, 6, 7].map((c) => {
    const on = [[0, 0], [0, 4], [1, 2], [1, 6], [2, 0], [2, 3], [2, 5], [3, 7]].some(([a, b]) => a === r && b === c);
    return `<rect class="${on ? 'a-solid' : 'a-line'}" x="${44 + c * 28}" y="${30 + r * 34}" width="20" height="24" rx="5"${on ? '' : ' style="stroke-width:2.5"'}/>`;
  })).join('')}
    <path class="a-line" d="M124 18v150"/>`,
};

function placeholder(art = 'chart') {
  const box = h('div', { class: 'frame-placeholder', 'aria-hidden': 'true' });
  box.innerHTML = `<svg viewBox="0 0 300 190" class="ph-art">${ART[art] ?? ART.chart}</svg>`;
  box.append(h('span', { class: 'ph-label' }, 'Under construction'));
  return box;
}

// ---------- Card hover: a spotlight that follows the pointer ----------
// Only with a mouse; the glow and lift are CSS.

export function spotlight(cards) {
  if (!matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  for (const c of cards) {
    c.addEventListener('pointermove', (e) => {
      const r = c.getBoundingClientRect();
      c.style.setProperty('--mx', `${e.clientX - r.left}px`);
      c.style.setProperty('--my', `${e.clientY - r.top}px`);
    });
  }
}

// ---------- Color mode: one button, Dark → Light → Blueprint → Dark ----------
// Dark is the default; the choice is remembered on this device. The <head> of
// each page applies the saved mode before anything draws.

const THEMES = [
  { name: 'dark', label: 'Dark', color: '#121110' },
  { name: 'light', label: 'Light', color: '#f3efe6' },
  { name: 'blueprint', label: 'Blueprint', color: '#123f7a' },
];

function themeButton() {
  const btn = $('.theme-toggle');
  if (!btn) return;
  const show = (name) => {
    const t = THEMES.find((x) => x.name === name) ?? THEMES[0];
    document.documentElement.dataset.theme = t.name;
    document.querySelector('meta[name="theme-color"]').content = t.color;
    $('.ti', btn).className = `ti ti-${t.name}`;
    $('.sr', btn).textContent = `Color mode: ${t.label}. Switch to ${THEMES[(THEMES.indexOf(t) + 1) % THEMES.length].label}`;
    btn.title = `Color mode: ${t.label}`;
  };
  btn.addEventListener('click', () => {
    const i = THEMES.findIndex((x) => x.name === document.documentElement.dataset.theme);
    const next = THEMES[(i + 1) % THEMES.length].name;
    show(next);
    store.set('otw-theme', next);
  });
  show(document.documentElement.dataset.theme);
}

// ---------- Board cursor ----------
// Opt-in, mouse only. The board (with its rider) becomes the cursor: centered
// on the pointer, moved straight there on every mousemove, and the page's own
// cursor is hidden while it shows. It leans a little with sideways movement,
// except with reduced motion. Using the keyboard brings the normal cursor back
// until the mouse moves again. Not offered on touch screens.

const BOARDS = [
  { name: 'off', label: 'Off' },
  { name: 'skate', label: 'Skate' },
  { name: 'snow', label: 'Snow' },
  { name: 'surf', label: 'Surf' },
];
// Fixed strings, so innerHTML is safe
const BOARD_SVG = {
  off: '<svg viewBox="0 0 48 18"><rect x="2" y="4" width="44" height="10" rx="5" class="b-ghost"/><path d="M9 17L39 1" class="b-slash"/></svg>',
  skate: '<svg viewBox="0 0 48 18"><rect x="2" y="3" width="44" height="6" rx="3" class="b-deck"/><circle cx="12" cy="13" r="3" class="b-part"/><circle cx="36" cy="13" r="3" class="b-part"/></svg>',
  snow: '<svg viewBox="0 0 48 18"><rect x="1" y="4" width="46" height="10" rx="5" class="b-deck"/><rect x="14" y="5.5" width="4" height="7" rx="1" class="b-part"/><rect x="30" y="5.5" width="4" height="7" rx="1" class="b-part"/></svg>',
  surf: '<svg viewBox="0 0 48 18"><path d="M2 9C11 2 33 1.5 46 9 33 16.5 11 16 2 9z" class="b-deck"/><path d="M6 9h36" class="b-line"/><path d="M8 9l-3 5h4z" class="b-part"/></svg>',
};
// A little rider standing on the board, knees bent and arms out for balance,
// dressed for the board. Every rider has the same pose: these are its limbs.
const SKIN = '#e2a77f';
const LEGS = 'M23 -7L17.5 -3L15.5 2.5M23 -7L29 -2.5L32 2.5';
const THIGHS = 'M23 -7L17.5 -3M23 -7L29 -2.5';
const ARMS = 'M24.2 -14.5L18 -15.5L13.5 -13M24.2 -14.5L30.5 -12.5L35 -15.5';
const SLEEVES = 'M24.2 -14.5L20.5 -15.1M24.2 -14.5L27.8 -13.6';
const TORSO = 'M24.6 -16L23.2 -7.5';
const limb = (d, color, width) => `<path class="l" d="${d}" stroke="${color}" stroke-width="${width}"/>`;
const head = `<circle cx="25" cy="-20" r="3.3" fill="${SKIN}"/>`;
const RIDERS = {
  // T-shirt, shorts, sneakers and a backwards cap
  skate: limb(LEGS, SKIN, 2.4) + limb(THIGHS, '#c8a86b', 4.2)
    + '<rect x="12.6" y="1.4" width="5.6" height="2.4" rx="1.2" fill="#f4f4f4" stroke="#222" stroke-width=".6"/><rect x="29.6" y="1.4" width="5.6" height="2.4" rx="1.2" fill="#f4f4f4" stroke="#222" stroke-width=".6"/>'
    + limb(ARMS, SKIN, 2.2) + limb(SLEEVES, '#2f80ed', 3.2) + limb(TORSO, '#2f80ed', 5.5) + head
    + '<path d="M21.7 -20.6a3.4 3.4 0 0 1 6.7 0z" fill="#e5484d"/>' + limb('M22 -20.9L18.6 -20.1', '#e5484d', 1.4),
  // Puffy jacket, snow pants, boots, gloves, beanie and goggles
  snow: limb(LEGS, '#6b7a99', 3.8)
    + '<rect x="13" y="0.6" width="5" height="3" rx="1" fill="#2a2a2a"/><rect x="29.6" y="0.6" width="5" height="3" rx="1" fill="#2a2a2a"/>'
    + limb(ARMS, '#14a39a', 3.4) + limb(TORSO, '#14a39a', 6.5) + limb('M24.4 -15.2L23.4 -8.6', '#0d6e67', 0.7)
    + '<circle cx="13.3" cy="-12.9" r="1.6" fill="#ffd23f"/><circle cx="35.2" cy="-15.6" r="1.6" fill="#ffd23f"/>' + head
    + '<path d="M21.6 -20.3a3.4 3.4 0 0 1 6.8 0z" fill="#ffd23f"/><circle cx="25" cy="-24.2" r="1.2" fill="#ffd23f"/>'
    + '<rect x="21.6" y="-20.6" width="6.8" height="2.3" rx="1.1" fill="#7dd3fc" stroke="#222" stroke-width=".6"/>',
  // Rash guard, board shorts, bare feet and sun-bleached hair
  surf: limb(LEGS, SKIN, 2.4) + limb(THIGHS, '#ef6f8c', 4.6)
    + limb(ARMS, SKIN, 2.2) + limb(SLEEVES, '#38b6ff', 3.2) + limb(TORSO, '#38b6ff', 5.5) + head
    + '<path d="M21.6 -20.6c.2-3 2.4-4.3 4.6-3.9 1.7.3 2.7 1.4 2.9 2.9l-1.4-.8-1 .9-1.1-1-1.3 1-1.3-.8z" fill="#d9a441"/>',
};
// The cursor version: the same board with its rider on top
const withRider = (name) => BOARD_SVG[name]
  .replace('viewBox="0 0 48 18">', 'viewBox="0 -26 48 44">')
  .replace('</svg>', `<g class="b-rider">${RIDERS[name]}</g></svg>`);

function boardCursor() {
  const btn = $('.board-toggle');
  if (!btn) return;
  const mouse = matchMedia('(hover: hover) and (pointer: fine)');
  // Mouse only. With reduced motion the board still works, it just doesn't lean
  const allowed = () => mouse.matches;

  const board = h('div', { class: 'board-cursor', 'aria-hidden': 'true' });
  const root = document.documentElement;
  let current = 'off';
  let last = null; // the previous pointer position, for the lean
  let level = 0; // a timer that levels the board out once the pointer stops

  // Straight to the pointer on every move, no easing; CSS puts the board's center on the hotspot
  function onMove(e) {
    if (e.pointerType && e.pointerType !== 'mouse') { hide(); return; }
    const tilt = reducedMotion.matches || !last ? 0 : Math.max(-20, Math.min(20, (e.clientX - last.x) * 1.6));
    last = { x: e.clientX, y: e.clientY };
    board.style.transform = `translate3d(${e.clientX}px, ${e.clientY}px, 0) rotate(${tilt.toFixed(1)}deg)`;
    board.classList.add('is-on');
    root.classList.add('board-on');
    clearTimeout(level);
    const { x, y } = last;
    if (tilt) level = setTimeout(() => { board.style.transform = `translate3d(${x}px, ${y}px, 0)`; }, 90);
  }
  // Back to the normal cursor: when the pointer leaves the page, and as soon as someone uses the keyboard
  function hide() { clearTimeout(level); board.classList.remove('is-on'); root.classList.remove('board-on'); last = null; }

  function set(name, save = true) {
    current = allowed() ? name : 'off';
    const b = BOARDS.find((x) => x.name === current);
    const next = BOARDS[(BOARDS.indexOf(b) + 1) % BOARDS.length];
    btn.dataset.board = current;
    $('.sr', btn).textContent = `Board cursor: ${b.label}. Switch to ${next.label}`;
    btn.title = `Board cursor: ${b.label}`;
    $('.board-icon', btn).innerHTML = BOARD_SVG[current];
    if (save) store.set('otw-board', current);
    if (current === 'off') {
      document.removeEventListener('pointermove', onMove);
      root.removeEventListener('pointerleave', hide);
      document.removeEventListener('keydown', hide);
      clearTimeout(level);
      hide();
      board.remove();
      return;
    }
    board.innerHTML = withRider(current);
    if (!board.isConnected) document.body.append(board);
    document.addEventListener('pointermove', onMove, { passive: true });
    root.addEventListener('pointerleave', hide);
    document.addEventListener('keydown', hide);
  }

  btn.addEventListener('click', () => {
    const i = BOARDS.findIndex((x) => x.name === current);
    set(BOARDS[(i + 1) % BOARDS.length].name);
  });
  const sync = () => {
    btn.hidden = !allowed();
    set(allowed() ? store.get('otw-board') ?? 'off' : 'off', false);
  };
  mouse.addEventListener?.('change', sync);
  reducedMotion.addEventListener?.('change', sync);
  sync();
}

// ---------- One sliding indicator for a row of choices ----------
// The indicator is a 1px element scaled to cover (or underline) the chosen item, so it only ever
// moves with transforms. 'bar' underlines (tabs); 'block' fills behind (the cover's buttons).

export function slider(box, { mode = 'bar' } = {}) {
  const ind = box.querySelector(':scope > .slide-ind') ?? box.appendChild(h(box.tagName === 'UL' ? 'li' : 'span', { class: 'slide-ind', 'aria-hidden': 'true', role: 'presentation' }));
  let target = null;
  function place(el, { instant = false } = {}) {
    target = el;
    if (!el || !el.offsetWidth) { ind.style.opacity = '0'; return; }
    const x = el.offsetLeft, y = el.offsetTop, w = el.offsetWidth, ht = el.offsetHeight;
    if (instant || reducedMotion.matches) { ind.style.transition = 'none'; requestAnimationFrame(() => { ind.style.transition = ''; }); }
    ind.style.transform = mode === 'bar'
      ? `translate(${x}px, ${y + ht - 3}px) scaleX(${w})`
      : `translate(${x}px, ${y}px) scale(${w}, ${ht})`;
    ind.style.opacity = '1';
  }
  new ResizeObserver(() => place(target, { instant: true })).observe(box);
  return { place, get target() { return target; } };
}

// ---------- Phones: the top bar folds into a menu ----------
// The brand mark and a menu button; the button opens the same links and toggles as rows. It
// closes on a choice, a tap outside, or Escape, and focus goes back to the button. Without
// JavaScript the links simply wrap, so nothing is ever out of reach.

function siteMenu() {
  const header = $('.nav');
  const btn = $('.menu-toggle', header ?? undefined);
  const menu = $('.site-menu', header ?? undefined);
  if (!header || !btn || !menu) return;
  header.classList.add('has-menu');
  btn.hidden = false;
  const open = () => header.classList.contains('is-open');
  function set(on, { focus = true } = {}) {
    header.classList.toggle('is-open', on);
    btn.setAttribute('aria-expanded', String(on));
    $('.sr', btn).textContent = on ? 'Close menu' : 'Menu';
    if (!on && focus) btn.focus();
  }
  btn.addEventListener('click', () => set(!open()));
  menu.addEventListener('click', (e) => { if (e.target.closest('a') && open()) set(false); });
  // On the click (not pointerdown), so the browser's own focus change for the tap happens first
  document.addEventListener('click', (e) => { if (open() && !header.contains(e.target)) set(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && open()) set(false); });
  // Wider than a phone again: close it quietly
  matchMedia('(min-width: 761px)').addEventListener?.('change', (m) => { if (m.matches && open()) set(false, { focus: false }); });
}

// Which top-bar link is the page you're on (the home page marks its own section, in js/main.js)
export function markNav(section) {
  for (const a of document.querySelectorAll('.site-menu a')) {
    const here = section ? a.dataset.section === section : !a.dataset.section && a.pathname === location.pathname && a.pathname !== '/';
    if (here) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  }
}

// ---------- Footer strip ----------

function stealStrip() {
  const slot = $('.steal');
  if (!slot) return;
  const tinkering = projects.filter((p) => p.status === 'workshop');
  // The About page ends on the "Currently tinkering with" line alone: no callout, no buttons
  const plain = Boolean($('main.about'));
  if (plain) {
    slot.classList.add('is-plain');
    slot.removeAttribute('aria-labelledby');
  }
  slot.replaceChildren(...[
    plain ? null : h('div', { class: 'steal-main' },
      h('h2', { id: 'steal-title' }, 'Steal this idea'),
      h('p', {}, 'Found a bug or got an idea?'),
      h('div', { class: 'steal-actions' },
        contact.email ? h('a', { class: 'button small', href: `mailto:${contact.email}` }, 'Email me') : null,
        h('a', { class: 'button small', href: contact.issues }, 'Open an issue ', h('span', { 'aria-hidden': 'true' }, '↗')),
        h('a', { class: 'button small ghost', href: contact.github, rel: 'me' }, 'GitHub ', h('span', { 'aria-hidden': 'true' }, '↗')))),
    tinkering.length ? h('p', { class: 'tinkering' },
      h('span', { class: 'tinkering-label' }, 'Currently tinkering with:'), ' ',
      tinkering.flatMap((p, i) => [
        i ? (i === tinkering.length - 1 ? ' and ' : ', ') : null,
        h('a', { href: projectHref(p), style: accentStyle(p) }, p.name),
      ])) : null].filter(Boolean)); // replaceChildren would print a null as text
}

// ---------- Everything every page needs ----------

export function setUpPage() {
  themeButton();
  boardCursor();
  siteMenu();
  if (!document.querySelector('.tabs')) markNav();
  stealStrip();
  $('.year').textContent = new Date().getFullYear();

  // Fade things in as they scroll into view
  if ('IntersectionObserver' in window && !reducedMotion.matches) {
    const seen = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          e.target.classList.add('is-in');
          seen.unobserve(e.target);
        }
      }
    }, { rootMargin: '0px 0px -8% 0px' });
    // Only what's on the page now: a card in a hidden tab shows at full strength when its tab opens
    for (const el of document.querySelectorAll('.project, .detail-section')) {
      if (el.closest('[hidden]')) continue;
      el.classList.add('reveal');
      seen.observe(el);
    }
  }
}
