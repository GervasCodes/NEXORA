# NEXORA

## Phase 10 — Testing

Adds an automated test suite (Jest + Supertest) and a CI workflow to the
backend, targeting the highest-stakes code first: **money** (payment
initiation, all four webhook paths, wallet crediting/withdrawals) and
**auth** (the two-step OTP login). Nothing here changes application
behavior — this phase is entirely additive (new `tests/`, `jest.config.js`,
`.github/workflows/ci.yml`, and dev dependencies).

### Why these modules first

`payment.service.js` and `wallet.service.js` are where a bug is most
expensive: a wrong branch there means a buyer is charged and never
credited, a seller order silently never gets paid out, or a forged
webhook marks an unpaid order as paid. `login.service.js`'s two-step
(password → OTP → session) flow is the other place where a subtle bug
has real consequences (a leaked pre-auth token acting as a session
token, for instance — which is exactly why `auth.middleware.js` rejects
any token carrying a `typ` claim, now covered by a test). `fraud.service.js`
and `deliveryPricing.js` are included because they're pure, explainable
rule/pricing logic that's cheap to get very high coverage on and easy to
regress silently.

### Test layout

```
backend/
  jest.config.js
  tests/
    setupEnv.js              # env vars injected before any module loads under Jest
    helpers/mockDb.js         # reusable mysql2-pool mock for integration tests
    unit/
      payment/payment.service.test.js       # 38 tests - every branch of every payment flow
      payment/snippe.provider.test.js       # HMAC webhook signature verification
      wallet/wallet.service.test.js         # crediting, withdrawals, admin approve/reject
      fraud/fraud.service.test.js           # all 3 rules + dedup ("flagOnce")
      auth/login.service.test.js            # 2-step OTP login, pre-auth token handling
      utils/deliveryPricing.test.js         # banded distance-fee pricing (pure logic)
      utils/appError.test.js
      i18n/i18n.test.js
    integration/
      health.test.js                        # GET /health, GET /, GET /api/v1/me auth gate
      auth.login.test.js                    # POST /auth/login + /auth/register validation, via supertest
      payment.webhooks.test.js              # webhook shared-secret auth + Snippe raw-body signature, via supertest
```

**Unit tests** mock every collaborator at the module boundary
(`jest.mock("./payment.repository")`, etc.) — no MySQL, no network, and
they run in well under a second. **Integration tests** run the real
`app.js` (routing → middleware → validation → controller → service →
repository) through `supertest`, with only `backend/src/config/db.js`'s
mysql2 pool mocked via `tests/helpers/mockDb.js` — so route wiring,
`express-validator` rules, and the webhook-auth/raw-body middleware are
exercised for real, without needing a live database in CI.

### What's covered

- **Payment service** (`payment.service.js`, 38 tests, 88% line / 78%
  branch coverage): mobile money initiate (including the "provider threw"
  vs "provider returned `success:false`" distinction, and that a payment
  is marked **pending**, never **completed**, until a webhook confirms
  it), Snippe/PayPal order + verification-fee checkout creation, PayPal
  capture (including the reference-recovery fallback when PayPal doesn't
  echo one back), Cash on Delivery (including the "can't confirm before
  `delivered`" guard), and — most importantly — `handleProviderWebhook`'s
  reference-routing and **idempotency** (a retried webhook for an
  already-`completed`/`failed` payment is a verified no-op, and a
  wallet-credit failure inside the webhook handler is confirmed to never
  reject the webhook response itself, per its fire-and-forget design).
- **Snippe webhook signature verification** (`snippe.provider.js`):
  valid signature accepted, missing header rejected, wrong signature
  rejected, and — importantly — a **tampered body with the original
  signature** is rejected (proves the HMAC actually covers the payload,
  not just presence-checked).
- **Wallet service** (`wallet.service.js`, 90% line coverage):
  multi-vendor commission splitting math (verified seller-by-seller),
  transactional rollback on a mid-transaction failure, withdrawal
  amount validation (zero/negative, exceeds balance), and the admin
  approve/reject/paid state machine including the reject-refunds-wallet
  path.
- **Fraud service** (`fraud.service.js`, 97% line coverage): all three
  rules (high-value first order, order velocity, withdrawal outlier)
  plus the `flagOnce` dedup (a rule already flagged and open is never
  flagged twice).
- **Login service** (`login.service.js`, 87% line coverage): wrong
  email and wrong password both return the same generic error (no
  user-enumeration signal), deactivated accounts are rejected even with
  the right password, a step-2 session token is only issued after OTP
  verification, and the password hash is stripped from the returned
  user object.
- **Delivery pricing** (`deliveryPricing.js`, 100% line coverage): band
  boundary inclusivity, sorting defensively, the beyond-last-band
  per-km charge (with rounding), and every malformed-config fallback
  path.
- **i18n helper** (`i18n/index.js`, 93% line coverage): locale
  resolution/normalization (including region subtags like `sw-TZ`),
  `Accept-Language` parsing, and the English-fallback chain for missing
  translations.
- **Integration**: the public `/health` endpoint's DB-up/DB-down
  branches (and that a DB-down response never leaks the raw driver
  error), `/api/v1/me`'s auth gate, the full login route through
  `express-validator` + the real controller, and — for webhooks — that a
  forged MalipoPay/Selcom request (wrong or missing
  `x-webhook-secret`) never reaches `payment.service` at all (asserted
  via `db.query` never being called), that the fail-closed-in-production
  behavior actually fails closed, and that the Snippe webhook route's
  `express.raw()` body-parser wiring in `app.js` still produces bytes
  `constructWebhookEvent`'s HMAC check can verify end-to-end.

### Coverage

`npm run test:coverage` enforces per-project thresholds (75% statements/
lines, 65% functions, 60% branches) scoped to the files listed above —
see `jest.config.js`'s `collectCoverageFrom`. Actual achieved coverage
across those files is **89% statements / 80% branches / 74% functions /
89% lines** (117 tests, all passing). The threshold is intentionally
narrower than "the whole backend" right now — see **What remains**.

### CI/CD (`.github/workflows/ci.yml`)

Two jobs, both on every push/PR to `main`:
- **`backend-test`** — `npm ci` + `npm run test:coverage`, matrixed
  across Node 18.x (the `engines.node` floor in `backend/package.json`)
  and 20.x, with the coverage report uploaded as a build artifact from
  the 20.x run.
- **`frontend-build`** — `npm ci` + `npm run build` (a `vite build`
  compile-check). There's no frontend test suite yet (see below), so
  this is a smoke test that every page/component at least imports and
  bundles cleanly — the same gap Phase 9's README flagged as unverified
  by tooling in this environment.

### Running tests locally

```bash
cd backend
npm install
npm test                # unit + integration, no coverage (fast)
npm run test:unit        # unit only
npm run test:integration # integration only
npm run test:coverage    # full run with the coverage report + thresholds enforced
```

No `.env`, MySQL instance, or network access is required — `tests/setupEnv.js`
injects the handful of env vars (`JWT_SECRET`, webhook secrets, dummy DB
vars) that modules read at `require()` time, and every real database/
network call is mocked.

### Modified files
- `backend/package.json` — `jest`, `supertest`, `cross-env` dev
  dependencies; `test`/`test:watch`/`test:coverage`/`test:unit`/
  `test:integration` scripts.

### Created files
- `backend/jest.config.js`
- `backend/tests/setupEnv.js`
- `backend/tests/helpers/mockDb.js`
- `backend/tests/unit/payment/payment.service.test.js`
- `backend/tests/unit/payment/snippe.provider.test.js`
- `backend/tests/unit/wallet/wallet.service.test.js`
- `backend/tests/unit/fraud/fraud.service.test.js`
- `backend/tests/unit/auth/login.service.test.js`
- `backend/tests/unit/utils/deliveryPricing.test.js`
- `backend/tests/unit/utils/appError.test.js`
- `backend/tests/unit/i18n/i18n.test.js`
- `backend/tests/integration/health.test.js`
- `backend/tests/integration/auth.login.test.js`
- `backend/tests/integration/payment.webhooks.test.js`
- `.github/workflows/ci.yml`

### Removed files
None.

**New environment variables**: none required at runtime — the ones
listed above (`tests/setupEnv.js`) only exist inside the Jest process.

**Migration required:** none — no schema changes.

### What was completed
- A real, running (not aspirational) Jest + Supertest test suite: 117
  tests across 11 suites, all passing, covering the payment/webhook/
  wallet/fraud/login modules described above with meaningful branch
  coverage (idempotency, transactional rollback, signature
  verification, fail-closed behavior), not just happy-path smoke tests.
- A GitHub Actions CI workflow that actually runs on push/PR: backend
  tests on a Node version matrix (18.x/20.x) plus a frontend build
  compile-check, with a coverage artifact uploaded for inspection.
- Confirmed, with a real assertion (`db.query` never called), that a
  forged payment webhook without the correct shared secret genuinely
  never reaches business logic — not just "the middleware looks like it
  should reject it."
- Confirmed the Snippe webhook's raw-body wiring in `app.js` (registered
  before the global `express.json()` specifically so the HMAC signature
  can be verified over the exact bytes) still works end-to-end through
  a real HTTP request via supertest, not just a unit test calling
  `constructWebhookEvent` directly with a hand-built Buffer.

