# otw-headers

A Cloudflare Worker that sits in front of GitHub Pages and adds the security headers Pages
can't set: HSTS, a per-app Content-Security-Policy, `X-Frame-Options`, `X-Content-Type-Options`,
`Referrer-Policy` and `Permissions-Policy`. It also drops Pages' `Access-Control-Allow-Origin: *`.
It doesn't change any page content.

The CSP allowlist lives in `src/index.js` (`BASE` plus `ALLOW` per app path). Each entry is a
third party the app's own code really loads. If an app starts using a new script, font, API or
map tiles, add the origin there, or the browser will block it.

## Status

The Worker is deployed to its preview address, https://otw-headers.offthewall-dev.workers.dev,
which proxies offthewall.dev and scores **A** on securityheaders.com. The real site doesn't go
through it yet: the DNS records are DNS-only (grey cloud), so visitors reach GitHub Pages directly.

## Owner steps to switch it on

1. **Cloudflare dashboard → offthewall.dev → DNS → Records.** Set the `offthewall.dev` records
   (A/AAAA to GitHub Pages) and `www` to **Proxied** (orange cloud).
2. **SSL/TLS → Overview.** Set the mode to **Full (strict)**. Flexible causes a redirect loop
   with GitHub Pages' HTTPS.
3. **Route.** In `wrangler.toml`, uncomment the `routes = …` line, then run
   `npx wrangler deploy` in this folder.
4. **Check.** Run https://securityheaders.com/?q=offthewall.dev&followRedirects=on and expect
   an A. Click through every app once and watch the browser console for CSP errors.
5. **Optional: HSTS preload.** After a few days with no problems, submit offthewall.dev at
   https://hstspreload.org. This is hard to undo: every subdomain must serve HTTPS from then on.
6. **Certificates.** GitHub Pages renews its certificate over plain HTTP. If Pages ever shows a
   certificate error in Settings → Pages, set the records back to DNS-only, let Pages renew,
   then proxy them again.

To roll back, set the records to DNS-only. The site keeps working; it just loses the headers.

## Why the grade is A, not A+

`script-src` and `style-src` allow `'unsafe-inline'`, because the pages use inline scripts and
style attributes. Removing it would mean moving the inline code into files or adding hashes to
every page.
