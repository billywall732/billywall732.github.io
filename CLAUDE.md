# CLAUDE.md

Guidance for Claude Code in this repo: **offthewall.dev** ("Off the Wall"), Billy Wall's personal site and project wall.

## About Billy and the site
- Billy is a network engineer at AT&T who builds hobby apps. He's learning as he goes: briefly explain the *why* behind non-obvious changes.
- Plain HTML/CSS/JS, **no build step** for the site. Hosted on GitHub Pages (this repo is `billywall732.github.io`, the account's main Pages site); domain via Cloudflare Registrar (`CNAME` = offthewall.dev).
- One Google sign-in for every app via **Supabase** (row-level security). `shared/auth.js`, `shared/auth-loader.js`, `shared/vendor/supabase-*.js`.
- Visit counts: GoatCounter via `shared/count.js` (no cookies), read by the hidden `/stats/` page through `worker-stats/`.
- Security headers (incl. CSP) are added by a Cloudflare Worker in `worker-headers/`. **If a page starts loading a new third-party origin, its CSP allowlist there must be updated** or the browser will block it.
- Nightly DB backup goes to a private GitHub repo (`offthewall-db`), not this one.
- Billy plans in Notion (Billy HQ: Projects, Idea Backlog, Learning Plans), reachable through the Notion connector when it's connected.

## Keep Notion's record current (every shipped change)
Notion holds the record of every edit and every planned edit for offthewall.dev and the apps. After each change is pushed live:
- **Billy HQ → Projects → "offthewall.dev (site)"**: add a bullet under **Changelog** for today's date (create the date heading if needed): what changed, the commit hash, and a mention of its Idea Backlog item. Keep **Planned next** in step.
- **Billy HQ → Idea Backlog**: move the matching item to **Shipped** and put what shipped (date, commit) in "Next step"; if there was no item, create one already Shipped, linked to its project(s). Add any new ideas or follow-ups that came up as **Idea** or **Planned**.
- **Projects**: keep each app's Status (Production Ready / Rough / Workbench) and name in step with `js/projects.js`; add a Projects page for a new project.
- If Notion isn't connected, list the updates in the reply so Billy can add them.

## How to work here
- Explore first. Small, reviewable changes. **Show the diff before every commit. Never push without Billy's OK.**
- Stay build-step-free: no frameworks, no npm dependencies for the site. (`node_modules/` here is only for temporary tool installs and is gitignored.)
- Never print or commit secrets, keys or cookies. They live in GitHub/Cloudflare secrets. `shared/config.js` holds only non-secret values.
- Confirm fixes in a real browser at desktop and phone width (Playwright MCP when available).
- Ask before renaming a project or changing a URL. If a URL changes, add a redirect (see `contrail/about/` and `wallet/about/` for the pattern).

## Projects
Live: Snow & Surf Report, Fantasy Football, Budget Ledger, Contrail, What's in My Wallet?, Krillion Code Breaker.
Workbench: Wall Street Ledger (slug `wall-street-ledger`, local folder `portfolio-ledger`, status `rough`), Quizzical, Shred Lab, Wall Wedding (slug `wall-wedding`), Loop Lab.

| Address | Where the code lives |
|---|---|
| `/`, `/home/`, `/contact/`, `/privacy/`, `/projects/<slug>/` | this repo |
| `/contrail/`, `/wallet/`, `/code-breaker/`, `/loop-lab/` | this repo (each app in its own folder) |
| `/snow-surf-report/` | repo `snow-surf-report` |
| `/my-budget-ledger/` | repo `my-budget-ledger` (local folder `budget-ledge`) |
| `/fantasy-football/` | built and pushed by the league repo (`fantasy-feetpics`) |
| Wall Street Ledger, Krillion runner/worker | local folders `portfolio-ledger`, `krillion-code-breaker` (no remotes yet) |

## Layout
```
index.html             the cover (brick wall, three buttons)
home/index.html        Workshop + Off the Clock (one page, hash-routed by js/main.js);
                       its <header> and <footer> are the master copy for other pages
contact/, privacy/     static pages
projects/<slug>/       GENERATED shells by tools/make-pages.mjs; don't hand-edit
js/projects.js         THE DATA: projects, toolkit, hobbies, clockPhotos, contact links
js/main.js             renders /home/ from projects.js (cards, workbench list, toolkit, counts)
js/project-page.js     renders a /projects/<slug>/ page from projects.js
js/ui.js               shared helpers (h(), cards, header toggles, phone menu, background)
js/cover.js, js/slide.js   cover animation; sideways slide between Workshop/Off the Clock/Contact
css/site.css           main styles (dark / light / blueprint themes via CSS variables)
shared/                app code shared by Contrail + Wallet (auth, store, trips, config, data/)
tools/make-pages.mjs   writes projects/<slug>/, copies the header/footer into app pages, runs make-feed.mjs
tools/make-feed.mjs    writes feed.xml (Atom, one entry per project); GENERATED, don't hand-edit
worker-headers/, worker-stats/, worker-ai/   Cloudflare Workers (deployed separately with wrangler)
prototype/, photos/, reference/  local only (not committed)
```

## How pages get their data
- `js/projects.js` is an ES module and the existing single source of truth. `js/main.js` and `js/project-page.js` import it directly in the browser (no fetch, no build).
- Status values: `live` → big cards; `rough` and `workshop` → "Projects Still on the Workbench" list. The Off the Clock counts are computed from these.
- Each project has `tags` (short, for its card) and `toolkit` (the Toolkit box). A tool named in `tags` must also be in `toolkit`; only list tools found in that app's code. The note at the end of `js/projects.js` says where each one was checked.
- **Run `node tools/make-pages.mjs`** after adding/removing a project, changing a slug, name or tagline, bumping a project's `updated` date, or changing the header/footer in `home/index.html`. It regenerates `projects/*` and `feed.xml` and refreshes the header/footer in the app, contact and privacy pages. Other data edits show up without it.
- When a project changes in a way worth telling feed readers, bump its `updated` (YYYY-MM-DD). Every public page has the `<link rel="alternate" type="application/atom+xml" href="/feed.xml">` tag (not the redirect pages or hidden /stats/); add it to new pages. The other repos' apps (Snow & Surf, Budget Ledger, the league) don't have it yet.
- Anchors on /home/: `#workshop`, `#workbench`, `#toolkit`, `#off-the-clock` (`#about`), `#hobbies`; old `#rough`, `#polished`, `#story`, `#work` are mapped in `js/main.js`.
- The Contact page uses a plain `mailto:` and shows the address as text (Billy's choice, Nov 2026: it must work without JavaScript, since /privacy/ sends people there to delete their data). The apps' "Email Billy" links still build it from `config.contactEmail`.
- Cloudflare's Email Address Obfuscation is on: on the live site it rewrites any email address in the HTML into a `/cdn-cgi/l/email-protection` link that needs JavaScript. Wrap addresses that must work without JavaScript in `<!--email_off-->` … `<!--/email_off-->`. Local previews don't show this, so check such changes on offthewall.dev.

## Saved data (Contrail, Wallet)
- `shared/store.js` is the only place that talks to the `app_records` / `app_docs` tables; members' rows are tagged with `app`. `store.deleteAll()` backs each app's "Delete my saved data" button (members only, two confirm dialogs, like Budget Ledger's).
- Access: `/admin/` (admin only) approves requests and sets each member's apps, active, AI and Gmail switches and daily AI limit, through the `admin_*` database functions in offthewall-db.
- Contrail's Gmail import (`contrail/gmail.js`, `contrail/email-import.js`) runs in the member's browser; emails it can't parse from schema.org markup go to `worker-ai/` (Claude Haiku, strict JSON). It keeps only extracted fields plus `processed_emails` (message ID + outcome), never email text. `node worker-ai/test.mjs` checks the Worker's gates.
- Wallet saves on delays (number fields wait 500 ms, then `persist()` waits 300 ms). Anything that deletes or replaces the wallet must cancel those first, or a late save writes it back.
- To test member-only features without touching the real database, intercept requests to the Supabase URL in Playwright and answer from an in-memory fake, with a fake session in localStorage (`sb-yxdmuznxcqcauyehhfmp-auth-token`).

## Caching: version what you change
Cloudflare lets browsers keep files for 4 hours, and its edge can serve the old copy right after a deploy, so a changed script or icon can stay stale for hours. Shared scripts load with a version: `/js/ui.js?v=2`, the entry scripts (`/js/main.js?v=2`, `/js/project-page.js?v=2`, the apps' `app.js?v=2`) and `/shared/app-shell.js?v=2`. When you change one, bump its number **everywhere it's loaded** (every import and `src`, and `tools/make-pages.mjs`). The same address must be used everywhere on a page, or the browser runs two copies of the module (two board cursors, for one). Icons use `?v=` too (README, "Icons").

## Preview locally
From the repo folder: `py -m http.server 8080` (on this PC `python` is the Windows Store stub), then open http://localhost:8080/home/. Root-relative paths (`/css/...`) need the server to be rooted here. Links to the other repos' apps (`/snow-surf-report/` etc.) only work on the live site. The CSP Worker doesn't run locally, so check CSP-sensitive changes on the live site too.

## Later (noted, not started)
- Contrail Gmail import (restricted Google scope: Testing mode + privacy page update).
- Update `/privacy/` whenever a feature adds data handling (Gmail import, Wallet Claude chat, Wall Street Ledger on Drive, wedding RSVPs).
- Wall Wedding RSVPs: embedded Tally form + Cloudflare Worker confirmation email via Tally webhook (needs CSP `frame-src` for Tally).
