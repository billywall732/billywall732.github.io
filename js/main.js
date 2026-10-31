// The home page at /home/: four tabs built from js/projects.js, each shown as
// its own page. The address picks the tab (#polished, #rough, #workshop,
// #off-the-clock), so every tab can be linked to and the back button works.
import { hobbies, projects } from './projects.js';
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

const VERDICT = ['', 'A hazard', 'Survives', 'Solidly mediocre', 'Suspiciously decent', 'Lying'];
$('.hobbies').replaceChildren(...hobbies.map((x) => h('li', { class: 'hobby' },
  h('div', { class: 'hobby-head' },
    h('span', { class: 'hobby-icon', 'aria-hidden': 'true' }, x.icon),
    h('h2', {}, x.name)),
  h('div', { class: 'mediocre', role: 'img', 'aria-label': `Self-rated ${x.rating} out of 5: ${VERDICT[x.rating]}` },
    h('span', { class: 'mediocre-bar', 'aria-hidden': 'true' }, [1, 2, 3, 4, 5].map((n) => h('i', { class: n <= x.rating ? 'on' : null }))),
    h('span', { class: 'mediocre-text', 'aria-hidden': 'true' }, `${x.rating}/5 · ${VERDICT[x.rating]}`)))));

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
