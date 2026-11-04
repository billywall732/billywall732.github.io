# Visit counts: the stats Worker

The hidden page at **https://offthewall.dev/stats/** shows aggregate visit counts, with a toggle between two GoatCounter accounts:
- **Off the Wall** (`offthewall`): the portfolio, its apps and Fantasy Football.
- **Fantasy Feetpics** (`fantasy`): the league's own site. `/stats/#fantasy` opens it directly.

This Cloudflare Worker reads both accounts and hands the page totals only. The GoatCounter key stays with the Worker and never appears on any page.

## What is counted, and what isn't

The site's own counter (`shared/count.js`) sends GoatCounter only these:

- the page path, never its query string;
- the referrer's domain, never the full address, and nothing for links within the site;
- aggregate events:
  - device type (phone / tablet / laptop) and browser family, with no versions;
  - entry page;
  - time on page, in buckets;
  - an estimated exit page;
  - the visit's length when it ends, in buckets (under 30 s, 30 s–1 min, 1–5 min, 5 min+);
  - how far down a page each view scrolled, in quarters;
  - clicks to other sites, by domain only;
  - moves from one page of the site to another (path to path, one step at a time, counted together);
  - the window size, as phone / tablet / desktop.

It doesn't use cookies, IDs or fingerprints. The only thing it keeps in the browser is the time the current visit started, in that tab's sessionStorage: it's never sent, and it's gone when the tab closes.

GoatCounter receives each request the way any website does, so it sees the visitor's IP address and browser header. It uses the IP only to look up the country and region (US state), and stores neither.

## Set it up (once)

1. **GoatCounter settings.** Sign in at offthewall.goatcounter.com and go to **Settings**. Under data collection:
   - keep **Sessions**, **Country** and **Region**;
   - untick **User-Agent**, **Screen size** and **Language**. The counter sends device and browser family itself, so GoatCounter needn't keep browser versions.

   Save.
2. **API key.** Still on offthewall.goatcounter.com, go to your name → **API** → **New API key**. Name it `stats page`, give it **Read statistics** only, and copy it.
3. **Deploy.** In this folder:
   ```
   npx wrangler secret put GOATCOUNTER_TOKEN
   npx wrangler deploy
   ```
   Paste the key when asked. The deploy prints the address, like `https://otw-stats.offthewall-dev.workers.dev`.
4. **The league's counter** (fantasy.goatcounter.com): repeat steps 1–2 there, with the same data-collection settings and a new **Read statistics** key. Then:
   ```
   npx wrangler secret put GOATCOUNTER_TOKEN_FANTASY
   ```
5. **Connect the page.** Put that address in `shared/config.js` → `statsUrl`, then commit and push.

## How the page stays fast

The Worker works the summaries out ahead of time. Every 10 minutes a scheduled run refreshes one site (the one refreshed longest ago) and saves its summary in the Workers KV namespace `STATS` (see `wrangler.toml`). The page reads that saved copy in one request, well under a second. If a copy is over 20 minutes old, the request also starts a refresh in the background. Only when there is no copy at all does it ask GoatCounter on the spot (about 7 seconds).

The page waits at most 10 seconds. If the Worker doesn't answer or fails, it shows the last numbers it loaded in that browser, marked with when they were worked out, plus a Try again button.

The KV namespace was created with `npx wrangler kv namespace create STATS`. To redeploy after a change: `npx wrangler deploy` in this folder.

## How the ranges are counted

Each range (today, 7 days, 30 days) is counted from each page's per-day stats, in the counter's own time zone, so the total, the page rows and the trend line always agree. Today also has views per hour.

GoatCounter treats an API end date as exclusive and the dates as UTC. So the Worker asks up to tomorrow and keeps only the days inside the range. Before this, Today always came back empty.

Referrers, countries and US states come from GoatCounter's own range totals. They can be off by a few hours at the edges of a range.

To redeploy after changing the Worker: `npx wrangler deploy` in this folder.
