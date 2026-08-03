# Scalability Report — Phase 4 (Engineering & Scalability)

This document covers the same ground `docs/ARCHITECTURE_REVIEW.md` maps
at a system level, but scoped to Phase 4's five objectives: moving
scheduled jobs off the web process, single-instance locking, a MySQL
read-replica strategy, the duplicate `NewDispute` bundle investigation,
and payment-webhook integration test coverage. It documents what changed,
why, what deliberately did *not* change, and what's left as a follow-on.

## 1. Scheduled jobs → dedicated worker process

**Before:** `server.js` called `startJobs()` directly, so every cron job
(`escrowRelease`, `bookingLifecycle`, `staleOrders`, `otpCleanup`,
`sponsorshipExpiry`, `featuredStoreExpiry`, `departmentSponsorshipExpiry`,
`departmentMaintenanceSchedule`, `webhookReplayCleanup` — see
`src/jobs/index.js`) ran inside the same Node process handling HTTP
traffic. Two problems:

- Jobs and requests shared one event loop and one DB pool
  (`connectionLimit: 10`) — a slow job tick could add request latency
  (or vice versa), and neither could be tuned/scaled independently.
- The web process couldn't be scaled horizontally without every replica
  also running its own copy of every cron job — e.g. 3 web replicas
  would each fire `escrowRelease` at :15 past the hour, tripling the
  actual escrow-release work and notification volume.

**After:** `backend/worker.js` is a new, minimal entrypoint —
Sentry init, `envCheck`, `startJobs()`, nothing else (no `http.Server`,
no `socket.init`). Run it as its own process:

```
npm run worker        # production
npm run worker:dev     # nodemon, for local development
```

On Render (see `docs/DEPLOYMENT.md`) this is a second service: a
**Background Worker** pointed at `node worker.js`, alongside the
existing **Web Service** pointed at `node server.js`. The same pattern
applies to a second Docker/PM2 process on any other host.

**Backward compatibility:** `server.js` still calls `startJobs()` by
default. A new `RUN_JOBS_IN_PROCESS` env var (default unset/`true`)
guards it — see `.env.example`. An existing single-process deployment
that never sets up `worker.js` keeps working completely unchanged. Once
a worker is deployed, set `RUN_JOBS_IN_PROCESS=false` on the web
process(es) so jobs run in exactly one place. Leaving it unset alongside
a running worker is redundant, not unsafe — see the locking section
below.

## 2. Single-instance locking

Splitting jobs into their own process opens the door to running more
than one worker replica for redundancy — but node-cron has no
cross-process awareness: two replicas both scheduling `* * * * *` will
both fire, every tick. Without a lock, that means double escrow
releases, doubled booking-lifecycle notifications, etc. the moment
anyone scales the worker past one replica (intentionally, or via a
platform auto-restart briefly overlapping the old and new instance).

