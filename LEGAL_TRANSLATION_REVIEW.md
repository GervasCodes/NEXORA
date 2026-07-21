# Legal & Translation Review (Phase 8)

*Reviewed: the five documents in `frontend/src/legal/` (Terms of Service, Privacy
Policy, Vendor Agreement, Delivery Liability Policy, Insurance Policy) and both
Swahili translation surfaces — `backend/src/i18n/locales/sw.js` (server-sent
notification/error strings) and `frontend/src/context/LanguageContext.jsx`
(UI strings).*

## Scope and method

This was a **consistency and accuracy review**, not a legal-sufficiency review.
NEXORA's legal documents are explicitly marked as attorney-review templates
(each carries a "Template notice" at the top), and this review does not
attempt to judge whether their substance meets any jurisdiction's actual legal
requirements — that requires qualified counsel, as the documents themselves
say. What this review *does* cover:

1. **Internal consistency** — do the legal documents accurately describe the
   system as it actually exists in code (payment providers, dispute types,
   refund mechanics), and are their cross-references to each other correct?
2. **Translation completeness** — does every English string have a Swahili
   counterpart, with matching `{placeholder}` tokens, so nothing silently
   falls back to English or breaks at runtime?
3. **Translation quality** — spot-checking the Swahili text itself for
   grammatical correctness, register, and terminology consistency.

For (1) and (2), this review is exhaustive (every key/reference was checked
programmatically). For (3), this was done by a fluent-but-not-native reviewer
(Claude) — see "What still needs a native speaker" below.

## Issues found and fixed

### Legal documents

| # | Issue | Where | Fix |
|---|---|---|---|
| 1 | `stripe.provider.js` was still present on disk, unreferenced by any code path, despite `README.md` and the root `CHANGED_FILES.md` already claiming ("Phase 7 — Payment Provider Cleanup") that it had been deleted. Confirmed genuinely dead (no import in `payment.service.js`/`.controller.js`/`.routes.js`, no `stripe` npm dependency, `payment_method`/`method` ENUMs have excluded `'stripe'` since migration 030). | `backend/src/modules/payment/providers/stripe.provider.js` | Deleted. This also closes the gap that produced issue #2 below — the legal docs were describing a provider that the rest of the project already believed was gone. |
| 2 | Two legal documents still listed **Stripe** as an available/possible payment processor, which is now factually wrong — Stripe was replaced by **Snippe** for card payments. | `privacy-policy.md` §2, §4; `insurance-policy.md` §6 | Replaced "Stripe" with "Snippe" in the payment-processor lists (3 occurrences). |
| 3 | Dispute-type codes shown in backticks (implying literal values) didn't match the actual `disputes.type` database ENUM. Docs used the short forms `` `damaged` ``, `` `delayed` ``, `` `defective` ``, `` `missing` ``; the schema (`database/schema/disputes.sql`) defines `damaged_item`, `delayed_delivery`, `defective_product`, `missing_delivery` (`wrong_item` and `other` were already correct). | `terms-of-service.md` §5 table; `delivery-liability-policy.md` §3; `insurance-policy.md` §4 | Corrected all four short-form codes to their real enum values, in all three documents. |
| 4 | `vendor-agreement.md` §6 pointed readers to **"Section 7 of the Insurance Policy"** for how courier-caused losses "may be covered." Insurance Policy §7 is actually "Future changes" (a placeholder for a not-yet-built insurance product) — the relevant content is §2, "What is protected, by whom," which is the coverage/funding table. | `vendor-agreement.md` §6 | Corrected the cross-reference from §7 to §2. |

### Translations

| # | Issue | Where | Fix |
|---|---|---|---|
| 5 | `auth.roleLabel`'s Swahili value was `"Nataka ku"` — a bare verb prefix ("ku-") with no verb attached. Confirmed via `frontend/src/pages/Register.jsx` that this string renders **standalone** as a `<label>` above the role dropdown (it is not concatenated with the option text below it, which are already-complete verb phrases like "Nunua bidhaa"), so the rendered Swahili UI would show a grammatically dangling fragment. | `frontend/src/context/LanguageContext.jsx` (`sw` dictionary) | Changed to `"Nataka kufanya nini"` ("What I want to do") — a complete, standalone-correct label. |
| 6 | `cart.empty`'s Swahili value, `"Kikapu chako ki tupu"`, uses a contracted/spoken-register copula. Standard written Swahili for a statement of state uses the locative `-ko` form. | `frontend/src/context/LanguageContext.jsx` (`sw` dictionary) | Changed to `"Kikapu chako kiko tupu"`. |

## Checks that passed cleanly (no issues found)