### What remains
This phase deliberately scoped to money + auth + the two rule engines
rather than attempting shallow tests across all ~30 backend modules —
see "Why these modules first" above. Honestly still untested:

- **Backend modules with no dedicated tests yet**: `order.service.js`
  (checkout/cart-to-order, multi-vendor split, status transitions —
  arguably the next-highest-priority module after this phase),
  `cart`, `dispute`, `admin`, `seller` (including the verification-fee
  mobile-money flow's *seller-side* half — the payment-service half is
  covered), `delivery`/`deliveryPricing.service.js` (the DB-backed
  wrapper around the pure `deliveryPricing.js` util that *is* tested),
  `chat`, `notification`, `review`, `wishlist`, `account`,
  `accountVerification`, `category`, `storeType`, `push`, `earnings`,
  and `settings`.
- **Payment providers only partially covered**: `mobileMoney`,
  `selcom`, `malipopay`, `paypal`, `stripe` (currently unused —
  `simulate.provider.js` and `mobileMoney.provider.js` are the ones
  wired to a real flow) provider modules themselves (the HTTP calls
  they make, as opposed to `payment.service.js`'s handling of their
  results, which *is* covered) have no dedicated unit tests. Only
  `snippe.provider.js`'s signature verification was tested directly, since
  that's the one piece of provider logic that's pure/local rather than
  a live HTTP call this environment can't make.
- **`auth.service.js`'s `register()`** (multi-document upload +
  transactional user creation) is exercised only indirectly, via the
  integration test's validation-failure path — the success path
  (Cloudinary upload + DB transaction, both mocked) has no dedicated
  unit test yet.
- **No real database is ever touched.** Every test mocks
  `config/db.js`'s pool — there's no integration test running against
  an actual (even a local/dockerized) MySQL instance with the real
  schema from `database/schema` applied, so a query with a typo'd
  column name or a broken JOIN would still pass every test here. A
  logical next step: a `docker-compose`-based MySQL service in CI plus
  a smaller set of true DB-integration tests for the transactional
  paths (`creditSellersForOrder`, `requestWithdrawal`,
  `auth.service.register`) where mocking the transaction boundary
  itself is the main risk.
- **No frontend test suite.** `frontend-build` in CI is a compile-check
  only (`vite build`), not a test run — there's no Vitest/RTL setup,
  so none of the ~9 phases of frontend work (Cart/Checkout/animations/
  i18n/notifications/etc.) has any automated frontend coverage. Given
  this project's size, a frontend suite is realistically its own
  follow-up phase, not an add-on to this one.
- **No end-to-end tests** (a real browser driving a real backend
  through an actual checkout) — everything here is unit or
  HTTP-layer-with-mocked-DB integration.
- **Coverage thresholds are scoped, not global.** `jest.config.js`'s
  `collectCoverageFrom` only lists the files this phase actually wrote
  tests for; running `--coverage` against the whole `src/` tree today
  would show roughly 45-50% overall, since most modules have zero
  dedicated tests. Widening the threshold's scope as each subsequent
  module gets covered (rather than lowering the number to make an
  all-`src/` run pass) is the intended way this grows.

## Phase 9 — UI/UX Improvements

Adds a shared animation/loading-state system and applies it to the highest-
traffic, most "does this feel alive?" surfaces: checkout, order/delivery
tracking, and a brand-new notification center (the backend notification
module from Phase 8 had no frontend UI consuming it at all until now).
Everything here is CSS-driven (Tailwind keyframes + transitions), not
JS-animation libraries, to keep bundle size and runtime cost near zero -
important on the lower-end Android devices this marketplace's delivery
agents and buyers are likely using.

### Shared animation system

`frontend/tailwind.config.js` gains reusable keyframes/utilities:
`animate-fade-in`, `animate-slide-up`, `animate-slide-down`,
`animate-scale-in`, `animate-shimmer`, `animate-ring-once` (bell wiggle),
`animate-pop-in` (badge pop). `index.css` adds the `.skeleton` shimmer
gradient, `.stagger-1`…`.stagger-6` delay helpers for list entrance
animations, and one global rule that makes Leaflet's own marker
positioning transition-able (`transition: transform` on
`.leaflet-marker-icon`), which is what turns the delivery agent's marker
movement into a glide instead of a jump-cut with zero React changes.
The existing `prefers-reduced-motion: reduce` rule in `index.css` (from
before this phase) already forces all of this down to ~0ms for anyone
with that OS setting, so nothing new was needed there.