**Implementation:** `src/utils/dbLock.js` wraps a job run in a MySQL
session-level advisory lock (`GET_LOCK` / `RELEASE_LOCK`) rather than
adding a new dependency (Redis, a jobs table, etc.) — the project
already runs MySQL, and advisory locks are exactly what they're for:
named, server-side mutexes needing no schema. `src/jobs/index.js`'s
`safeRun` wrapper now acquires `nexora:job:<name>` with a 0-second wait
(try once, don't block) before running each job; a tick that can't
acquire the lock logs a one-line skip and returns — the next tick tries
again. A lock is held by the specific pooled connection that acquired
it and is explicitly released in a `finally` block; if a worker process
crashes mid-job, MySQL releases the lock automatically when that
connection's session ends, so a crash can never leave a job
permanently stuck.

This is a no-op safety net for the common single-replica case (nothing
to contend with — every tick acquires and releases cleanly) and makes
future worker scaling safe with no further code changes. It also means
running the worker's jobs in *both* the web process and a separate
worker simultaneously (e.g. mid-migration, before `RUN_JOBS_IN_PROCESS`
is flipped) is redundant rather than duplicative — only one of the two
ever actually executes a given tick.

Covered by `tests/unit/utils/dbLock.test.js` (acquire/run/release,
skip-when-held, release-on-throw, release-on-RELEASE_LOCK-failure).

## 3. MySQL read-replica strategy

**What shipped this phase:** infrastructure only, fully opt-in,
zero behavior change by default — `src/config/dbRead.js`. If
`DB_READ_HOST` is unset, this module re-exports the *same* primary pool
object from `src/config/db.js`; requiring it is a complete no-op. If
`DB_READ_HOST` is set, it creates a second `mysql2` pool against that
host, falling back to the primary's user/password/database/SSL settings
for anything not explicitly overridden with a `DB_READ_*` var (the
common case: a same-provider read replica with the same credentials, a
different host). See `.env.example` for the full var list and
`tests/unit/config/dbRead.test.js` for the fallback/override behavior.

**Why infra-only this phase:** every existing repository still imports
`../config/db` untouched — nothing was rewired to actually use the
replica pool yet. That's intentional, per this phase's restrictions
(reuse existing architecture, don't modify unrelated functionality,
preserve backward compatibility): swapping real read traffic onto a
replica is a per-repository, per-query decision that depends on how
tolerant each query is of replication lag, and doing that broadly in
one pass is exactly the kind of change that risks subtle bugs (a
read-after-write within the same request silently seeing stale data).

**Adoption plan (follow-on work, not done here):**

1. **Good first candidates** — read-heavy, lag-tolerant, no
   read-after-write requirement in the same request: product/service
   browsing and search (`product.repository.js`, `service.repository.js`),
   store pages, review listings, admin analytics/reporting queries.
   Swap `require("../config/db")` for `require("../config/dbRead")` in
   just those functions' `SELECT`s.
2. **Must stay on the primary unconditionally:** anything that reads a
   row it (or the same request) just wrote — order confirmation right
   after `INSERT`, payment status right after a webhook's `UPDATE`,
   wallet balance right after a credit — and anything inside a
   transaction (`getConnection()`/`beginTransaction()` already pins a
   single dedicated connection, which is correct and shouldn't change).
3. **Operational prerequisite:** provision the actual MySQL replica
   (managed-provider read replica, or `mysqldump`+binlog replication for
   self-hosted) before setting `DB_READ_HOST` anywhere — this phase
   ships the code path, not the database infrastructure itself.
4. Roll out module-by-module behind code review, watching for
   replication-lag-sensitive UX regressions (e.g. "I just posted a
   review and it's not showing up yet").

## 4. Duplicate `NewDispute` bundle/chunk investigation

**Symptom reported:** duplicate `NewDispute` chunks in the built
frontend bundle.

**Root cause found:** not a code-level duplicate-import bug. Every
route in `frontend/src/App.jsx` is `lazy(() => import("./pages/X"))`
exactly once — `NewDispute` included (`src/App.jsx:48`). The actual
issue was in the shipped `frontend/dist/` directory itself: it
contained the output of **two separate builds**, roughly five days
apart (file mtimes: 2026-07-26 and 2026-07-31), never cleaned between
them. That pattern wasn't unique to `NewDispute` — checking the whole
`dist/assets` directory showed the same doubling across nearly every
route chunk (`SellerWallet`, `StorePage`, `OrderDetail`, `Disputes`,
`DisputeDetail`, `SellerDisputes`, `AdminDisputes`, etc. — over 70 of
~90 files were duplicated), `NewDispute` was simply the pair someone
happened to notice.

Vite's `build.emptyOutDir` already defaults to `true` for an `outDir`
inside the project root (the default here), so a plain `vite build` run
twice in a row *should* have self-cleaned — the likely explanation is
an interrupted first build, a manually copied/merged `dist/`, or a
deploy step that copied build output into place without clearing the
target first. `frontend/dist/` is git-ignored (never committed), so
this was a local/deploy-time artifact, not something in source control.

**Fix (defense in depth, two layers):**

1. `frontend/vite.config.js` — added an explicit
   `build: { emptyOutDir: true }`. Functionally the same as Vite's
   default here, but makes the guarantee explicit and immune to a
   future `outDir` change silently flipping that default (Vite's
   default depends on whether `outDir` is inside the project root).
2. `frontend/package.json` — added a `prebuild` script (npm runs this
   automatically before `build`) that force-removes `dist/` outright
   before Vite even starts, so a stale directory can never survive
   regardless of *why* it was stale (interrupted build, manual copy, a
   deploy pipeline that doesn't clean between builds).
3. Regenerated the bundle with a clean build to fix what's shipped in
   this deliverable's ZIP — verified below.

**Verification:**

```
$ npm run build
...
✓ built in 10.45s
$ ls dist/assets | sed -E 's/-[A-Za-z0-9_-]{8,10}\.js$//' | sort | uniq -c | sort -rn | head -3
      1 storeThemes
      1 mapConfig-Dgihpmma.css
      1 mapConfig
$ ls dist/assets | grep -c '^NewDispute'
1
```

Every chunk (including `NewDispute`) now appears exactly once; total JS
file count dropped from 150+ to 91. All 198 existing frontend tests
(`npx vitest run`) still pass against the change.

## 5. Payment webhook integration/E2E test coverage

`tests/integration/payment.webhooks.test.js` already covered, well,
per-provider auth/signature verification (MalipoPay `payloadSignature`,
Selcom bearer token, Snippe HMAC) plus one happy-path processing test
per provider. Added `tests/integration/payment.webhooks.resilience.test.js`
to cover what runs *after* that check — the gaps were:

- **Idempotency** — a provider retrying a webhook it already delivered
  successfully (completed *or* failed) must be a no-op: no
  double-charge, no re-notification, no query beyond the read that
  decides "already processed."
- **The failure branch** — every existing test only exercised
  `status: "SUCCESS"`; nothing asserted `markFailed` actually runs (and
  `markCompleted` doesn't) when a provider reports a decline/failure.
- **Booking payments** — the original file's fixtures were all
  `ORDER-<id>`; `BOOKING-<id>` references (same generic webhook
  endpoints, routed by `payment.service.js#handleProviderWebhook`'s
  regex) had zero webhook-level coverage — success, failure, and
  idempotency, all now covered.
- **True duplicate-delivery rejection** — `webhookReplayGuard`'s own
  logic was unit-tested (`tests/unit/payment/webhookReplayGuard.test.js`),
  but nothing exercised the actual HTTP path: a real
  `ER_DUP_ENTRY`-driven rejection inside `webhookAuth.middleware.js`,
  asserting the request never reaches `payment.service` at all (exactly
  one `db.query` call — the failed `INSERT` — not the six-plus a
  processed webhook would make).
- **Unrecognized reference shape** — confirms a malformed/unexpected
  `reference` value fails safely (200, not a 5xx that would make a
  provider retry-storm forever), matching the existing "fail closed but
  don't 5xx" philosophy documented throughout `payment.controller.js`.

9 new tests, all passing; full backend suite (`npm test`) is 47 suites /
706 tests passing (up from 42 suites / 674 tests before this phase — the
9 new webhook tests plus 9 more for `dbLock.js`/`dbRead.js`), 0
regressions.

## What deliberately did not change

Per this phase's restrictions:

- No repository was rewired onto `dbRead.js` — see §3's rollout plan.
- No existing job's business logic changed — only how/where it's
  scheduled and locked.
- No existing webhook behavior changed — only new tests were added; the
  duplicate-delivery and idempotency behavior asserted above already
  existed in `payment.service.js` / `webhookAuth.middleware.js`, this
  phase just proved it with tests.
- `frontend/dist/` isn't source and isn't part of this phase's shipped
  ZIP (see the file list) — it's build output regenerated by
  `npm run build`, now guaranteed clean by the two fixes in §4.
