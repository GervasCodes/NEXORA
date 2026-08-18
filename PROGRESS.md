# NEXORA — Unified Master Roadmap Progress

Tracks progress against `NEXORA — Unified Master Roadmap (Moderation/UX + Nexora AI, combined)`.
See `README-phase-XY.md` for the detailed write-up of each completed phase.

## Part D — UI/UX & Platform Polish Remediation

Separate numbered roadmap (its own `README-phase-Pn.md` per phase). Same
per-phase workflow as Parts A/B/C: analyze → explain → modify only relevant
files → test → README → update this file → zip changed files only → stop
for approval.

| Phase | Description | Status | Details |
|-------|-------------|--------|---------|
| P1 | Design System Extraction | ✅ Done | [README-phase-P1.md](./README-phase-P1.md) |
| P2 | Metadata & Error Polish | ✅ Done | [README-phase-P2.md](./README-phase-P2.md) |
| P3 | Accessibility & Internationalization | ✅ Done | [README-phase-P3.md](./README-phase-P3.md) |
| P4 | Testing & Session Hardening | ✅ Done | [README-phase-P4.md](./README-phase-P4.md) |
| P5 | Backend N+1 Fixes & Read Replica Adoption | ✅ Done | [README-phase-P5.md](./README-phase-P5.md) |
| P6 | Database/DevOps CI Enforcement | Not started | |
| P7 | Security Verification | ✅ Done | [README-phase-P7.md](./README-phase-P7.md) |
| P8 | Analytics Visualization & Docs Correction | ✅ Done | [README-phase-P8.md](./README-phase-P8.md) |

P1 status detail: shared Button/Input/EmptyState/ErrorState components
built (Button is polymorphic via `as={Link}` for nav CTAs); all 8
dark-mode `bg-white` spots fixed; all 13 files with the duplicated
secondary-button className retrofitted; all ~44 genuine primary-CTA
buttons/links retrofitted (6 decorative badge dots and 1 structurally-
attached search-submit button intentionally left as-is — see README);
EmptyState/ErrorState wired into ProductGrid (Home + BrowseProducts) /
Orders / Bookings, including fixing two pages that previously swallowed
fetch errors into a misleading empty state. Input: all 23 fields missing
`focus-ring` fixed (exact count match, 7 files); Login/Register/
ForgotPassword/Checkout's clean text/email/tel/password fields converted
to the shared Input component; the bulk of the ~150 duplicated Input
classNames across seller/admin forms not yet componentized — flagged as
next up (P1c). 245/245 frontend tests passing, lint clean on all touched
files.

P2 status detail: `main.jsx`'s bare error-boundary fallback replaced with
a styled `ErrorFallback.jsx` reusing the 404 page's visual language
(reload + go-home CTAs). `react-helmet-async` installed and wired via
`HelmetProvider`; a new `PageMeta.jsx` component sets title + Open
Graph + Twitter Card tags. All 80 live page components now render
`PageMeta` (verified — zero gaps against the full `pages/` file list);
67 of those also set `noIndex` for dashboard/account/auth pages that
shouldn't be search-indexed. ProductDetail/StorePage/ServiceDetail (the
pages named as priority) get fully dynamic OG image/description from
real product/store/service data — OG prioritized over Twitter Card since
WhatsApp (the named sharing channel) reads OG tags. No dedicated OG
banner image exists in the repo yet; falls back to the square
`icon-512.png` rather than fabricating one — flagged as a follow-up.
245/245 tests passing (added a global `react-helmet-async` mock to
`setupTests.js` after the test suite caught `<Helmet>` throwing without
a `HelmetProvider` ancestor — documented inline), clean production build,
lint clean. Caught and fixed two real mistakes during this phase before
delivery: a batch-conversion script initially placed `PageMeta` inside a
subcomponent instead of the page itself on 3 files with a specific
trailing-helper-function shape (`SellerOverview.jsx`, `AdminDashboard.jsx`,
`AdminDispatch.jsx`), and two manual edits (`Login.jsx`,
`BookingDetail.jsx`) initially dropped a sibling JSX line — both classes
of mistake caught via cross-checking / re-viewing before running tests,
not left for the test suite to find.

