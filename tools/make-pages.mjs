// Writes a page for every project in js/projects.js, at projects/<slug>/index.html.
// Run it after adding a project or changing a name or tagline:
//   node tools/make-pages.mjs
// The header and footer are copied from the home page (home/index.html), so change them there.
// Each page is a small shell; js/project-page.js fills it in from the data.
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { projects } from '../js/projects.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const home = readFileSync(join(root, 'home', 'index.html'), 'utf8');
const header = home.match(/  <header class="nav wrap">[\s\S]*?<\/header>/)[0];
const footer = home.match(/  <footer class="wrap">[\s\S]*?<\/footer>/)[0];

const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

const page = (p) => `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(p.name)} · Off the Wall</title>
  <meta name="description" content="${esc(p.tagline)}">
  <meta property="og:title" content="${esc(p.name)} · Off the Wall">
  <meta property="og:description" content="${esc(p.tagline)}">
  <meta property="og:image" content="${p.image ?? '/img/snow-surf.webp'}">
  <link rel="icon" href="/icon.svg" type="image/svg+xml">
  <meta name="theme-color" content="#121110">
  <!-- This file is made by tools/make-pages.mjs; edit js/projects.js instead -->
  <script>
    document.documentElement.dataset.theme = 'dark';
    try { const t = localStorage.getItem('otw-theme'); if (['dark', 'light', 'blueprint'].includes(t)) document.documentElement.dataset.theme = t; } catch {}
  </script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400..800&family=Inter:wght@400..700&display=swap">
  <link rel="stylesheet" href="/css/site.css">
  <!-- Anonymous visit counts (GoatCounter: no cookies, no personal data) -->
  <script data-goatcounter="https://offthewall.goatcounter.com/count" async src="//gc.zgo.at/count.js"></script>
  <script type="module" src="/js/project-page.js"></script>
</head>
<body>
  <a class="skip" href="#main">Skip to content</a>

${header}

  <main id="main" class="detail wrap" data-slug="${p.slug}">
    <h1>${esc(p.name)}</h1>
    <p>${esc(p.tagline)}</p>
  </main>

${footer}

  <noscript><p class="wrap">Turn on JavaScript to see this project, or visit <a href="https://github.com/billywall732">github.com/billywall732</a>.</p></noscript>
</body>
</html>
`;

// Start clean, so a renamed or removed project doesn't leave an old page behind
const dir = join(root, 'projects');
rmSync(dir, { recursive: true, force: true });
for (const p of projects) {
  mkdirSync(join(dir, p.slug), { recursive: true });
  writeFileSync(join(dir, p.slug, 'index.html'), page(p));
}
console.log(`Wrote ${readdirSync(dir).length} project pages: ${projects.map((p) => `/projects/${p.slug}/`).join(' ')}`);