### New: `Skeleton.jsx`

A shimmering placeholder (`<Skeleton />`, plus `<SkeletonRow />` /
`<SkeletonList />` shaped like a cart/order line) used wherever a page
used to just render the word "Loading…" — `Cart.jsx`, `Orders.jsx`, the
new `NotificationBell.jsx` dropdown, and `DeliveryTrackingMap.jsx`'s
"connecting" state. Shaped like the real content, so there's minimal
layout shift when it's replaced by data.

### Loading states

- `PageLoader.jsx` (route-chunk fallback) fades in after a 150ms delay,
  so a chunk that loads instantly on a warm cache never flashes a
  spinner at all.
- `Cart.jsx` / `Orders.jsx` loading states are now `<SkeletonList />`
  instead of plain text; once loaded, rows/sections stagger in with
  `animate-slide-up` + `.stagger-N`.
- `DeliveryTrackingMap.jsx` shows a skeleton + "Connecting to live
  tracking…" before the socket connects, instead of an empty map frame.

### Checkout

- Payment method options are now animated selectable cards (border/
  background/shadow transition on selection) instead of plain radio rows.
- The submit button shows a spinner + localized "Placing order…" text
  while submitting **or** while redirecting to an external payment
  provider (Snippe/PayPal) - previously the button silently sat disabled
  during that external redirect with no feedback.
- Errors slide down with `animate-slide-down` and are keyed so the same
  error message twice in a row still re-triggers the animation (draws
  the eye back to it) instead of silently no-op'ing.
- Wired two more strings to the Phase 8 dictionary that were still
  hardcoded English (`t("cart.empty")`, `t("checkout.title")`, etc.) as
  a low-risk drive-by fix.

### Delivery tracking

- `OrderTimeline.jsx`: the connector line between steps now animates its
  fill (`scaleX` transition) instead of instantly switching color, and
  the *current* in-progress step gets a pulsing ring (`animate-ping`) so
  it reads as "happening now" rather than just "done vs. not done".
  "Delivered" is treated as a resting end state (no pulse), not another
  in-progress step.
- `DeliveryTrackingMap.jsx`: connecting skeleton (above), fade-in on
  mount, and the global Leaflet marker transition described above.

### New: Notification center (`NotificationBell.jsx` + `ToastContext.jsx`)

Phase 8 fully localized the *backend* notification module (in-app
records + emails), but nothing in the frontend actually read
`GET /notifications` - there was no bell, no dropdown, no UI at all.
This phase adds one:

- **`NotificationBell.jsx`** — bell icon (desktop nav + mobile bar) with
  an unread-count badge, polling `/notifications/unread-count` every
  30s (a socket channel wasn't worth it for this low-frequency data -
  order/dispute/wallet events, not chat). Opening it fetches
  `GET /notifications` with a skeleton loading state; clicking an item
  marks it read (optimistic UI + `PUT /:id/read`) and navigates to the
  related order if there is one; "mark all read" hits
  `PUT /notifications/read-all`. Badge does a small `pop-in` and the
  bell does a one-shot "ring" wiggle when the unread count increases.
  Re-polls immediately if the account's language changes, since
  notification text is rendered server-side in that language.
- **`ToastContext.jsx`** (new, app-wide) — a small animated toast/snackbar
  system (`useToast().success/error/info(message)`), used today by
  `NotificationBell.jsx` for fetch-failure feedback. Mounted once in
  `main.jsx` so it's available to any component going forward.
  **Caught a real bug while building this**: the auto-dismiss timer was
  first written with `useState(() => { setTimeout(...); return cleanup })`,
  which looks like `useEffect` but isn't - `useState`'s initializer
  return value isn't a cleanup function, so the timer would never have
  been cleared on early unmount. Fixed to a proper `useEffect`.

### Modified files
- `frontend/tailwind.config.js`
- `frontend/src/index.css`
- `frontend/src/main.jsx`
- `frontend/src/components/Header.jsx`
- `frontend/src/components/PageLoader.jsx`
- `frontend/src/components/OrderTimeline.jsx`
- `frontend/src/components/DeliveryTrackingMap.jsx`
- `frontend/src/context/LanguageContext.jsx`
- `frontend/src/pages/Cart.jsx`
- `frontend/src/pages/Orders.jsx`
- `frontend/src/pages/Checkout.jsx`

### Created files
- `frontend/src/components/Skeleton.jsx`
- `frontend/src/components/NotificationBell.jsx`
- `frontend/src/context/ToastContext.jsx`

### Removed files
None.

**New environment variables**: none.

**New/changed API surface**: none. `NotificationBell.jsx` is a new
*consumer* of endpoints that already existed since Phase 8
(`GET /notifications`, `GET /notifications/unread-count`,
`PUT /notifications/:id/read`, `PUT /notifications/read-all`) - no
backend route, controller, or service changed in this phase.

**Migration required:** none - frontend-only phase, no schema changes.

### What was completed
- A reusable, CSS-only animation system (keyframes + utility classes)
  that every future component can reach for, instead of one-off
  hand-rolled transitions per file.
- Skeleton loading states replacing plain "Loading…" text on the two
  highest-traffic list pages (Cart, Orders) plus the delivery tracking
  map and the new notification dropdown.
- A genuinely improved checkout: animated payment selection, spinner
  feedback during both internal submission *and* external payment
  redirects, and an error state that actually draws the eye.
- Animated delivery tracking: a timeline that visibly fills in and
  pulses on the current step, and a map whose marker glides instead of
  jumping.
- A complete, new notification center (bell + dropdown + mark-as-read)
  wired to backend endpoints that had no frontend consumer before this
  phase, plus a reusable global toast system.
- Performance stance: no animation library was added; everything is
  Tailwind-generated CSS keyframes/transitions (GPU-accelerated
  `transform`/`opacity` only, nothing that triggers layout), and the
  existing `prefers-reduced-motion` kill-switch in `index.css` covers
  all of it automatically.

### What remains
- **Toasts aren't wired into most existing flows yet** - e.g.
  `ProductDetail.jsx`'s "Added to cart" feedback still uses its own
  inline `status` text state rather than `useToast()`. Left alone this
  phase to avoid touching a page whose full layout wasn't reviewed
  end-to-end; migrating it to a toast is a natural next step.
- **Most other pages** (Login, Register, Account sub-sections, all
  admin/seller/delivery pages, Messages, ConversationThread, product
  listing/detail) still use plain "Loading…" text and have no entrance
  animations - Cart/Orders/Checkout/OrderTimeline/DeliveryTrackingMap
  were chosen as the explicitly-named highest-traffic surfaces
  (loading states, checkout, notifications, delivery tracking); the
  rest is the same mechanical pattern applied file by file.
