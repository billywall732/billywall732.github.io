# The AI Worker

The apps' Claude features go through this Cloudflare Worker. It has two endpoints:

`POST /v1/contrail/parse-email` takes `{ subject, from, date, text }` and returns `{ result, remaining }`. Contrail's Gmail import uses it for booking emails it can't parse on its own.
- `result` is `{ kind: "flight" | "stay" | "cancellation" | "none", confirmation, cancel_kind, legs[], stay, paid, travelers[] }`.
- `text` is the email's plain text, at most about 12,000 characters, cut down in the member's browser.

`POST /v1/wallet/ask` takes `{ question, wallet, thread }` and returns `{ result, remaining }`. What's in My Wallet? uses it (through `shared/ai.js`) to ask Claude about a member's cards.
- `result` is `{ summary, suggestions[] }`. Each suggestion is `{ name, issuer, annualFee, typicalBonus, why, watchOut }`. The page matches suggestions to its card catalog itself.
- `question` is at most 600 characters. `wallet` is the page's summary of the wallet (names, fees, multipliers, dates, 5/24, point values, watchlist, travel), at most 9,000 characters as JSON, never card numbers. `thread` is up to 4 earlier `{ q, a }` turns.

The Worker owns the model (`MODEL`, Claude Haiku 5.5), each endpoint's system prompt and its strict JSON schema, so a page can't change what it asks Claude. It also tidies every answer before sending it back (well-formed values only, nothing that looks like a card number).

## Who gets an answer

Every request goes through these checks in order (`gate()` in `src/index.js`):

1. **Origin:** only `ALLOWED_ORIGINS` (offthewall.dev and `http://localhost:8080`). Anything else gets 403.
2. **Sign-in:** the caller's Supabase access token is checked against the project's published signing keys: signature, expiry, issuer and audience. The account must be real (not anonymous) with a verified email. Otherwise 401.
3. **Member:** the caller's own row in `members`, read with their own sign-in so row-level security applies. They must be **active** with the endpoint's switch on (set on `/admin/`): **Gmail** for parse-email, **AI** for wallet/ask. Wallet also asks the database `is_app_member('wallet')`, again as them, so only people approved for Wallet get answers. Otherwise 403.
4. **Kill switch:** if `AI_ENABLED` isn't `"true"`, the answer is 503 and Claude isn't called. It covers both endpoints.
5. **Daily limit:** a count per person, per endpoint, per day (Pacific time) in the `USAGE` KV namespace, against their "AI a day" number from the admin page. The two counts are separate, so importing email doesn't use up wallet questions. Email parsing also allows `BACKFILL_LIMIT` (300) a day for the first `BACKFILL_DAYS` (7) after someone's first sync. Over the limit is 429, and the count resets the next day.

Over-long input gets 413 without calling Claude.

## What's kept

- Email text and wallet questions are never stored or logged.
- Each request writes one log line with the task, the first 16 hex characters of a SHA-256 of the email text or question, the outcome and the token counts.
- KV holds only the per-day counts, which expire after 2 days, and each person's first-sync date for email.
- The Claude API key is a Worker secret. It's never in this repo or on any page.

The final backstop on cost is the monthly spend limit in the Claude Console.

## Test it

```
node worker-ai/test.mjs
```

This needs no network. It runs every gate above for both endpoints against stand-ins: a test signing key, a fake members table and `is_app_member`, KV and the Claude API. It also checks the structured-output schemas' union limit, that each endpoint has its own daily count, and retries a transient KV write rate limit.

## Set it up (once)

```
cd worker-ai
npx wrangler kv namespace create USAGE      # paste the id into wrangler.toml
npx wrangler secret put ANTHROPIC_API_KEY   # paste the key when asked; it never goes in a file
npx wrangler deploy
```

The Worker's address, `https://otw-ai.offthewall-dev.workers.dev`, is `workerUrl` in `shared/config.js`. A page that calls it needs that address in its `connect-src` in `worker-headers/` (Contrail and Wallet have it).

To pause all AI calls straight away, set `AI_ENABLED = "false"` in `wrangler.toml` and deploy, or change it in the Cloudflare dashboard (Workers → otw-ai → Settings → Variables).
