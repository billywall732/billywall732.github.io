# The AI Worker

Contrail's Gmail import uses this Cloudflare Worker to read booking emails it can't parse on its own. It has one endpoint:

`POST /v1/contrail/parse-email` takes `{ subject, from, date, text }` and returns `{ result, remaining }`.
- `result` is `{ kind: "flight" | "stay" | "cancellation" | "none", confirmation, cancel_kind, legs[], stay }`.
- `text` is the email's plain text, at most about 12,000 characters, cut down in the member's browser.

The Worker owns the model (`MODEL`, Claude Haiku 5.5), the system prompt and the strict JSON schema, so a page can't change what it asks Claude. Wallet's AI features will come here later.

## Who gets an answer

Every request goes through these checks in order (`src/index.js`):

1. **Origin:** only `ALLOWED_ORIGINS` (offthewall.dev and `http://localhost:8080`). Anything else gets 403.
2. **Sign-in:** the caller's Supabase access token is checked against the project's published signing keys: signature, expiry, issuer and audience. The account must be real (not anonymous) with a verified email. Otherwise 401.
3. **Member:** the caller's own row in `members`, read with their own sign-in so row-level security applies. They must be **active** with the **Gmail** switch on (set on `/admin/`). Otherwise 403.
4. **Kill switch:** if `AI_ENABLED` isn't `"true"`, the answer is 503 and Claude isn't called.
5. **Daily limit:** a count per person per day (Pacific time) in the `USAGE` KV namespace. The limit is `BACKFILL_LIMIT` (300) for the first `BACKFILL_DAYS` (7) after someone's first sync, then their "AI a day" number from the admin page. Over the limit is 429, and the count resets the next day.

Over-long input gets 413 without calling Claude.

## What's kept

- Email text is never stored or logged.
- Each request writes one log line with the task, the first 16 hex characters of a SHA-256 of the text, the outcome and the token counts.
- KV holds only the per-day counts, which expire after 2 days, and each person's first-sync date.
- The Claude API key is a Worker secret. It's never in this repo or on any page.

The final backstop on cost is the monthly spend limit in the Claude Console.

## Test it

```
node worker-ai/test.mjs
```

This needs no network. It runs every gate above against stand-ins: a test signing key, a fake members table, KV and the Claude API.

## Set it up (once)

```
cd worker-ai
npx wrangler kv namespace create USAGE      # paste the id into wrangler.toml
npx wrangler secret put ANTHROPIC_API_KEY   # paste the key when asked; it never goes in a file
npx wrangler deploy
```

The Worker's address, `https://otw-ai.offthewall-dev.workers.dev`, is `workerUrl` in `shared/config.js`.

To pause all AI calls straight away, set `AI_ENABLED = "false"` in `wrangler.toml` and deploy, or change it in the Cloudflare dashboard (Workers → otw-ai → Settings → Variables).
