# Off the Wall

Billy Wall's projects site: https://billywall732.github.io/

Plain HTML, CSS and JavaScript. No build step for the site itself; one small Node script makes the project pages.

## How it fits together

This repo is named `billywall732.github.io`, which makes it the main GitHub Pages site for the account. Every other repo with GitHub Pages turned on shows up under it automatically:

| Address | Repo |
|---|---|
| `/` | this repo |
| `/projects/<slug>/` | this repo: one page per project |
| `/snow-surf-report/` | snow-surf-report |
| `/fantasy-feetpics/` | fantasy-feetpics |
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
```

The **home page** has four tabs, each shown as its own page: Polished Projects, Rough Around the Edges, In the Workshop and Off the Clock. The address picks the tab (`/home/#rough`), so each can be linked to, and old `/home/#work` links open Polished Projects.

The **Off the Clock** tab shows the activity blocks next to a photo slideshow (`clockPhotos` in `js/projects.js`). Tapping a block shows its photo. The ffmpeg command to add a photo is in that file; it shrinks the photo and strips its location data.

The **Board** button in the header (mouse only, hidden with reduced motion) cycles skateboard → snowboard → surfboard → off. The normal cursor always stays; the board just trails it.

## Run it on your computer

From the folder: `python -m http.server 8080`, then open http://localhost:8080. (The app links only work on the real site, where the other repos live next to it.)