- **Key parity, backend catalog** (`en.js` vs `sw.js`): all 77 dot-namespaced
  keys present in both, none extra in either.
- **Key parity, frontend catalog** (`LanguageContext.jsx` `en` vs `sw`): all
  114 keys present in both, none extra in either.
- **`{placeholder}` token parity**: every shared key's placeholder set
  matches exactly between English and Swahili, in both catalogs (this is the
  class of bug that silently breaks interpolation, e.g. a Swahili string
  missing `{orderNumber}` that the English one has).
- **No untranslated strings**: no Swahili value is byte-identical to its
  English counterpart where the string contains real words (as opposed to,
  e.g., a shared numeral or brand name).
- **Terminology consistency**: core domain terms are used consistently across
  both catalogs and don't drift into synonyms — *wakala* (agent), *usafirishaji*
  (delivery/shipping), *agizo* (order), *mgogoro* (dispute), *pochi* (wallet),
  *duka* (store).
- **Internal legal cross-references**: every other `§`/"Section N" reference
  (both within a document and across documents) was checked against the
  target section's actual heading and content; all resolved correctly except
  issue #4 above. All five `/legal/:slug` links in the markdown resolve to a
  real entry in `frontend/src/data/legalDocs.js`.
- **Dispute-flow accuracy**: the resolution outcomes described in the legal
  docs (full refund, partial refund, replacement, compensation, rejection)
  match `disputes.resolution` in the schema; the wallet-reversal funding
  mechanism described matches `wallet_transactions` / `dispute.service.js`.

## Regression tests added

Both catalog-parity checks above are now enforced by tests, so future edits
that add a key to one language without the other (or change a placeholder
name in one but not the other) will fail CI instead of silently shipping:

- `backend/tests/unit/i18n/i18n.test.js` — new `"i18n locale catalog parity"`
  suite, checks every `SUPPORTED_LOCALES` catalog against `en.js` for missing
  keys, extra keys, and placeholder mismatches.
- `frontend/tests/context/LanguageContext.test.jsx` — new file, same three
  checks against `DICTIONARY` (now exported from `LanguageContext.jsx` for
  this purpose), plus a check for blank/whitespace-only translated strings.

## What still needs a native speaker or counsel (not fixed here)

These are flagged as findings, not fixed, because fixing them well requires
judgment this review can't safely substitute for:

- **No Swahili version of any legal document exists.** All five documents in
  `frontend/src/legal/` are English-only, even though the rest of the
  platform (UI strings and backend notifications) is fully bilingual. A
  Swahili-speaking user who only reads the Swahili UI still has to read
  binding legal terms in English. Translating five substantial legal
  documents accurately is a task for a qualified legal translator, not this
  review.
- **`terms-of-service.md` §5's table refers to "our Dispute Resolution
  Policy (Section 6)"** as if that were a separate, named document. It isn't
  — there is no sixth legal document; "Section 6" is a section of the Terms
  of Service itself, titled "Dispute resolution process." This reads as a
  minor internal naming inconsistency (implying a document that doesn't
  exist) rather than a broken link (there's no hyperlink here, just prose),
  so it was left for a documentation-owner decision on whether to rename the
  ToS section, rename this reference, or actually split it into its own
  document.
- **`auth.termsPrefix`'s Swahili value drops the "NEXORA's" possessive**
  present in the English original ("I agree to **NEXORA's** Terms of Service
  and Privacy Policy" vs. "Nakubali Masharti ya Huduma na Sera ya Faragha" —
  "I agree to the Terms of Service and Privacy Policy"). The resulting
  Swahili sentence is grammatically correct and unambiguous (there's only one
  Terms of Service on the platform), so this is a minor fidelity note rather
  than a bug. Fixing it properly means restructuring how `Register.jsx`
  concatenates `termsPrefix` + the two linked terms (the possessive would
  need to attach after both nouns, e.g. "...vya NEXORA" at the end, not
  before them), which is a component change, not a string change — left as a
  finding.
- **Open template placeholders** (already self-flagged by the documents'
  own "Template notice" banners, restated here for visibility): the
  governing-law jurisdiction in `terms-of-service.md` §12, the commission
  rate and payout timing in `vendor-agreement.md`, and the exact dispute
  evidence time window in `delivery-liability-policy.md` §7 are all
  placeholders pending confirmation from qualified counsel and NEXORA's
  actual `Admin → Settings` configuration. This was already called out in
  `REMAINING_WORK.md` before this review and remains accurate.

## Files touched in this phase

See `CHANGED_FILES.md` in `phase-8.zip` for the full list with descriptions.