- **No automated visual/performance regression testing** exists yet to
  guard these animations (that's Phase 10's territory) - this phase was
  verified by manual code review only (no `npm install`/build available
  in this environment to compile-check the JSX; see verification note
  below).
- **NotificationBell polls rather than pushes** - acceptable for
  now given low event frequency, but if notification volume grows, a
  socket-pushed unread-count (reusing the existing Socket.IO connection
  from chat/tracking) would remove the up-to-30s staleness window.

### A note on verification
This environment has no network access and no pre-installed
`node_modules` for the frontend, so `npm install`/`vite build` couldn't
be run to compile-check the JSX in this phase. Every new/changed file
was manually reviewed line by line, plus a bracket-balance sanity script
(matching `()`/`{}`/`[]` counts) was run across all of them as an extra
check. This is a real limitation worth knowing about: please do run
`npm run build` (or `npm run dev`) after pulling these changes, before
deploying, to catch anything a manual review could have missed.

## Phase 8 — Multi-language Support (English + Swahili)

Adds real English/Swahili localization to the backend (errors, notifications,
emails) and expands the frontend's existing (but very small) `LanguageContext`
dictionary. This phase is infrastructure-first: it builds the plumbing every
future string can plug into, and fully localizes the highest-traffic surfaces
now. See **What remains** below for the honest list of what's still English-only.

### How locale is chosen (backend)

Every request gets a `req.locale` (`"en"` or `"sw"`), decided in this order:

1. **`?lang=sw` query param** — explicit override, e.g. for a shareable link.
2. **`Accept-Language` header** — the frontend's `api/client.js` now attaches
   this automatically on every request, synced with whatever the person has
   picked in Settings (`LanguageContext`'s `nexora_language` in localStorage).
   This is what makes a language change in Settings take effect on the very
   next request, without needing to log out/in.
3. **JWT `language` claim** — a signed-in user's saved `language` column
   (already existed on `users`, from Phase advanced-features) is baked into
   the session token at login (`auth/login.service.js`) and used as a
   fallback for clients that don't send an `Accept-Language` header at all
   (e.g. a bare `curl` request, or a non-browser integration).
4. **`en`** — default.

### New backend module: `backend/src/i18n/`

- `index.js` — `t(locale, key, params)` translation helper with
  `{placeholder}` interpolation and English fallback for any missing key, plus
  `resolveLocale()` / `resolveFromAcceptLanguage()`.
- `locales/en.js`, `locales/sw.js` — the two message catalogs. Namespaces:
  `common` (generic error/status strings), `errors` (keyed error codes —
  see below), `labels` (dispute types / resolutions, used inside
  notification messages), `notifications` (title/message per event type),
  `email` (shared email footer text).

Adding a third language later is just: drop `locales/<code>.js` with the same
key shape, add `<code>` to `SUPPORTED_LOCALES` in `i18n/index.js`, and add it
to `LANGUAGES` in the frontend's `LanguageContext.jsx`.

### Coded errors, so error responses can be translated

A new tiny helper, `backend/src/utils/appError.js`, lets a service throw
`appError("ACCOUNT_NOT_FOUND", 404)` instead of `new Error("Account not
found")`. `errorHandler.js`, and the handful of controllers that catch
errors locally instead of forwarding to it (`account.controller.js`,
`auth.controller.js`, `notification.controller.js`), now translate `err.code`
via `t(req.locale, "errors.<CODE>")` when present, and fall back to the raw
`err.message` for anything not yet migrated to this pattern (see **What
remains**).

Migrated as the flagship example of this pattern: `account.service.js`
(account not found, email/phone already in use, incorrect password,
expired reauth) and `login.service.js`/`auth.service.js` (invalid
credentials, account not found).

### Notifications and emails now render in the recipient's language

`notification.service.js`'s `notify()` used to take a pre-built English
`title`/`message` string. It now takes `titleKey`/`messageKey` (+ params) and:

1. Looks up the **recipient's own saved `language`**, not the language of
   whoever/whatever triggered the notification.
2. Translates the in-app notification title + message into that language
   before storing it.
3. If `withEmail: true`, sends the same translated title/message as the
   email subject/body, with a translated footer line appended.

`title`/`message` (raw strings) are still accepted as a fallback for any
call site not yet migrated, so this never silently drops a notification.

All 19 existing call sites across 8 modules were migrated to the new
key-based form: `accountVerification.service.js`, `admin.service.js`,
`delivery.service.js`, `dispute.service.js` (5 call sites),
`order.service.js` (5 call sites), `seller.service.js`, `wallet.service.js`
(2 call sites). Dynamic values that are themselves labels (a dispute's
type, its resolution) or optional trailing clauses (an admin's note, a
refund amount) are resolved via a small nested `{ key, params }` convention
inside `messageParams`, so they're translated too instead of being
interpolated as raw English.

### Frontend

`LanguageContext.jsx`'s dictionary (previously ~25 keys, nav/account only)
is expanded to cover `common`, `auth`, `cart`, `checkout`, `orders`,
`orderTimeline` (delivery tracking steps), `notifications`, and `footer`
namespaces, and `t()` now accepts a `params` object for `{placeholder}`
interpolation (e.g. `t("orders.vendorsBadge", { count: 3 })`).

`api/client.js` now sends the saved language as an `Accept-Language` header
on every request, so backend error messages and validation responses come
back in the right language too, not just notifications.

Fully wired to the dictionary this phase: `Header.jsx` (fixed two labels —
"Disputes"/"Saved" — that were still hardcoded English), `Footer.jsx`,
`Cart.jsx`, `Orders.jsx`, `OrderTimeline.jsx`. `Account.jsx` already used
the dictionary from before this phase.

### Modified files
- `backend/src/app.js`
- `backend/src/middleware/auth.middleware.js`
- `backend/src/middleware/errorHandler.js`
- `backend/src/modules/auth/login.service.js`
- `backend/src/modules/auth/auth.service.js`
- `backend/src/modules/auth/auth.controller.js`
- `backend/src/modules/account/account.service.js`
- `backend/src/modules/account/account.controller.js`
- `backend/src/modules/notification/notification.repository.js`
- `backend/src/modules/notification/notification.service.js`
- `backend/src/modules/notification/notification.controller.js`
- `backend/src/modules/accountVerification/accountVerification.service.js`
- `backend/src/modules/admin/admin.service.js`
- `backend/src/modules/delivery/delivery.service.js`
- `backend/src/modules/dispute/dispute.service.js`
- `backend/src/modules/order/order.service.js`
- `backend/src/modules/seller/seller.service.js`
- `backend/src/modules/wallet/wallet.service.js`
- `frontend/src/context/LanguageContext.jsx`
- `frontend/src/api/client.js`
- `frontend/src/components/Header.jsx`
- `frontend/src/components/Footer.jsx`
- `frontend/src/components/OrderTimeline.jsx`
- `frontend/src/pages/Cart.jsx`
- `frontend/src/pages/Orders.jsx`

### Created files
- `backend/src/i18n/index.js`
- `backend/src/i18n/locales/en.js`
- `backend/src/i18n/locales/sw.js`
- `backend/src/middleware/locale.middleware.js`
- `backend/src/utils/appError.js`

### Removed files
None.

**New environment variables**: none. (`i18n/index.js` hardcodes
`DEFAULT_LOCALE = "en"` as a constant rather than an env var, since there's
only ever been one sensible default — happy to move it to `.env` on request.)

**New/changed API surface**:
- No new endpoints or routes.
- Every existing endpoint now accepts an optional `?lang=en|sw` query
  param, and honors an `Accept-Language` header, to control the language
  of that response's error messages.
- Error response bodies (`{ success: false, message }`) are now translated
  for the migrated error codes (see **Coded errors** above); everything
  else is unchanged in shape.
- Notification objects returned by `GET /api/v1/notifications` now contain
  `title`/`message` text in the recipient's saved language instead of
  always English — same shape, localized content.

**Migration required:** none — no schema changes. (The `users.language`
column already existed.)

### What was completed
- Backend i18n infrastructure (`t()`, locale resolution, locale
  middleware, JWT language claim) — reusable by every module going
  forward.
- Full English/Swahili translation of every in-app notification and its
  optional email, across all 8 modules that raise notifications.
- A coded-error pattern (`appError` + `errorHandler.js` translation) with
  two flagship modules (`account`, `auth`/`login`) fully migrated.
- Frontend dictionary expanded ~4x, wired into 5 more components, plus
  automatic `Accept-Language` header propagation from the user's saved
  choice.

### What remains
- **Most backend service error messages** (seller, product, cart, order,
  payment, delivery, review, chat, wallet, dispute, wishlist, admin, etc.)
  still throw plain `new Error("English text")` rather than `appError(code)`
  — they work exactly as before (English only), and are the natural next
  batch to migrate using the pattern this phase established.
- **express-validator field messages** (`.withMessage("...")` in the ~15
  `*.validator.js` files) are still English-only; `validation.middleware.js`
  would need to map each to an error code the same way.
- **Frontend page coverage**: most pages (`Login`, `Register`,
  `Checkout`, `Account` sub-sections, all `admin/*`, `seller/*`,
  `delivery/*` pages, `Messages`, `ConversationThread`, product pages,
  etc.) still have hardcoded English JSX text. `Header`/`Footer`/`Cart`/
  `Orders`/`OrderTimeline` are done as the highest-traffic surfaces; the
  rest is mechanical repetition of the same `t("key")` pattern.
- **Legal documents** (`frontend/src/legal/*.md`, added in Phase 7) are
  still English-only; the Phase 7 note about needing a legal/linguistic
  review pass on any translated legal text still applies.
- **Swahili translation quality**: translations in this phase are
  functional but should get a native-speaker review pass before shipping
  to production, same caveat as Phase 7's legal docs.

## Phase 7 — Legal & Policies

Adds five legal/policy documents and publishes them as real, linkable pages on the
Platform (previously the site had no Terms, Privacy Policy, or any policy pages at
all):

1. **Terms of Service**
2. **Privacy Policy**
3. **Vendor Agreement** (Seller-specific terms)
4. **Delivery Liability Policy**
5. **Insurance Policy**

**Why these five, and how they connect:** the ask was to "clearly define
responsibility for damaged items, delayed deliveries, refunds, and defective
products." Rather than repeating that logic five times, one document owns each
piece and the others cross-link to it:
- **Delivery Liability Policy** is the source of truth for *who's at fault*
  (Seller vs. Delivery Agent vs. Buyer) for damage and delays, matching how the
  Phase 6 dispute system already models this (`damaged`, `delayed`, `defective`,
  `wrong_item`, `missing`, `other`, resolved as `refund_full` / `refund_partial` /
  `replacement` / `compensation` / rejected).
- **Vendor Agreement** states the Seller's obligations and points to the Delivery
  Liability Policy for fault attribution, and explains refunds are funded from the
  Seller's wallet (reusing the exact `wallet_transactions` / `dispute` reference
  type mechanism built in Phase 6).
