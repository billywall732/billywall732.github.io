# Visit counts: the stats Worker

The hidden page at **https://offthewall.dev/stats/** shows aggregate visit counts. This Cloudflare Worker reads them from the `offthewall` GoatCounter account and hands the page totals only. The GoatCounter key stays with the Worker and never appears on any page.

## What is counted, and what isn't

The site's own counter (`shared/count.js`) sends GoatCounter only these:

- the page path, never its query string;
- the referrer's domain, never the full address, and nothing for links within the site;
- aggregate events:
  - device type (phone / tablet / laptop) and browser family, with no versions;
  - entry page;
  - time on page, in buckets;
  - an estimated exit page.

It doesn't use cookies and stores nothing in the browser.

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
4. **Connect the page.** Put that address in `shared/config.js` → `statsUrl`, then commit and push.

The page updates at most every 15 minutes, since the Worker caches its answer.