P3 status detail: flagged a scope fork before writing code — spec said
"adopt react-i18next" but the repo already has a working 581-line
English/Kiswahili `DICTIONARY`/`t()` system (`LanguageContext.jsx`) used
across dozens of already-shipped files. User confirmed: extend the
existing system rather than introduce a redundant library. `jest-axe` +
`eslint-plugin-jsx-a11y` installed; axe assertions added to Checkout/
Bookings/BookingDetail plus a new `NewDispute.test.jsx` — these found and
fixed real bugs (unlabeled country-code `<select>` in shared `PhoneInput`,
4 disconnected `<label>`s in the dispute form, a "Payment method" heading
using `<label>` instead of `<fieldset>/<legend>`). Installing
`eslint-plugin-jsx-a11y` also fixed a real pre-existing gap (a disable-
comment in `NexoraAIDrawer.jsx` referenced a plugin that was never
installed) and surfaced 94 previously-invisible violations across 30
files — fixed everything within the 4 named i18n flows (Checkout,
Bookings/BookingDetail, dispute filing, registration) plus `PhoneInput`;
the rest documented with file-by-file counts, not silently left broken.
Notably the remaining-violation file list overlaps heavily with P1's
deferred Input-componentization list. `react/no-danger` added and smoke-
tested. i18n extended (English+Kiswahili together) to all 4 named flows:
registration's identity-verification step, checkout, all 4 delivery-agent
pages, and dispute filing/list/detail (buyer-facing portions — admin-only
resolution panel deliberately left English, documented as a scoping
decision). 252/252 tests passing (245 + 7 new axe tests), clean build,
lint clean on all touched files. The "add a CI accessibility check" item
could not be done — same missing `.github/workflows` blocker as before
P1, now blocking two phases' worth of CI-dependent items.

P4 status detail: session-token migration from localStorage to an
httpOnly, SameSite=strict cookie + CSRF (double-submit cookie pattern)
completed and genuinely verified — real supertest cookie-jar requests
against the actual Express app, not mocked-away logic. Backward-
compatible design: Bearer header still works server-side (auth.middleware,
socket.js), so the 6 existing Bearer-based backend tests needed zero
changes. New `POST /auth/logout` and `GET /auth/me` endpoints. 813 backend
unit + 79 integration tests passing (7 new cookie/CSRF tests + 1 extended
socket test). Frontend's AuthContext.test.jsx fully rewritten (old mock
would have crashed under the new GET /auth/me on-mount check) — 256
frontend tests passing. Playwright installed and configured for Home/
Checkout/ProductDetail at mobile+desktop (6 test combinations), fully
route-mocked against hand-written fixtures (deterministic, no live
backend or external network needed) — but **cannot be executed or have
baseline snapshots generated in this sandbox**: cdn.playwright.dev isn't
in the network allowlist, confirmed directly (`npx playwright install`
fails). Config/specs verified parseable via `npx playwright test --list`
(6/6 tests found) but never run. No fabricated snapshot images included.
README gives exact commands to generate real baselines in an environment
with network access. Self-caught bugs during this phase: an early fixture
draft used external picsum.photos URLs, contradicting the "deterministic"
design goal stated in the same file - caught and fixed before delivery;
vitest's default glob picked up the new e2e/*.spec.js files and tried to
run them as vitest tests - fixed with an explicit exclude in
vite.config.js, verified by re-running the full suite. Honest limitation
flagged in README: supertest verification is real HTTP-layer testing but
not the same as confirming actual browser cookie/SameSite behavior;
recommended one manual browser pass before production.

P5 status detail: N+1 batching - order.service.js's cancelOrder/
autoCancelStaleOrder now use a single batched
`updateOrderStatusForChildren` (mirrors the existing
updatePaymentStatusForChildren pattern) instead of a per-child UPDATE
loop; autoCancelStaleOrder additionally dropped an unnecessary
findChildOrders SELECT it only used to loop over. payment.service.js's
wallet-crediting webhook loop turned out to be two different things:
the outer per-child-order loop is genuinely N separate transactional
units of work (correctly left alone), while the inner per-item
markItemCredited loop (different commission/net amounts per item) got
batched into one CASE-WHEN UPDATE via new markItemsCredited - given a
dedicated direct SQL-correctness test (not just an indirect
call-was-made assertion) since hand-built CASE WHEN SQL is exactly where
placeholder misalignment bugs hide. Read-replica adoption: checked every
candidate function's actual call sites for read-after-write/pre-write-
validation risk before moving anything (grepped, not assumed) - moved
product/service browsing+detail, store public pages, and review
listings/rating-summaries to dbRead (confirmed via source read to be a
complete no-op today with no DB_READ_HOST set - same pool object,
verified via the full integration suite still passing unchanged).
817 unit + 79 integration tests passing, lint clean (lint itself caught
one real thing: store.repository.js's db import went dead once both its
functions moved to dbRead - fixed before delivery). Two existing test
files updated to match the new batched behavior, not weakened.

