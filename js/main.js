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
    ? h('img', { src: p.image, alt: `Screenshot of ${p.name}`, width: '1280', height: '800', loading: 'lazy', decoding: 'async' })
    : h('div', { class: 'frame-placeholder', 'aria-hidden': 'true' },
      h('div', { class: 'ph-bars' }, [38, 62, 48, 80, 66, 92, 74].map((v) => h('i', { style: `height:${v}%` }))),
      h('span', { class: 'ph-label' }, 'Under construction'));
  const frame = h('div', { class: 'frame' }, bar, body);
  return p.url ? h('a', { class: 'frame-link', href: p.url, tabindex: '-1', 'aria-hidden': 'true' }, frame) : frame;
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

// ---------- Light / dark ----------

const toggle = $('.theme-toggle');
const isDark = () => (document.documentElement.dataset.theme ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')) === 'dark';
const syncToggle = () => toggle.setAttribute('aria-label', isDark() ? 'Switch to light mode' : 'Switch to dark mode');
toggle.addEventListener('click', () => {
  const next = isDark() ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem('otw-theme', next); } catch { /* private mode: fine */ }
  syncToggle();
});
syncToggle();

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
