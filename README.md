# NEXORA — pre-launch audit

Full pass over the codebase looking for anything that would break at
launch: broken routes, dead links, config gaps, and security holes.
Backend was syntax-checked file-by-file, its full require graph was
loaded (every route file's controllers/middleware actually resolve),
and the frontend was production-built clean. Every route→controller
wire-up and every `<Link>`/`navigate()` target in the frontend was
cross-checked against declared routes — **no broken routes or missing
page components found.**

The real issues were all in configuration and security, not routing.
In order of severity:

## 1. CRITICAL — Payment webhooks had no authentication
`POST /api/v1/payments/webhooks/malipopay` and `.../webhooks/selcom`
accepted **any** POST request with no verification of who sent it.
Concretely, anyone who found the URL could run:

    POST /api/v1/payments/webhooks/malipopay
    { "reference": "ORDER-123", "status": "SUCCESS" }

...and order #123 (or a seller's verification fee) would be marked paid
with no money having moved. This is the single most serious finding —
exploitable, no special access needed, directly affects money.

**Fixed**: added `webhookAuth.middleware.js`, which checks a shared
secret sent as an `x-webhook-secret` header, applied to both webhook
routes. **Fails closed in production** — if the secret env var isn't
set, the webhook is rejected, not silently allowed through.

**Action needed from you**: set `MALIPOPAY_WEBHOOK_SECRET` and/or
`SELCOM_WEBHOOK_SECRET` in your backend `.env`, and configure your
provider to send that same value as a custom header on their webhook
callback (check their dashboard for "custom headers" on the callback
URL). If MalipoPay/Selcom instead sign requests with HMAC (many
providers do), that's strictly stronger than a static secret — swap
this out for verifying their real signature once you have their actual
webhook documentation or sandbox access.

## 2. CRITICAL — Mobile money payments will hard-fail at launch
`MOBILE_MONEY_PROVIDER` is read by the code (`providers/mobileMoney.provider.js`)
but was **never set** in your `.env`. The code deliberately fails closed
in production: with `NODE_ENV=production` and no provider selected,
**every** checkout and **every** seller verification fee payment throws
`"Mobile money is not configured for production"`. Right now this is
silently masked because `NODE_ENV=development`, which falls back to a
simulated provider — the moment you flip to `NODE_ENV=production` for
the real launch, payments break for everyone with no code change
needed to trigger it.

Nothing to fix in code here — your MalipoPay credentials
(`MOBILE_MONEY_API_BASE_URL`, `MOBILE_MONEY_API_KEY`) are already
populated in `.env`, which strongly suggests MalipoPay is the intended
provider.

**Action needed from you**: add `MOBILE_MONEY_PROVIDER=malipopay` to
your production `.env` before going live. (If you're actually using
Selcom instead, use `MOBILE_MONEY_PROVIDER=selcom` and also set
`MOBILE_MONEY_VENDOR_ID`, which Selcom requires and which isn't
currently in your `.env` either.)

## 3. HIGH — No `trust proxy` setting (breaks rate limiting on Render)
Render (like any PaaS) puts your app behind a reverse proxy. Without
`app.set("trust proxy", 1)`, Express's `req.ip` resolves to the proxy's
own IP for every single visitor — meaning the rate limiter would count
*all* your real users' combined traffic against one shared bucket.
Practical effect: normal traffic from a handful of real users could
trip the general rate limit and lock out the entire site within
minutes of going live, or (depending on how express-rate-limit
validates this) requests could start erroring outright.

**Fixed**: added `app.set("trust proxy", 1)` in `app.js` — trusts
exactly one hop (Render's own proxy), not the full forwarding chain,
which is what prevents someone from spoofing their own IP via a fake
header.

## 4. HIGH — `DB_SSL` / `DB_SSL_REJECT_UNAUTHORIZED` were set in `.env` but never read
Three separate copies of the DB connection SSL logic existed (`backend/src/config/db.js`,
`database/migrate.js`, `database/seed.js`), and all three only checked
for a CA certificate file/content — never the `DB_SSL` or
`DB_SSL_REJECT_UNAUTHORIZED` variables that were actually sitting in
your `.env`. Most managed MySQL (PlanetScale, Aiven, RDS, DigitalOcean
managed DB) requires SSL but doesn't hand you a CA file to pin - the
usual pattern there is exactly `DB_SSL=true` +
`DB_SSL_REJECT_UNAUTHORIZED=false`, which is what you had set, and
which was being silently ignored. Depending on your host's policy this
would have meant either the app failing to connect to the database at
all, or connecting unencrypted despite `DB_SSL=true` clearly signaling
otherwise.

**Fixed**: all three now respect `DB_SSL=true` (falls back to
`rejectUnauthorized: false` unless you also set
`DB_SSL_REJECT_UNAUTHORIZED=true`), while still preferring a real CA
cert (`DB_SSL_CA_PATH`/`DB_SSL_CA`) if you provide one — that path is
unchanged and is the stronger option.

## 5. MEDIUM — Socket connections accepted pre-2FA tokens
`auth.middleware.js` (REST) already rejects the short-lived tokens
issued mid-login-OTP-flow or mid-password-change (they carry a `typ`
claim specifically so they can never be used as a real session). The
Socket.io auth handshake never had the same check — meaning a leaked
pre-auth token (issued the moment someone enters email+password,
*before* they've entered their OTP code) could open a live socket
connection to that user's private channel, ahead of 2FA actually
completing.

**Fixed**: socket auth now rejects any token carrying a `typ` claim,
matching the REST-side rule exactly.

## 6. MEDIUM — No process-level crash safety net
Nothing caught `unhandledRejection` or `uncaughtException` at the
process level. A single uncaught async error anywhere outside a normal
request/response cycle (a socket handler, something in a future
fire-and-forget call that's missing a `.catch()`) would silently crash
the entire Node process for every user on the site, with no log trail
to diagnose what happened.

**Fixed**: `server.js` now logs `unhandledRejection`s (recoverable,
keeps running) and logs + exits cleanly on `uncaughtException` (Node's
own guidance is not to keep running after a truly uncaught synchronous
exception, since process state may be corrupted) — Render restarts the
process automatically after an exit, so this trades "silent full
outage" for "brief logged restart." Also added a `pool.on("error", ...)`
handler in `db.js` so a dropped DB connection at the pool level logs
instead of potentially tripping the new `uncaughtException` handler
over what's usually just a transient network blip.

## 7. LOW — `.env.example` never existed
Multiple files (`migrate.js`'s own docstring, several inline comments)
referenced `backend/.env.example` as if it existed — it didn't. Not a
functional bug, but exactly the kind of gap that causes real friction
the first time you redeploy from scratch, rotate a secret, or hand this
off to anyone else.

**Added**: `backend/.env.example` and `frontend/.env.example`, built
from an actual grep of every `process.env.X` / `import.meta.env.VITE_X`
reference in the codebase — not guessed, verified against what the code
actually reads. Also caught and fixed one thing while building it: a
frontend `.env.example` draft I wrote initially assumed a
`VITE_VAPID_PUBLIC_KEY` build-time var, but the actual code fetches
that key from the backend at runtime — corrected before finalizing.

## Confirmed fine, no action needed
- `.env` is properly gitignored and was **never** committed to git
  history (checked full history, not just the current tree)
- No SQL injection surface — every single query in the codebase uses
  parameterized `?` placeholders
- No XSS surface — zero uses of `dangerouslySetInnerHTML` anywhere in
  the frontend; React's default escaping covers the rest
- Global Express error handler exists and is mounted last, after all
  routes, as it should be
- Health check endpoint (`/health`) exists and actually checks DB
  connectivity rather than just returning 200 unconditionally
- `start` script correctly points to `server.js`
- Migration runner is idempotent (tracks applied migrations in a
  `schema_migrations` table) and all 25 migration files are
  sequentially numbered with no gaps or collisions

## Also noticed, not a bug
`MOBILE_MONEY_MERCHANT_CODE` is set in your `.env` but isn't referenced
anywhere in the code — harmless, just unused. Left it alone since
removing env vars from your real `.env` wasn't part of this pass and
it's not hurting anything.