P7 status detail: found and fixed a real open redirect -
`subscription.controller.js`'s subscribeSnippe/subscribeMalipopayCard/
subscribePaypal were forwarding client-supplied successUrl/cancelUrl/
returnUrl straight to the payment provider with no validation at all,
unlike every one of payment.controller.js's 8 equivalent endpoints
(which already used a private `assertAllowedRedirect`). Extracted that
check into `utils/redirectValidator.js`, applied it to all three
previously-unchecked endpoints, and added a `javascript:`/`data:`
protocol rejection as defense-in-depth. Audited the rest of the app for
redirect surfaces (zero `res.redirect()` calls anywhere - API-only
backend; every frontend `navigate()`/`window.location.href` traced to a
hardcoded path, same-origin URL, or same-origin service-worker message)
- no further issues found. Re-verified MalipoPay/Selcom webhook
verification against their public docs: the mechanisms themselves
(MalipoPay per-request payloadSignature, Selcom static bearer token,
both Phase 2) are correct and strong, but `docs/WEBHOOK_VALIDATION.md`
and a `payment.controller.js` header comment were stale, still
describing/referencing a generic shared-secret check that Phase 2 had
already superseded - both corrected. Added a payload-shape check
(reference/transid must be a non-empty string) in `malipopayWebhook`/
`selcomWebhook` so an authenticated-but-malformed payload fails cleanly
instead of surfacing as an unhandled-exception error log. New
`backend/tests/fixtures/webhookPayloads.js` gives both providers'
documented sandbox shapes one canonical, working (signature-computing)
home instead of re-deriving them from test setup code. Honestly flagged
in the README/doc rather than silently closed: full webhook-payload
docs for both providers sit behind a merchant login this environment
doesn't have access to, so a live-sandbox round trip is still an open
item before go-live. Tests not run/modified per the brief; changes
syntax-checked and the new fixtures file smoke-run standalone.

P8 status detail: most of P8's backend (custom `?start=&end=` date-range
comparison on top of A5's fixed week/month windows, and seller-facing
`getSellerLeaderboardStanding`) already existed going into this phase,
and `AdminDashboard.jsx` was already fully wired to it (date pickers,
a `BarChart` visualizing the comparison, platform-wide leaderboard).
`SellerAnalytics.jsx` was not — it had the custom-range state and API
call wired but no date-picker UI, no chart, and the already-fetched
`leaderboardStanding` was never rendered; this phase closed that gap
(picker, chart, top-5 + own-rank leaderboard card), no backend changes
needed. Also fixed: `AdminUsers.jsx`'s mobile layout (identity, badges,
and actions were one unpredictable wrapping row; now grouped into
separate rows that stack cleanly on phone width). `MobileBottomNav.jsx`
was reviewed and left as-is - already correct (proper touch targets,
safe-area padding, no overlap with the floating AI button or page
content). Checked the rest of the app for the same raw-`<table>` /
cramped-list-row mobile issues: the one other table
(`AdminSubscriptions.jsx`) already has `overflow-x-auto`; the same
wrapping-row list pattern exists on ~20 other admin/seller pages with
fewer elements per row than `AdminUsers.jsx` had, so none of those were
touched this phase - flagged in the README as a possible follow-up
rather than done speculatively. Tests not run per the brief. See
[README-phase-P8.md](./README-phase-P8.md) for the full write-up,
including the A5-row/`README-phase-A5.md` correction this phase's
docs-correction scope covered (found already fixed going into P8,
detailed there for the record).

