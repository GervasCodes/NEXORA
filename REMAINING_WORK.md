# REMAINING_WORK.md

This replaces the previous version, which was written before frontend test
coverage and road-routing work landed and before this session's
verification pass. Several items it listed as "unimplemented" are, on
inspection of the actual code in this upload, already done.

## Confirmed complete (verified this session, not just claimed)

- **Automated test coverage**, backend and frontend. 390 backend unit
  tests, 15 backend integration tests, and 101 frontend tests all pass.
  Frontend coverage includes checkout, login/OTP, cart, order tracking, and
  delivery status timeline — the exact gaps the previous version of this
  file flagged as missing.
- **Road-routing distance/ETA.** `backend/src/services/routing/` is a full
  provider abstraction: OSRM as primary (defaults to OSRM's public demo
  server so it works with zero config), straight-line haversine as
  automatic fallback if OSRM is slow/unreachable, `ROUTING_PROVIDER=fallback`
  to force offline mode. Migration `039_delivery_routing_duration.sql`
  stores the resulting travel-time estimate. See `docs/ROUTING.md`.
- Payment providers (Selcom, MalipoPay, Snippe, PayPal, Cash on Delivery),
  dispute handling, refund automation, seller/rider wallets, delivery
  distance-band pricing, admin dispatch dashboard, English/Swahili i18n
  with automated parity tests, and the five legal documents — all present,
  all wired up, all covered by the passing test suites above.

## Fixed this session

See `IMPLEMENTATION_REPORT.md` and `CHANGED_FILES.md` for detail: a broken
test suite (stray duplicate file), one dead-code file (`stripe.provider.js`,
which docs already claimed was gone), one ESLint error (empty catch block),
and stale payment documentation.

## Genuinely still open

- **`npm run test:db` (real-MySQL integration tests) has never actually
  been run.** The test files and the `.github/workflows/backend-tests.yml`
  CI config exist and are syntax-checked, but no environment used across
  any session so far — including this one — has had a reachable MySQL
  instance or GitHub Actions access to execute them. This is the single
  biggest gap between "tests pass" and "the whole system is proven to work
  end-to-end against a real database." **Do this before a production
  launch, in an environment with real MySQL access.**
- **OSRM in production.** The routing layer works out of the box against
  OSRM's public demo server, which is explicitly not meant for production
  traffic (rate limits, no uptime guarantee). Stand up a self-hosted OSRM
  instance (or a paid hosted OSRM/routing API) and point `ROUTING_OSRM_URL`
  at it before launch — see `docs/ROUTING.md` and the updated
  `docs/DEPLOYMENT.md`.
- **Database backups.** `database/backups/` exists as a placeholder
  directory; nothing populates it automatically. Set up scheduled
  `mysqldump` (or your host's managed-backup equivalent) before launch.
- **Legal documents have no Swahili translation.** Flagged in
  `LEGAL_TRANSLATION_REVIEW.md` and still true: all five legal documents
  (Terms of Service, Privacy Policy, Vendor Agreement, Liability, and the
  dispute/insurance policy) exist only in English. The UI's Swahili
  translation catalogs cover app copy, not legal text.
- **Payment provider integrations are unverified against live sandboxes.**
  Selcom, MalipoPay, Snippe, and PayPal are all complete, correctly
  structured implementations, but none have been exercised against a real
  provider sandbox/merchant account in any session — their in-code "confirm
  exact field names before going live" comments are appropriate caution,
  not missing functionality. Budget time to test each against a real
  sandbox before accepting real transactions.
- **Qualified review still needed, not a coding task:** governing-law
  jurisdiction, commission rate, and evidence-window placeholders in the
  legal documents need a lawyer; the Terms of Service's "Dispute Resolution
  Policy" naming inconsistency and one Swahili possessive-form question
  (both noted in `LEGAL_TRANSLATION_REVIEW.md`) need a native Swahili
  speaker.

## Recommended next steps, in order

1. Stand up a real MySQL instance (or use the `docker-compose.test.yml`
   already in the repo) and run `npm run test:db`, then push and let
   `.github/workflows/backend-tests.yml` run for real. This is the highest-
   value remaining step — everything else in this report assumes the code
   is correct based on unit/integration tests plus manual reading, not a
   full end-to-end run.
2. Get sandbox credentials for each payment provider you plan to launch
   with and do a real test transaction through each, including its
   webhook.
3. Stand up production OSRM (or pick a hosted routing API) and switch
   `ROUTING_OSRM_URL` over from the public demo server.
4. Set up scheduled database backups.
5. Get the legal documents translated and reviewed by counsel before
   relying on them.
