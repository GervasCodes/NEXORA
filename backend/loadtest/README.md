# Load testing

A basic [Artillery](https://www.artillery.io/) script covering the three
flows this phase's brief asked for: product listing/search, product
detail, and checkout. Lives here rather than a top-level doc since it's
closely tied to `nexora-load-test.yml` right next to it.

## Running it

```bash
cd backend
npm install                 # installs artillery as a devDependency
LOADTEST_TARGET=http://localhost:5000 npm run loadtest
```

Point `LOADTEST_TARGET` at whatever's running the backend - a local
`npm run dev`, or a real staging/production URL once you're ready to
test under realistic network conditions. Don't run this against
production without warning whoever's on call; `ensure.p95`/`maxErrorRate`
in the config will fail the run (non-zero exit) if latency or error
rate crosses the thresholds set there, which is useful in CI but also
means a real outage during the run shows up as a red exit code, not
just a report.

## Rate limiting

`apiLimiter` (`backend/src/middleware/rateLimit.middleware.js`) caps every
IP at 600 requests per 15 minutes across the whole API - a real load test
blows through that in well under a minute, at which point every request
gets a cheap, fast `429` instead of exercising real application code. A
run where `http.codes.429` is close to `http.requests` means this
happened - check that first before reading too much into otherwise-good
latency numbers.

To test past it, set a shared token on **both** the server and the
`LOADTEST_TARGET` environment before running:

```bash
# on the server (same terminal/session running `npm run dev`, or your
# host's env var settings - never set this in a real production env):
export NODE_ENV=development   # loadtestBypass refuses to activate if NODE_ENV=production, regardless of the token
export LOADTEST_BYPASS_TOKEN="some-random-string-you-pick"

# in the terminal running the load test:
export LOADTEST_BYPASS_TOKEN="some-random-string-you-pick"   # must match
export LOADTEST_TARGET=http://localhost:5000
npm run loadtest
```

If `LOADTEST_BYPASS_TOKEN` isn't set on the server, the header is simply
ignored and normal rate limiting applies - safe to leave the header in
the Artillery config permanently. `authLimiter` (login/OTP) is
deliberately NOT covered by this bypass; the checkout scenario's
pre-obtained session (below) exists partly because of that.

## Getting a session for the checkout scenario

The listing/search and product-detail scenarios need no auth. Checkout
does, and login in this app is OTP + httpOnly-cookie based (see
`backend/src/middleware/auth.middleware.js`) - not something to script
through on every virtual user. Instead:

1. Log in once as a real (or seeded test) buyer through the normal app
   or API, completing the OTP step.
2. Copy the `nexora_session` cookie value from your browser's dev tools
   (Application → Cookies) or from the `Set-Cookie` header if you
   logged in via `curl`/Postman.
3. Export it, along with a real shipping address for that account's
   region (checkout validation requires all of these - see
   `backend/src/modules/order/order.validator.js`):

```bash
export LOADTEST_SESSION_COOKIE="<the JWT value>"
export LOADTEST_SHIPPING_ADDRESS="123 Example St"
export LOADTEST_SHIPPING_CITY="Dar es Salaam"
export LOADTEST_SHIPPING_REGION="Dar es Salaam"
export LOADTEST_SHIPPING_PHONE="+255700000000"
```

If `LOADTEST_SESSION_COOKIE` isn't set, the checkout scenario's requests
get a fast 401 from the API rather than silently testing something
else - check the report's error breakdown if checkout numbers look
suspiciously fast/cheap compared to the other two scenarios.

The checkout scenario places real `cash_on_delivery` orders against
whatever account the session belongs to - use a seeded test buyer and a
test seller/product, not a real production account, unless you're
deliberately load-testing production and have a cleanup plan for the
orders it creates.

## Tuning

The default phases in `nexora-load-test.yml` (warm-up → ramp to 10/s →
sustained 10/s for 2 minutes) are a conservative first pass suitable for
a small or single-instance deployment - raise `arrivalRate` and phase
`duration` once you have a baseline and want to find where the API
actually starts degrading. Watch `backend/src/config/db.js`'s connection
pool (`DB_POOL_CONNECTION_LIMIT`, see `docs/DATABASE.md`'s Connection
pool section) - pool exhaustion is a likely first bottleneck before CPU
is, and the pool logs a warning (and optionally alerts Sentry) when
requests start queuing for a connection.