**Follow-up (post-P8) — `AdminUsers.jsx` touch targets & wrap:** Suspend/
Unsuspend and Permanently delete buttons were ~30px tall on mobile
(too small to reliably tap); both now enforce a 44px minimum tap
height. The suspension-reason line (`Suspended ... — "reason"`) was
truncating with an ellipsis and unreadable on narrow screens; it now
wraps instead. Also gave the row a lightly nicer desktop/wide-screen
treatment while in the file: slightly larger row padding/gap, a
subtle hover highlight per row, and matching shadow/hover styling
between the two action buttons. Scope limited to `AdminUsers.jsx`
only. Tests not run per the brief.

**Follow-up — vitest worker-spawn timeouts on Windows:** a local
Windows run showed 232/232 tests passing across all 39 files, but
Vitest logged 3 "Failed to start forks worker" / "Timeout waiting
for worker to respond" errors for `Checkout.test.jsx`, `Login.test.jsx`,
and `MessageSearch.test.jsx` — a worker-process spawn/response
timeout, not a real test failure (confirmed: nothing unusual about
those 3 files vs. the other 36 that started fine). `vite.config.js`'s
`test.pool` switched from the default `forks` (child-process fork per
worker, capped at `maxForks: 4`) to `threads` (`worker_threads`,
capped at `maxThreads: 2`) — threads are far cheaper to spin up on
Windows (no new process + AV scan per worker), which is the standard
fix for this symptom; `testTimeout`/`hookTimeout` also raised from
15s to 20s for extra headroom. Not independently re-run in this
sandbox (no vite/vitest install here); syntax-checked only. Scope
limited to `vite.config.js`.

**Follow-up — stale-session 401 burst + WebSocket failure + SW navigate
error:** browser console showed `/notifications/unread-count` and
`/admin/notifications/unread-count` both returning 401, a WebSocket
handshake failing right alongside them, and a service-worker
`FetchEvent` for `/login` resolving as a raw network-error response.
Root cause: `NotificationBell.jsx`/`AdminNotificationBell.jsx`'s
polling and `SocketContext.jsx`'s socket connection all gated on
`AuthContext.jsx`'s `user` value alone - but that value is
optimistic-only on first paint (read straight from `localStorage`,
unconfirmed - see the existing comment on `loadStoredUser`), so a
stale cached session fires protected requests (and opens a socket
handshake) against a cookie the server has already invalidated,
before the async `/auth/me` confirmation has a chance to catch it.
Added a new `sessionReady` flag to `AuthContext.jsx` that only
flips true once that confirmation settles (or immediately, if there
was no cached user to confirm) and gated all three consumers on
`user && sessionReady` instead of `user` alone - `SocketContext.jsx`,
`NotificationBell.jsx`, `AdminNotificationBell.jsx`, and the two
`useUnreadMessagesCount` call sites (`Header.jsx`, `SellerLayout.jsx`).
Separately, `public/sw.js`'s navigation fallback chain's true last
resort (network failed, no cached copy, pre-cached offline page
itself missing) used to resolve with `Response.error()` - not a
rejected promise, but still a network-error-typed Response by spec,
which is exactly what produces the browser's own "resulted in a
network error response" console error for a navigation. Replaced it
with a synthesized minimal real HTML response so every branch of
that chain now ends in something the browser can actually render.
Not independently re-run in this sandbox (no npm install here);
each touched `.jsx` file was esbuild-syntax-checked, `sw.js`
node-syntax-checked. Note: the same optimistic-`user` pattern also
exists in the route guards (`RequireAuth.jsx`, `RequireAdmin.jsx`,
etc.), which can briefly render protected content before `/auth/me`
corrects it - left untouched here since it's a separate, larger
concern than the reported console errors; flagged as a possible
follow-up.

