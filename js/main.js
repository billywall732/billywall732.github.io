// Builds the page from js/projects.js, plus the theme switch, the live
// conditions card and the fade-in as cards scroll into view.
import { hobbies, projects } from './projects.js';

const $ = (sel) => document.querySelector(sel);

// A tiny element builder: h('a', { href }, 'text', child, ...)
function h(tag, attrs = {}, ...children) {
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

// ---------- Projects ----------

// A screenshot in a little browser window, or a placeholder for work in progress
function preview(p) {
  const bar = h('div', { class: 'frame-bar', 'aria-hidden': 'true' },
    h('span', { class: 'frame-dots' }, h('i'), h('i'), h('i')),
    h('span', { class: 'frame-url' }, p.url ? `billywall732.github.io${p.url}` : 'coming soon'));
  const body = p.image
    ? h('img', { src: p.image, alt: `The ${p.name} cover page`, width: '1280', height: '800', loading: 'lazy', decoding: 'async' })
    : placeholder(p.art);
  const frame = h('div', { class: 'frame' }, bar, body);
  return p.url ? h('a', { class: 'frame-link', href: p.url, tabindex: '-1', 'aria-hidden': 'true' }, frame) : frame;
}

// Line drawings for projects that are still being built, in the card's color.
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
};

function placeholder(art = 'chart') {
  const box = h('div', { class: 'frame-placeholder', 'aria-hidden': 'true' });
  box.innerHTML = `<svg viewBox="0 0 300 190" class="ph-art">${ART[art] ?? ART.chart}</svg>`;
  box.append(h('span', { class: 'ph-label' }, 'Under construction'));
  return box;
}

function card(p, i) {
  const live = p.status === 'live';
  return h('article', { class: `project${i === 0 ? ' featured' : ''}`, style: `--accent:${p.accent}` },
    preview(p),
    h('div', { class: 'project-body' },
      h('div', { class: 'project-meta' },
        h('span', { class: 'kicker' }, p.kicker),
        h('span', { class: `status ${live ? 'is-live' : 'is-workshop'}` }, live ? 'Live' : 'In the workshop')),
      h('h3', {}, p.url ? h('a', { href: p.url }, p.name) : p.name),
      h('p', { class: 'blurb' }, p.blurb),
      h('ul', { class: 'highlights' }, p.highlights.map((x) => h('li', {}, x))),
      h('ul', { class: 'tags', 'aria-label': 'Built with' }, p.tags.map((t) => h('li', {}, t))),
      h('div', { class: 'project-actions' },
        p.url ? h('a', { class: 'button primary small', href: p.url }, 'Open app ', h('span', { 'aria-hidden': 'true' }, '↗')) : null,
        p.code ? h('a', { class: 'button small', href: p.code }, 'Code') : null,
        !p.url && !p.code ? h('span', { class: 'soon' }, 'Coming soon') : null)));
}

$('.projects').replaceChildren(...projects.map(card));
$('.count').textContent = String(projects.length).padStart(2, '0');

const building = projects.filter((p) => p.status === 'workshop').map((p) => p.name);
$('.bench-text').textContent = building.length
  ? `${building.join(', ')}, plus trail conditions for the Snow and Surf Report.`
  : 'Trail conditions for the Snow and Surf Report.';

$('.hobbies').replaceChildren(...hobbies.map(([icon, name], i) =>
  h('li', { style: `--tilt:${[-3, 2, -1.5, 3, -2.5, 1.5, -1][i % 7]}deg` }, h('span', { 'aria-hidden': 'true' }, icon), name)));

$('.year').textContent = new Date().getFullYear();

// ---------- Dark / light / blueprint ----------
// Dark is the default; your choice is remembered on this device.

const THEME_COLORS = { dark: '#121110', light: '#f3efe6', blueprint: '#123f7a' };
function setTheme(name) {
  document.documentElement.dataset.theme = name;
  document.querySelector('meta[name="theme-color"]').content = THEME_COLORS[name];
  for (const b of document.querySelectorAll('.theme-switch button')) b.setAttribute('aria-pressed', String(b.dataset.theme === name));
}
for (const b of document.querySelectorAll('.theme-switch button')) {
  b.addEventListener('click', () => {
    setTheme(b.dataset.theme);
    try { localStorage.setItem('otw-theme', b.dataset.theme); } catch { /* private mode: fine */ }
  });
}
setTheme(document.documentElement.dataset.theme);

// ---------- Fade cards in as they scroll into view ----------

if ('IntersectionObserver' in window && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const seen = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) {
        e.target.classList.add('is-in');
        seen.unobserve(e.target);
      }
    }
  }, { rootMargin: '0px 0px -8% 0px' });
  for (const el of document.querySelectorAll('.project, .clock, .contact')) {
    el.classList.add('reveal');
    seen.observe(el);
  }
}

// ---------- Conditions desk: today's best bets from the Snow and Surf Report ----------
// Same site, so it's just a file read. Loaded after the page is up (it's ~500 KB);
// if it can't load, the card stays hidden.

async function conditions() {
  const res = await fetch('/snow-surf-report/data/report.json');
  if (!res.ok) return;
  const report = await res.json();
  const rows = [['snow', '⛰', 'Snow'], ['surf', '🌊', 'Surf']]
    .map(([key, icon, label]) => [report.sections?.[key]?.bestBet, icon, label, key])
    .filter(([bet]) => bet?.name);
  if (!rows.length) return;
  $('.desk-list').replaceChildren(...rows.map(([bet, icon, label, key]) => h('li', {},
    h('a', { href: `/snow-surf-report/#${key}/${bet.id}` },
      h('span', { class: 'desk-icon', 'aria-hidden': 'true' }, icon),
      h('span', { class: 'desk-text' },
        h('span', { class: 'desk-label' }, label),
        h('strong', {}, bet.name),
        h('span', { class: 'desk-reason' }, bet.reason)),
      h('span', { class: 'desk-score', 'aria-label': `${bet.score} out of 5` },
        h('span', { class: 'meter', style: `--score:${bet.score}` }), `${bet.score}/5`)))));
  const when = new Date(report.generatedAt);
  $('.desk-time').textContent = `Updated ${when.toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' })}`;
  $('.desk').hidden = false;
}
const later = window.requestIdleCallback ?? ((fn) => setTimeout(fn, 300));
later(() => conditions().catch(() => {}));