- **Insurance Policy** is written honestly for what this codebase actually has
  today — there's no purchased third-party insurance product, so it documents the
  in-app wallet-reversal mechanism as the de facto protection, and explicitly says
  so, with a note on what to replace it with if NEXORA later buys real cargo/courier
  insurance.
- **Terms of Service** and **Privacy Policy** are the platform-wide baseline
  agreements every user (Buyer, Seller, Delivery Agent) is bound by.

**⚠️ These are templates, not legal advice.** Every document contains an inline
"Template notice" callout at the top. They're grounded in how this specific
codebase actually behaves (commission model, wallet reversals, dispute categories,
payment providers, delivery-team structure) so they aren't generic boilerplate —
but placeholders like governing law/jurisdiction still need to be confirmed by
qualified counsel before this goes to production, especially once Phase 8 adds
Swahili translations of these same documents (translated legal text should also
get a legal/linguistic review pass, not just a machine translation).

**Where the content lives:** `frontend/src/legal/*.md` — five markdown files,
one per document, meant to be the single source both a lawyer and a developer can
review/edit directly (no build step needed to read them).

**How they're rendered:** a new dependency-free `MarkdownLite` component
(`frontend/src/components/legal/MarkdownLite.jsx`) turns the small subset of
Markdown these documents use (headings, tables, lists, blockquotes, bold, links)
into styled JSX matching the existing NEXORA design system. This was a deliberate
choice over adding a `react-markdown` dependency for five static, self-authored
documents.

**New pages:**
- `/legal/:slug` → `LegalPage.jsx` — renders one document with a sticky side-nav
  linking to the other four. Public route, no login required (`slugs`:
  `terms-of-service`, `privacy-policy`, `vendor-agreement`,
  `delivery-liability-policy`, `insurance-policy`).
- Footer now has a permanent row of links to all five documents on every page.

**New environment variables:** none.

**New API endpoints:** none — these are static documents served as part of the
frontend bundle, not database-backed content, so no backend module was needed for
this phase.

**Migration required:** none.

**What was completed:**
- All five required legal/policy documents, each grounded in the actual mechanics
  already built in this codebase (wallet reversals, dispute categories/resolutions,
  commission model, delivery-team structure, the specific payment providers
  integrated: mobile money, PayPal, Selcom, Snippe, Stripe).