**Follow-up — root cause of the 401s/WS failure/instant "session
expired": `SameSite=Strict` session cookie.** The `sessionReady`
gating fix above was a real improvement (stops firing requests
before the session is confirmed) but didn't fully explain reports of
being logged out immediately after a successful login/OTP-verify -
that's not a timing race, it's every cross-site call being unable to
carry the cookie at all. Frontend (`nexoramarketplace.online`) and
backend (an onrender.com subdomain) are different registrable
domains, so every fetch/XHR/socket.io call between them is a
cross-site request from the browser's perspective - and
`backend/src/utils/sessionCookie.js` had both `nexora_session` and
`nexora_csrf` set with `sameSite: "strict"`. Strict cookies are never
attached to cross-site requests, so the browser silently sent none of
these calls with the session cookie: the very first authenticated
call after login (a notification poll, or the socket handshake)
looked exactly like a logged-out request to the server, got a 401,
and (since `nexora_user` had just been cached) the frontend correctly
but confusingly reported "session expired" - not a bug in that
logout logic, a real absence of the cookie. Changed `sameSite` to
`"none"` in production (paired with the `secure: true` it already
had there - required together) and left it `"lax"` for local dev
(frontend/backend both on `http://localhost`, same-site, doesn't
need `None`/HTTPS). Confirmed this is the only place either cookie's
`sameSite` is set (`grep -rn "sameSite" backend/src`) and that
CORS (`app.js`) and the socket.io server (`socket/socket.js`) both
already had `credentials: true` with an explicit origin list, so
no other backend change was needed for the cookie to start working
cross-site. Syntax-checked only (`node --check`); not deployed or
re-tested against the live Render backend from this sandbox - worth
confirming login stays working end-to-end after deploy. Scope
limited to `backend/src/utils/sessionCookie.js`.

## Part C — Red Flag Remediation

Separate numbered roadmap (its own `README-phase-RFn.md` per phase),
addressing red flags from the independent due-diligence analysis
(`NEXORA-Analysis-Report.pdf`). Same per-phase workflow as Parts A/B.

| Phase | Description | Status | Details |
|-------|-------------|--------|---------|
| RF1 | Logging & Observability Cleanup | ✅ Done | [README-phase-RF1.md](./README-phase-RF1.md) |
| RF2 | Database Query Audit (Findings Only) | ✅ Done | [README-phase-RF2.md](./README-phase-RF2.md) |
| RF3 | N+1 Query Batching | ✅ Done | [README-phase-RF3.md](./README-phase-RF3.md) |
| RF4 | Indexing + Connection Pool Tuning | ✅ Done | [README-phase-RF4.md](./README-phase-RF4.md) |
| RF5 | Redis Caching Layer | ✅ Done | [README-phase-RF5.md](./README-phase-RF5.md) |
| RF6 | API & Architecture Docs | ✅ Done | [README-phase-RF6.md](./README-phase-RF6.md) |

## Part C — Red Flag Remediation: complete

All six phases (RF1–RF6) are done.


## Part A — Admin/Seller Moderation & UX Improvements

| Phase | Description | Status | Details |
|-------|-------------|--------|---------|
| A1 | Admin Service Moderation | ✅ Done | [README-phase-A1.md](./README-phase-A1.md) |
| A2 | Layout & Scroll Behavior (admin + seller panels) | ✅ Done | [README-phase-A2.md](./README-phase-A2.md) |
| A3 | Messaging UX | ✅ Done | [README-phase-A3.md](./README-phase-A3.md) |
| A4 | Products & Services List UI/UX (admin + seller) | ✅ Done | [README-phase-A4.md](./README-phase-A4.md) |
| A5 | Advanced Analytics (admin + seller dashboards) | ✅ Done | [README-phase-A5.md](./README-phase-A5.md) |

## Part B — Nexora AI

| Phase | Description | Status | Details |
|-------|-------------|--------|---------|
| B1 | Foundation (buyer-facing, advisory/read-only) | ✅ Done | [README-phase-B1.md](./README-phase-B1.md) |
| B2 | Seller/Provider AI (draft-generation, no auto-execute) | ✅ Done | [README-phase-B2.md](./README-phase-B2.md) |
| B3 | Admin AI Copilot (advisory only, never auto-acts) | ✅ Done | [README-phase-B3.md](./README-phase-B3.md) |

## Part B — Nexora AI: complete

All three phases (B1, B2, B3) covering roadmap items #1-15 are done.

## Notes

- Workflow followed per phase: analyze existing code → explain planned
  changes → modify only relevant files → test → write/update
  `README-phase-XY.md` → update this file → zip only changed files → stop
  and wait for approval before starting the next phase.
- Part B's global constraints (data & truth, money & moderation, reliability
  & cost, content safety, design/placement) apply to every AI phase and
  should be re-checked against each new phase's diff before it ships, not
  just at B1 kickoff.
