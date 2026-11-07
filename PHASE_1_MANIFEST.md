# Phase 1 - Knowledge pack (Workstream A)

Scope: build and test the curated NEXORA knowledge pack for the assistant.
It is NOT wired into `ai.service.js#chat` yet (that is Phase 2), so there is
no behaviour change in the running app.

## Files added (3)
- backend/src/modules/ai/knowledge/nexoraKnowledge.js
- backend/src/modules/ai/knowledge/README.md
- backend/tests/unit/ai/nexoraKnowledge.test.js

## Files modified
None.

## Files deleted
None.

## New env vars / migrations / dependencies
None.

## How to apply
Unzip over the repository root (paths are relative to the NEXORA/ folder).

## How to test
    cd backend
    npx cross-env NODE_ENV=test jest --runInBand tests/unit/ai/nexoraKnowledge.test.js
    npx eslint src/modules/ai/knowledge tests/unit/ai/nexoraKnowledge.test.js

Results when this phase was built: 25 new tests pass; eslint clean; existing AI
suites (tests/unit/ai and tests/integration/ai.routes*.test.js) still pass
(11 suites, 143 tests).

## What the pack does
- 14 sections built from the user manual, business rules, company overview and
  the legal pages; about 2.3k tokens for signed-out visitors and 2.8k for sellers.
- Role gating (decision 2): signed-out visitors and buyers get buyer information
  plus general seller information; wallet, commission, withdrawals and promotion
  details only for sellers/admins; delivery-agent details only for delivery
  agents/admins; unknown roles are treated as signed-out.
- Live numbers (decision 1): return window, dispute response time, cart limits,
  top-up and withdrawal limits, hold days and sponsorship rates come from
  `platform_settings` via `settingsService.getAll()`. A missing setting drops the
  number instead of guessing. Commission is stated only when
  `monetization_commission_enabled` is "true".
- `getKnowledgeText({ role })` is ready for Phase 2; `buildKnowledgeText` is the
  pure, DB-free version used by tests.

## Findings that need your attention
1. Cancel-order rule resolved from code: orders can be cancelled while
   `pending` or `processing` (constants/orderStatus.js); bookings while
   `pending` or `confirmed`. The functional spec's "Not traced" note is outdated.
2. Support contact (OWNER CONFIRMATION REQUIRED): the pack uses the email and
   phone from company-information.md. Docs flag the email as a personal address.
   Change it in one place: `SUPPORT_CONTACT` in nexoraKnowledge.js.
3. Delivery wording differs between sources: the Terms say delivery agents are
   engaged by sellers; the user manual and company overview describe
   platform-managed dispatch. The pack states it neutrally ("NEXORA's delivery
   network or the seller's own delivery"). Please confirm which is true.
4. Delivery fee bands are documented in code as delivery-AGENT fees, so the
   assistant is told NOT to quote a buyer delivery fee; it points to checkout.
5. Pre-existing issue found, not changed: `settings.controller.js` calls
   `settingsService.getPublicMonetizationStatus()` but no such function exists in
   `settings.service.js`, so `GET /settings/monetization-status` would fail.
6. The uploaded zip's `.git` folder is incomplete (`git status` fails with
   "unable to read" an object), so the changed-file list was computed from a
   file-hash snapshot instead of git. Result is the same: 3 added files.