- Damaged items, delayed deliveries, refunds, and defective products each have an
  explicit "who's responsible" table, cross-referenced consistently across the
  Terms of Service, Vendor Agreement, Delivery Liability Policy, and Insurance
  Policy so the four documents don't contradict each other.
- Public, linkable pages for all five documents with a shared nav, wired into the
  footer on every page.
- A reusable, dependency-free markdown renderer for future policy documents.

**What remains (deferred to keep this phase scoped to content + delivery):**
- **Acceptance tracking.** Right now these pages are publicly linked but there's no
  checkbox-and-timestamp capture of "Buyer/Seller accepted Terms v1.0 on
  registration/store setup." Recommended as a small follow-up: a boolean +
  timestamp + version column on `users`/`sellers`, checked at Register and
  SellerSetup.
- **Actual legal review.** These are structurally complete templates, not
  attorney-reviewed final text — flagged clearly in-document.
- **Swahili translations** of these five documents — intentionally left for
  Phase 8 (Multi-language Support) so translation happens once, in that phase's
  i18n infrastructure, rather than being bolted on here.
- **Insurance Policy replacement**, if/when NEXORA purchases actual third-party
  cargo/courier insurance — the current document is honest about there being none
  today.

## Phase 6 — Disputes

Adds a full dispute-management flow between buyers, sellers, and admins,
covering all five required categories: **damaged items, delayed
delivery, defective products, wrong items, and missing deliveries**
(plus a general "other" fallback so a buyer is never blocked from
filing just because their issue doesn't fit neatly).

**Flow:**
1. **Buyer files a dispute** against a paid order (optionally against one
   specific line item, e.g. one wrong product in a multi-item order).
   One open dispute per order/item at a time — no duplicate spam.
2. **Buyer or seller can attach photo evidence** and exchange messages
   on the case. A seller's first reply automatically moves the dispute
   from `open` to `under_review` so it surfaces in the admin queue.
3. **Admin reviews and resolves** the case with one of five outcomes:
   `refund_full`, `refund_partial`, `replacement`, `compensation`, or
   rejects it with a reason (`no_action`).
4. **Money movement:** a refund automatically reverses the seller's
   wallet earnings for that amount (same ledger used for withdrawals —
   see `wallet_transactions`, now with a `dispute` reference type),
   since the seller was already credited net-of-commission at payment
   time. The buyer-side refund itself (returning money via mobile
   money/PayPal/Snippe) is **not** automated yet — no refund API exists
   on any of the three payment gateways in this codebase today, so the
   admin still has to trigger that manually outside the app once
   they've approved a refund here. See "What remains" below.
5. Every status change is written to an audit trail
   (`dispute_history`), and both sides get in-app + email notifications
   at each step (filed, replied, resolved, rejected).

**New tables** (`database/migrations/034_disputes.sql`):
- `disputes` — the case itself: type, status, resolution, refund amount.
- `dispute_evidence` — photos attached by buyer/seller.
- `dispute_messages` — the buyer/seller/admin discussion thread.
- `dispute_history` — audit trail of every status change.
- `wallet_transactions.reference_type` widened to include `'dispute'`.

**New environment variables:** none — evidence uploads reuse the
existing `CLOUDINARY_*` config, and notifications reuse the existing
Brevo email config.

**New API endpoints** (`/api/v1/disputes`, all require a Bearer token):

| Method | Endpoint | Role | Description |
|---|---|---|---|
| POST | `/` | buyer | File a new dispute (`order_id`, optional `order_item_id`, `type`, `subject`, `description`) |
| GET | `/` | buyer | List my own disputes |
| GET | `/:id` | buyer/seller/admin (participant only) | Full dispute detail: evidence, messages, history |
| POST | `/:id/evidence` | buyer/seller (participant) | Upload a photo (`multipart/form-data`, field `file`) |
| POST | `/:id/messages` | buyer/seller/admin (participant) | Add a message to the case thread |
| PUT | `/:id/withdraw` | buyer | Withdraw my own open dispute |
| GET | `/seller` | seller | List disputes filed against my orders |
| GET | `/admin` | admin | List all disputes, filter by `?status=` / `?type=` |
| PUT | `/admin/:id/review` | admin | Mark an open dispute as under review |
| PUT | `/admin/:id/resolve` | admin | Resolve with `resolution`, optional `resolution_note` / `refund_amount` |
| PUT | `/admin/:id/reject` | admin | Reject with a required `resolution_note` reason |

**Frontend** (added on request, ahead of Phase 9):
- **Buyer**: "⚠️ Report a problem" button on `OrderDetail` → `/disputes/new` (pick an
  item or "the whole order", a category, subject, and description) →
  `/disputes` (my disputes list, new "Disputes" link in the header nav) →
  `/disputes/:id` (thread, photo evidence upload, withdraw button).
- **Seller**: new "Disputes" tab in the seller dashboard
  (`/seller/disputes`) listing cases against their orders, linking into
  the same shared `/disputes/:id` detail/thread page.
- **Admin**: new "Disputes" tab in the admin control room
  (`/admin/disputes`) with status/type filters, linking into the same
  shared detail page, which additionally shows the resolve/reject
  controls when viewed as an admin.
- One shared `DisputeDetail.jsx` page renders differently per role
  (buyer/seller see evidence+chat+withdraw, admin additionally sees
  mark-under-review/resolve/reject) rather than three separate
  implementations of the same thread UI.
- Verified with a full production build (`vite build`) — compiles clean,
  no console/type errors.

**Migration required:** run `node database/migrate.js` before deploying
this build.

**What was completed:**
- Dispute data model (case, evidence, messages, audit history).
- Buyer creation flow with ownership/eligibility checks (order must be
  paid and not `pending`/`cancelled`; one order/item can't have two
  open disputes at once).
- Evidence upload via Cloudinary (image files, 5 MB limit, same
  middleware as product photos).
- Buyer/seller/admin messaging thread on each case, with auto
  under-review transition on a seller's first reply.
- Admin resolve/reject workflow with five resolution outcomes.
- Seller wallet reversal on refund resolutions (append-only ledger,
  same pattern as withdrawal rejections).
- In-app + email notifications at every step.
- Role-scoped access control throughout (a buyer/seller can only ever
  see their own disputes; admin sees everything).
- Full frontend: buyer filing form + list + detail/thread, seller list,
  admin list + resolve/reject console, wired into the existing header
  nav and seller/admin sidebars.

**What remains (deferred to later phases per the plan):**
- **Automated buyer-side refunds** — actually returning money via
  Snippe/PayPal/mobile money requires each provider's refund API,
  which isn't integrated anywhere in this codebase yet. Today,
  approving a refund records the decision and reverses the seller's
  wallet, but the admin still issues the buyer's money back manually.
- **Multi-language dispute content** (Phase 8) and further **animated
  loading/status states** for the dispute UI (Phase 9) are intentionally
  not addressed here — current UI follows the plain-English, no-motion
  style already used by Orders/AdminWithdrawals/etc.
- Automated tests for this module are covered by Phase 10.

---

## Phase 3 — Order Splitting (multi-vendor carts)

A buyer's cart can hold products from more than one seller. Checkout now
handles that properly instead of forcing every seller's items into one
order with one shared status:

- **Single-vendor cart** → unchanged: one standalone order, exactly as
  before.
- **Multi-vendor cart** → one **parent order** (buyer-facing: payment,
  shipping address, combined total) plus one **child order per vendor**
  (that vendor's items only, its own status, its own delivery). Child
  order numbers are the parent's number with `-V1`, `-V2`, ... appended.

This means each vendor can now progress their own part of the order
(processing → shipped → delivered) independently, and each gets its own
delivery assignment — previously a multi-vendor cart could only ever have
one delivery row for the whole order, so only one seller could ever
actually get it shipped.

Paying once (mobile money / card / PayPal) pays the parent; on webhook
confirmation the payment status cascades to every child order and
sellers are credited per child order exactly as before. Cash on
Delivery is confirmed per child order already, since each child has
exactly one seller.

**Migration required:** run `node database/migrate.js` before deploying
this build — adds `parent_order_id` and `is_parent` to `orders`.

**Known limitation carried into a later phase:** a parent order's own
`status` column isn't kept in sync with its children's individual
statuses (it only ever moves to `cancelled`) — the buyer-facing detail
page shows each vendor's real status on its own card, but nothing yet
computes a single rolled-up "order status" for the parent. Revisit this
if/when the admin order list or notifications need a one-line summary
status for split orders.

---

## Pre-launch audit

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

---

# Phase 4 — Delivery improvements

Adds vehicle info to delivery agent registration and lets buyers rate
the agent who delivered their order. No new environment variables and
no new API base paths - everything below lives under the existing
`/api/v1/auth` and `/api/v1/delivery` routes.

**Migration required:** run `node database/migrate.js` before
deploying this build - it adds two columns to `users` and a new
`delivery_ratings` table (migration
`032_delivery_agent_vehicle_and_ratings.sql`).

## 1. Vehicle type + plate number at registration
Delivery agents now submit their vehicle type (bicycle, motorcycle,
tuktuk, car, van, or truck) and plate number as part of the same
"verify your identity" step that already collects their ID and
driver's license - no new registration step, no separate form.
Buyers/sellers never see or send these fields; they're required only
when `role = "delivery_agent"` (enforced server-side in
`auth.validator.js`, not just hidden in the UI).

Where it shows up afterwards:
- **The buyer**, while tracking a live delivery on the order page, now
  sees "David is on a Motorcycle · Plate T123 ABC" above the map.
- **The agent**, via `GET /account/me` (their own profile).
- **Admins**, reviewing a pending delivery agent's registration in
  Account Verifications, see the declared vehicle/plate alongside the
  uploaded documents - useful context when deciding whether to approve.

## 2. Delivery agent ratings
Once a delivery's status is `delivered`, the buyer who placed that
order can leave a 1-5 star rating (with an optional comment) for the
agent who delivered it - exactly one rating per order, mirroring how
product reviews work (one review per buyer per product). The buyer
sees a star-picker on the order page immediately after delivery, and
their own submitted rating (read-only) on every visit after that.

Agents see their own ratings on a new **Ratings** tab in their
dashboard: average rating, total count, and the individual
ratings/comments they've received, newest first.

## New API endpoints
| Method | Path | Who | Purpose |
|---|---|---|---|
| POST | `/api/v1/delivery/:orderId/rating` | Buyer (order owner) | Rate the agent who delivered this order. Only once, and only after `delivered`. Body: `{ rating: 1-5, comment?: string }`. |
| GET | `/api/v1/delivery/my/rating-summary` | Delivery agent | The logged-in agent's own average rating, count, and rating history. |

`GET /api/v1/delivery/:orderId` (existing route) now also returns the
assigned agent's `agent_vehicle_type` / `agent_vehicle_plate_number` /
`agent_first_name` / `agent_last_name`, plus a `rating` field (`null`
until the buyer rates it) - no new route needed for the buyer to see
either of those.

## What was completed
- Migration adding `vehicle_type` / `vehicle_plate_number` to `users`
  and the new `delivery_ratings` table.
- Registration validation, service, and repository changes so vehicle
  info is required and stored for `delivery_agent` signups only.
- Vehicle info surfaced in the agent's own profile, the buyer's live
  tracking view, and the admin verification review screen.
- Full rate-a-delivery flow: repository, service (with the
  buyer-owns-order / delivered-only / one-rating-only checks),
  controller, validator, and routes.
- Agent-facing ratings dashboard tab + page.

## What remains
- Nothing outstanding from this phase - Phase 4 is complete as
  scoped (vehicle type, plate number, delivery agent ratings).
- Not in scope for this phase, flagging for later phases per the plan:
  Phase 5 (distance-based delivery pricing for Tanzania), Phase 6
  (disputes), Phase 7 (legal/policy pages), Phase 8 (Swahili), Phase 9
  (animations/UX polish), Phase 10 (automated tests).


## Phase 1 — Payments: Stripe removed, Snippe added
Stripe has been fully removed and replaced with a new **Snippe**
provider. Payment providers remain isolated (one file per gateway under
`payment/providers/`), and PayPal / mobile money / cash-on-delivery are
unaffected.

**Changed**:
- `providers/stripe.provider.js` deleted, `providers/snippe.provider.js`
  added — same hosted-checkout-session shape (`isConfigured`,
  `createCheckoutSession`, `constructWebhookEvent`), no SDK dependency
  (plain `fetch`, same pattern already used for PayPal). Webhook
  authenticity is verified via an HMAC-SHA256 signature
  (`SNIPPE_WEBHOOK_SECRET`) over the raw request body, same trust model
  Stripe had.
- `payment.service.js` / `payment.controller.js` / `payment.routes.js` /
  `app.js`: every Stripe-specific function, route, and webhook handler
  renamed/rewired to Snippe (`/payments/:orderId/snippe/checkout`,
  `/payments/verification-fee/snippe/checkout`,
  `/payments/webhooks/snippe`).
- `orderStatus.js`'s `PAYMENT_METHODS` now lists `snippe` instead of
  `stripe`.
- Frontend (`Checkout.jsx`, `OrderDetail.jsx`,
  `VerificationFeeGate.jsx`, `AdminSettings.jsx`): UI labels and API
  calls updated to Snippe.
- `backend/package.json`: `stripe` npm dependency removed.
- New migration `030_snippe_payment_gateway.sql`: widens then narrows
  the `payment_method`/`method` ENUMs so any existing `'stripe'` rows
  are moved to `'snippe'` rather than left pointing at a gateway the app
  no longer understands.

**Action needed from you**:
- Set `SNIPPE_SECRET_KEY` and `SNIPPE_WEBHOOK_SECRET` in your production
  `.env` (placeholders added, both currently empty) — checkout and the
  seller verification fee will error on the Snippe path until these are
  set.
- Verify Snippe's actual hosted-checkout API shape (endpoint path,
  request/response field names, webhook signature header name) against
  their real docs once you're onboarded — `snippe.provider.js` follows a
  common hosted-checkout pattern but wasn't built against Snippe's
  actual documentation, since none was available at the time of this
  change.
- Run the new migration (`npm run db:migrate` from `backend/`) before
  deploying.
- Run `npm install` in `backend/` to drop `stripe` from
  `package-lock.json` (not hand-edited, since lockfiles should be
  regenerated by npm, not patched by hand).

## Phase 2 — Emails: Nodemailer removed, Brevo used everywhere
Nodemailer/SMTP has been fully removed. Every outgoing email (OTP *and*
general notifications) now goes through the Brevo HTTPS API.

**Changed**:
- `config/email.js` (the Nodemailer transporter) deleted.
- `utils/sendEmail.js` (used by `notification.service.js` for order/
  status-change emails) now calls `config/brevo.js`'s
  `sendTransactionalEmail` instead of a Nodemailer transporter. Same
  best-effort behavior as before — a failed send is logged, not thrown,
  so a broken email config never breaks the feature that triggered it.
  OTP delivery (`otp.service.js`) already used Brevo directly and is
  unchanged.
- `backend/package.json`: `nodemailer` dependency removed.
- `backend/.env`: `EMAIL_HOST` / `EMAIL_PORT` / `EMAIL_USER` /
  `EMAIL_PASSWORD` (SMTP-only) removed. `EMAIL_FROM` kept as a fallback
  sender address, alongside the existing `BREVO_API_KEY` /
  `BREVO_SENDER_EMAIL` / `BREVO_SENDER_NAME`, now all under one
  "Transactional email" section.

**Action needed from you**:
- Nothing new — `BREVO_API_KEY` / `BREVO_SENDER_EMAIL` were already set
  and working for OTP, and now cover general notification emails too.
- Run `npm install` in `backend/` to drop `nodemailer` from
  `package-lock.json`.

## Phase 5 — Delivery pricing: Tanzania distance bands (Bolt-style)

Delivery agent fees now scale with distance instead of always being one
flat platform-wide amount. A delivery is priced by the straight-line
distance from the seller's pickup pin to the buyer's delivery pin, run
through admin-configurable distance bands — e.g. up to 3 km → 2,000 TZS,
up to 7 km → 4,000 TZS, and so on, with a per-km rate beyond the last
band. The existing flat `rider_delivery_fee` becomes the **fallback**:
used whenever either pin is missing (seller hasn't set a pickup
location yet, or the order has no delivery pin), so nothing breaks for
orders/sellers that predate this phase.

**Changed**:
- `backend/src/utils/deliveryPricing.js` (new): pure band-pricing math
  (`computeBandedFee`) plus a safe `parseBandsConfig` that falls back to
  sensible defaults if the stored config is missing or corrupt — a
  hand-edited settings row can never crash a checkout or delivery claim.
- `backend/src/modules/delivery/deliveryPricing.service.js` (new):
  `calculateDeliveryFee(order)` — looks up the order's single seller
  (`order.repository.findOrderSellerId`, new), that seller's pickup pin,
  and the order's own delivery pin; computes distance and bands fee if
  both pins exist, otherwise returns the flat fallback. Returns
  `{ fee, distanceKm, method: "distance" | "flat" }`.
- `delivery.service.js` (`claimDelivery`, `acceptOffer`) and
  `order.service.js` (`updateOrderStatusBySeller`'s own-roster-agent
  path) — the three places a delivery's fee gets set — now call
  `calculateDeliveryFee` instead of always reading the flat
  `rider_delivery_fee` setting directly.
- `deliveries` table gets a new `distance_km` column (migration 033) —
  records what a fee was actually calculated from, `NULL` when the flat
  fallback was used, so an agent/admin can see why a delivery was priced
  the way it was.
- `platform_settings.setting_value` widened from `VARCHAR(255)` to
  `TEXT` (the new `delivery_distance_bands` JSON value fits in 255 chars
  today, but an admin adding more bands shouldn't hit a silent
  truncation ceiling).
- `settings.service.js`: new `getDeliveryDistanceBands()` getter, and
  `updateSettings` accepts a `delivery_distance_bands` object
  (`{ bands: [{ up_to_km, fee }, ...], per_km_beyond }`).
- **Seller pickup pin**: `seller_profiles` gets `pickup_lat` /
  `pickup_lng` (migration 033). Sellers set it in **Store settings**
  via a new map picker (reusing `LocationPicker.jsx`, now with
  configurable label/hint text so it fits both the checkout and seller
  contexts).
- **Admin settings page**: new "Distance-based delivery pricing"
  section — add/remove/edit bands, set the per-km overage rate. The
  flat rider fee field is relabeled "Fallback rider delivery fee" to
  make its new role clear.

**New environment variables**: none — this phase is entirely
database/settings-driven, no new `.env` values.

**New/changed API surface**:
- `PUT /api/v1/seller/profile` now also accepts `pickup_lat` /
  `pickup_lng` (nullable floats, validated in `seller.validator.js`).
- `PUT /api/v1/admin/settings` now also accepts `delivery_distance_bands`
  (validated in `admin.validator.js`: at least one band, each band a
  positive `up_to_km` and non-negative `fee`, non-negative
  `per_km_beyond`). `GET`/`PUT /api/v1/admin/settings` responses include
  it alongside the existing settings fields.
- No new routes — this rides on the existing seller-profile and
  admin-settings endpoints.

**Migration required:** run `node database/migrate.js` before deploying
this build — migration `033_delivery_distance_pricing.sql` adds
`pickup_lat`/`pickup_lng` to `seller_profiles`, `distance_km` to
`deliveries`, widens `platform_settings.setting_value`, and seeds a
default `delivery_distance_bands` row.

**Action needed from you**:
- Nothing required to keep the platform working — every delivery falls
  back to the flat fee until a seller sets a pickup pin, exactly like
  today.
- To actually get distance-based pricing, sellers need to drop a pickup
  pin in Store settings, and you may want to review/adjust the default
  bands (3 km → 2,000 / 7 km → 4,000 / 12 km → 6,000 / 20 km → 9,000 TZS,
  600 TZS/km beyond) in Admin settings for your real market.

**What remains**: Phase 6 (disputes), Phase 7 (legal/policy pages),
Phase 8 (Swahili), Phase 9 (animations/UX polish), Phase 10 (automated
tests).
