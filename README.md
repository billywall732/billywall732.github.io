# Off the Wall

Billy Wall's projects site: https://billywall732.github.io/

Plain HTML, CSS and JavaScript. No build step, nothing to install.

## How it fits together

This repo is named `billywall732.github.io`, which makes it the main GitHub Pages site for the account. Every other repo with GitHub Pages turned on shows up under it automatically:

| Address | Repo |
|---|---|
| `/` | this repo |
| `/snow-surf-report/` | snow-surf-report |
| `/fantasy-feetpics/` | fantasy-feetpics |
| `/my-budget-ledger/` | my-budget-ledger |

When a custom domain is added to **this** repo (Settings → Pages → Custom domain), all of them move with it: `yourdomain.com/snow-surf-report/` and so on.

## Add a project

1. Turn on GitHub Pages in the new project's repo (it then lives at `/<repo-name>/`).
2. Add a screenshot to `img/` (1280 × 800 works best, `.webp` or `.png`).
3. Copy an entry in `js/projects.js` and change it. The first entry gets the big card.
4. Commit and push. The site updates within a minute.

## Files

```
index.html       the page
css/site.css     styles (light + dark via CSS variables)
js/projects.js   the projects and hobbies: edit this to change what's shown
js/main.js       builds the cards, theme switch, the live "Conditions desk"
img/             project screenshots
icon.svg         the tab icon
```

The **Conditions desk** reads `/snow-surf-report/data/report.json` (same site, no API key) and shows today's best snow and surf picks. If it can't load, the card stays hidden.

## Run it on your computer

From the folder: `python -m http.server 8080`, then open http://localhost:8080. (The Conditions desk only shows up on the real site, where the Snow and Surf data lives next to it.)
