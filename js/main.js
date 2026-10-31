// The home page: built from js/projects.js, plus the live Conditions desk.
import { hobbies, projects } from './projects.js';
import { $, accentStyle, actions, h, iconTile, preview, projectHref, setUpPage, spotlight, statusPill } from './ui.js';

const live = projects.filter((p) => p.status === 'live');
const workshop = projects.filter((p) => p.status === 'workshop');

// ---------- Live projects: big cards ----------

function card(p, i) {
  return h('article', { class: `project${i === 0 ? ' featured' : ''}`, style: accentStyle(p) },
    h('span', { class: 'spot', 'aria-hidden': 'true' }),
    preview(p),
    h('div', { class: 'project-body' },
      h('div', { class: 'project-meta' },
        iconTile(p),
        h('span', { class: 'kicker' }, p.kicker),
        statusPill(p)),
      h('h3', {}, h('a', { href: projectHref(p) }, p.name)),
      h('p', { class: 'blurb' }, p.blurb),
      h('ul', { class: 'highlights' }, p.highlights.map((x) => h('li', {}, x))),
      h('ul', { class: 'tags', 'aria-label': 'Built with' }, p.tags.map((t) => h('li', {}, t))),
      actions(p)));
}

$('.projects').replaceChildren(...live.map(card));
spotlight(document.querySelectorAll('.project'));
$('.count').textContent = `${live.length} live · ${workshop.length} in the workshop`;

// ---------- In the workshop: a compact list ----------

$('.workshop-list').replaceChildren(...workshop.map((p) => h('li', { style: accentStyle(p) },
  h('a', { class: 'workshop-item', href: projectHref(p) },
    iconTile(p),
    h('span', { class: 'workshop-text' },
      h('strong', {}, p.name),
      h('span', { class: 'workshop-line' }, p.tagline)),
    h('span', { class: 'workshop-status' }, p.statusNote),
    h('span', { class: 'workshop-more' }, 'Learn more ', h('span', { 'aria-hidden': 'true' }, '→'))))));

$('.bench-text').replaceChildren(
  workshop.map((p) => p.name).join(', ').replace(/, ([^,]*)$/, ' and $1'), '. ',
  h('a', { href: '#workshop' }, 'See what’s in progress'));

// ---------- Off the clock: proudly mediocre at ----------

const VERDICT = ['', 'A hazard', 'Survives', 'Solidly mediocre', 'Suspiciously decent', 'Lying'];
$('.hobbies').replaceChildren(...hobbies.map((x) => h('li', { class: 'hobby' },
  h('div', { class: 'hobby-head' },
    h('span', { class: 'hobby-icon', 'aria-hidden': 'true' }, x.icon),
    h('h3', {}, x.name)),
  h('div', { class: 'mediocre', role: 'img', 'aria-label': `Self-rated ${x.rating} out of 5: ${VERDICT[x.rating]}` },
    h('span', { class: 'mediocre-bar', 'aria-hidden': 'true' }, [1, 2, 3, 4, 5].map((n) => h('i', { class: n <= x.rating ? 'on' : null }))),
    h('span', { class: 'mediocre-text', 'aria-hidden': 'true' }, `${x.rating}/5 · ${VERDICT[x.rating]}`)))));

setUpPage();

// ---------- Conditions desk: today's best bets from the Snow and Surf Report ----------
// Same site, so it's just a file read. Loaded after the page is up (it's ~500 KB).

const SPORTS = { snow: { icon: '⛰', label: 'Snow', verb: 'Go ride' }, surf: { icon: '🌊', label: 'Surf', verb: 'Go surf' } };

function deskRow({ href, icon, label, name, where, reason, score, call }) {
  return h('li', { class: call ? 'is-call' : null },
    h('a', { href },
      h('span', { class: 'desk-icon', 'aria-hidden': 'true' }, icon),
      h('span', { class: 'desk-text' },
        h('span', { class: 'desk-label' }, label),
        h('strong', {}, name, where ? h('span', { class: 'desk-where' }, `, ${where}`) : null),
        reason ? h('span', { class: 'desk-reason' }, reason) : null),
      score != null ? h('span', { class: 'desk-score', 'aria-label': `${score} out of 5` },
        h('span', { class: 'meter', style: `--score:${score}` }), `${score}/5`) : null));
}

// The best overall bet: the report's own verdict when it has one, otherwise
// whichever of snow and surf scores higher
function todaysCall(report, bets) {
  if (typeof report.verdict === 'string' && report.verdict.trim()) {
    return { href: '/snow-surf-report/', icon: '📣', label: 'Today’s call', name: report.verdict.trim(), call: true };
  }
  const best = Math.max(...bets.map((b) => b.score));
  const top = bets.filter((b) => b.score === best);
  if (best <= 2) {
    return { href: '/snow-surf-report/', icon: '☕', label: 'Today’s call', name: 'Stay in and build something', reason: `Nothing beats ${best}/5 today.`, call: true };
  }
  if (top.length > 1) {
    return { href: '/snow-surf-report/', icon: '🎲', label: 'Today’s call', name: 'Toss-up: pick your board', reason: `${top.map((b) => (b.where ? `${b.name} (${b.where})` : b.name)).join(' or ')}, both ${best}/5.`, call: true };
  }
  const [b] = top;
  return { href: `/snow-surf-report/#${b.key}/${b.id}`, icon: '🏆', label: 'Today’s call', name: `${SPORTS[b.key].verb}: ${b.name}`, where: b.where, reason: `The best bet on the board at ${best}/5.`, score: best, call: true };
}

async function conditions() {
  const res = await fetch('/snow-surf-report/data/report.json');
  if (!res.ok) throw new Error(res.status);
  const report = await res.json();
  // Each pick's town and state come from its full entry in the report
  const placeOf = (key, id) => {
    const item = report.sections?.[key]?.items?.find((x) => x.id === id);
    return [item?.city, item?.region].filter(Boolean).join(', ');
  };
  const bets = Object.keys(SPORTS)
    .map((key) => ({ key, ...report.sections?.[key]?.bestBet }))
    .filter((b) => b.name && Number.isFinite(b.score))
    .map((b) => ({ ...b, where: placeOf(b.key, b.id) }));
  if (!bets.length) throw new Error('no picks');
  $('.desk-list').replaceChildren(
    ...bets.map((b) => deskRow({ href: `/snow-surf-report/#${b.key}/${b.id}`, ...SPORTS[b.key], name: b.name, where: b.where, reason: b.reason, score: b.score })),
    deskRow(todaysCall(report, bets)));
  const when = new Date(report.generatedAt);
  $('.desk-time').textContent = `Updated ${when.toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' })}`;
  $('.desk').removeAttribute('aria-busy');
}

function deskOffline() {
  $('.desk-list').replaceChildren(deskRow({ href: '/snow-surf-report/', icon: '📡', label: 'Off the air', name: 'Conditions are on a coffee break', reason: 'Open the Snow and Surf Report for today’s picks.', call: true }));
  $('.desk-time').textContent = '';
  $('.desk').removeAttribute('aria-busy');
}

const later = window.requestIdleCallback ?? ((fn) => setTimeout(fn, 300));
later(() => conditions().catch(deskOffline));
