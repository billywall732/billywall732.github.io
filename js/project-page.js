// A project's own page, at /projects/<slug>/. Everything comes from js/projects.js;
// the page's <main data-slug="..."> says which project it is.
import { projects } from './projects.js';
import { $, accentStyle, actions, h, iconTile, preview, projectHref, setUpPage, statusPill, tabHref } from './ui.js';

const main = $('main');
const i = projects.findIndex((p) => p.slug === main.dataset.slug);
const p = projects[i];
// The home page section each status is listed under
const SECTION = { live: 'Polished Projects', rough: 'Rough Around the Edges', workshop: 'In the Workshop' };

function section(title, ...body) {
  const id = title.toLowerCase().replace(/[^a-z]+/g, '-');
  return h('section', { class: 'detail-section', 'aria-labelledby': id }, h('h2', { id }, title), ...body);
}

// The screenshot, with a button to swap in the real app (only loaded on request)
function livePreview() {
  const wrap = h('div', { class: 'detail-preview' }, preview(p, { link: false }));
  if (p.url) {
    const btn = h('button', { type: 'button', class: 'button small' }, 'Try it right here');
    btn.addEventListener('click', () => {
      wrap.replaceChildren(h('iframe', { class: 'detail-frame', src: p.url, title: `${p.name}, live`, loading: 'lazy' }),
        h('p', { class: 'detail-frame-note' }, 'Running live. ', h('a', { href: p.url }, 'Open it full size ↗')));
    });
    wrap.append(h('p', { class: 'detail-frame-note' }, btn, ' or ', h('a', { href: p.url }, 'open it in a new page ↗')));
  }
  return wrap;
}

if (p) {
  main.style.cssText = accentStyle(p);
  const prev = projects[(i - 1 + projects.length) % projects.length];
  const next = projects[(i + 1) % projects.length];
  main.replaceChildren(
    h('a', { class: 'back', href: tabHref(p) }, h('span', { 'aria-hidden': 'true' }, '← '), 'All projects'),
    h('header', { class: 'detail-head' },
      h('div', { class: 'project-meta' }, iconTile(p), h('span', { class: 'kicker' }, p.kicker), statusPill(p)),
      h('h1', {}, p.name),
      h('p', { class: 'detail-lede' }, p.tagline),
      actions(p, { learnMore: false })),
    livePreview(),
    h('div', { class: 'detail-grid' },
      section('What it is', h('p', {}, p.blurb), h('ul', { class: 'highlights' }, p.highlights.map((x) => h('li', {}, x)))),
      // Optional extra sections from the project's notes
      ...(p.notes || []).map((n) => section(n.title, ...[n.text && h('p', {}, n.text), n.items && h('ul', { class: 'highlights' }, n.items.map((x) => h('li', {}, x)))].filter(Boolean))),
      section('Why I built it', h('p', {}, p.why)),
      section('How it works', h('ol', { class: 'steps' }, p.how.map((x) => h('li', {}, x)))),
      section('Status', h('p', { class: 'detail-status' }, statusPill(p), h('span', { class: 'status-sep' }, ' · '), p.statusNote)),
      section('Built with', h('ul', { class: 'tags' }, p.tags.map((t) => h('li', {}, t)))),
      section('What’s next', h('ul', { class: 'highlights' }, p.next.map((x) => h('li', {}, x))))),
    // Each link names the project and the section it's in (the tab it's listed on at /home/)
    h('nav', { class: 'detail-pager', 'aria-label': 'More projects' },
      h('a', { href: projectHref(prev), style: accentStyle(prev) }, h('span', {}, `← Previous · ${SECTION[prev.status]}`), h('strong', {}, prev.name)),
      h('a', { href: projectHref(next), style: accentStyle(next) }, h('span', {}, `${SECTION[next.status]} · Next →`), h('strong', {}, next.name))));
} else {
  main.replaceChildren(h('a', { class: 'back', href: '/home/#workshop' }, '← All projects'), h('h1', {}, 'That project wandered off.'));
}

setUpPage();
