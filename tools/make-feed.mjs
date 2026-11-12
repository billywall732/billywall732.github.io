// Writes /feed.xml, an Atom feed of the projects in js/projects.js: one entry per project, newest
// `updated` first. Feed readers show an entry again when its `updated` date changes, so bump it
// when a project changes in a way worth telling people about.
//   node tools/make-feed.mjs        (tools/make-pages.mjs runs it too)
// Every page links to it with <link rel="alternate" type="application/atom+xml" href="/feed.xml">.
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { projects } from '../js/projects.js';

const SITE = 'https://offthewall.dev';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// Atom wants a full timestamp; the data has days, so each one counts as noon UTC
const stamp = (day) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day ?? '')) throw new Error(`Missing or malformed updated date: ${day}`);
  return `${day}T12:00:00Z`;
};
const STATUS = { live: 'Live', rough: 'On the Workbench', workshop: 'On the Workbench' };

// The entry's body: what it is, where it stands, what's next. Escaped once more by esc() below,
// because Atom carries HTML content as escaped text.
const body = (p) => [
  `<p>${esc(p.blurb)}</p>`,
  `<p><strong>${STATUS[p.status]}:</strong> ${esc(p.statusNote)}</p>`,
  p.next?.length ? `<p>What’s next:</p><ul>${p.next.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '',
  p.url ? `<p><a href="${esc(new URL(p.url, SITE).href)}">Open ${esc(p.name)}</a></p>` : '',
].join('');

const entries = projects
  .map((p) => {
    try { return { p, when: stamp(p.updated) }; } catch (e) { throw new Error(`${p.slug}: ${e.message}`); }
  })
  .sort((a, b) => b.when.localeCompare(a.when) || a.p.name.localeCompare(b.p.name));

const entry = ({ p, when }) => `  <entry>
    <title>${esc(p.name)}</title>
    <id>${SITE}/projects/${p.slug}/</id>
    <link rel="alternate" type="text/html" href="${SITE}/projects/${p.slug}/"/>
    <updated>${when}</updated>
    <category term="${p.status === 'live' ? 'live' : 'workbench'}" label="${STATUS[p.status]}"/>
    <summary>${esc(p.tagline)}</summary>
    <content type="html">${esc(body(p))}</content>
  </entry>`;

const feed = `<?xml version="1.0" encoding="utf-8"?>
<!-- Made by tools/make-feed.mjs from js/projects.js; don't edit by hand -->
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Off the Wall · Billy Wall</title>
  <subtitle>Apps I built because I wanted them to exist: what's live and what's on the workbench.</subtitle>
  <id>${SITE}/</id>
  <link rel="self" type="application/atom+xml" href="${SITE}/feed.xml"/>
  <link rel="alternate" type="text/html" href="${SITE}/home/"/>
  <updated>${entries[0].when}</updated>
  <author><name>Billy Wall</name><uri>${SITE}/</uri></author>
  <icon>${SITE}/img/icon-192.png</icon>
${entries.map(entry).join('\n')}
</feed>
`;

writeFileSync(join(root, 'feed.xml'), feed);
console.log(`Wrote feed.xml: ${entries.length} entries, last updated ${entries[0].when.slice(0, 10)}`);
