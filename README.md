# Off the Wall

Billy Wall's projects site: https://offthewall.dev/ (the old https://billywall732.github.io/ addresses redirect there)

Plain HTML, CSS and JavaScript. No build step for the site itself; one small Node script makes the project pages.

## How it fits together

This repo is named `billywall732.github.io`, which makes it the main GitHub Pages site for the account. Every other repo with GitHub Pages turned on shows up under it automatically:

| Address | Repo |
|---|---|
| `/` | this repo |
| `/projects/<slug>/` | this repo: one page per project |
| `/contrail/`, `/contrail/analytics/` | this repo: the Contrail app |
| `/wallet/` | this repo: the What's in My Wallet? app |
| `/snow-surf-report/` | snow-surf-report |
| `/fantasy-football/` | fantasy-football (built and pushed by fantasy-feetpics) |
| `/my-budget-ledger/` | my-budget-ledger |

When a custom domain is added to **this** repo (Settings → Pages → Custom domain), all of them move with it: `yourdomain.com/snow-surf-report/` and so on.

## Add or change a project

Everything shown comes from **`js/projects.js`**: the home page tabs, each project's page, the "Currently tinkering with" line, the hobbies and the contact links.

1. Turn on GitHub Pages in the new project's repo (it then lives at `/<repo-name>/`).
2. Add a screenshot to `img/` (1280 × 800 works best, `.webp` or `.png`).
3. Copy an entry in `js/projects.js` and change it. `status` picks its tab: `'live'` (Polished Projects) and `'rough'` (Rough Around the Edges) get big cards; `'workshop'` goes in the In the Workshop list.
4. Run `node tools/make-pages.mjs` to (re)make the pages in `projects/`.
5. Commit and push. The site updates within a minute.

Step 4 is only needed when you add or remove a project, or change a slug, name or tagline. Other edits show up without it.

## Files

```
index.html            the cover at / (brick wall, paint splat, four buttons); it never moves on by itself
home/index.html       the home page at /home/ (its header and footer are copied into the project pages)
projects/<slug>/      project pages, made by tools/make-pages.mjs; don't edit by hand
css/site.css          styles: dark, light and blueprint modes via CSS variables
css/cover.css         the cover's styles, including the brick texture (a tiny SVG tile per mode)
js/cover.js           points the cover's "Contact" button at contact.email
js/projects.js        the data: edit this to change what's shown
js/ui.js              shared: color-mode and board-cursor buttons, footer strip, card bits
js/main.js            the home page: four tabs (#polished, #rough, #workshop, #off-the-clock)
js/project-page.js    a project's page
tools/make-pages.mjs  writes projects/<slug>/index.html for each project
img/                  project screenshots; img/clock/ has the Off the Clock photos
photos/               your original photos (not committed: big, with location data)
icon.svg              the tab icon
contrail/             Contrail, the flight and hotel log (app.js, csv.js import, demo-data.js, analytics/, cover/)
wallet/               What's in My Wallet?, the card tracker (app.js, demo-data.js, cover/)
contrail/about/, wallet/about/   redirect to the apps' project pages
shared/               what both apps use:
  config.js           every environment value (Firebase, Worker, OAuth client, contact email) in one place
  store.js            the data layer; Phase 1 keeps everything in memory (a reload starts over)
  trips.js, travel.js trip math (time zones, miles) and the travel summary Wallet reads
  app-shell.js        site header/footer behavior, demo banner, file downloads
  data/               airports.json (from OurAirports), lounges.json, cards.json
tools/build-airports.mjs  rebuilds shared/data/airports.json (see the file for how)
reference/            the original claude.ai apps; not committed (Contrail's has real trips)
```

The **home page** has four tabs, each shown as its own page: Polished Projects, Rough Around the Edges, In the Workshop and Off the Clock. The address picks the tab (`/home/#rough`), so each can be linked to, and old `/home/#work` links open Polished Projects.

The **Off the Clock** tab shows the activity blocks next to a photo slideshow (`clockPhotos` in `js/projects.js`). Tapping a block shows its photo. The ffmpeg command to add a photo is in that file; it shrinks the photo and strips its location data.

The **Board** button in the header (mouse only, hidden with reduced motion) cycles skateboard → snowboard → surfboard → off. The normal cursor always stays; the board just trails it.

## The apps (Contrail and What's in My Wallet?)

Both run as **demos**: anyone can click around made-up data for "Alex & Jordan", and nothing is saved. The sample trips are placed relative to today, so there's always one coming up. Sign-in for approved users (their own saved data, Gmail import, Claude features) comes in later phases; see `shared/config.js`.

- Their header and footer are copied from `home/index.html` by `node tools/make-pages.mjs`, like the project pages.
- Each app's CSS is scoped under `.contrail-app` / `.wallet-app` so it can't affect the rest of the site.
- **Lounges** (`shared/data/lounges.json`): airports marked `needsReview` come from general knowledge and haven't been checked. Each lounge list shows when it was last checked.
- **Cards** (`shared/data/cards.json`): fees and earning rates as of 2026. They change often; update them here.

## Run it on your computer

From the folder: `python -m http.server 8080`, then open http://localhost:8080. (The app links only work on the real site, where the other repos live next to it.)
