# Legal & Consumer Trust


  that become React Router `<Link>`s).

### 5. `frontend/src/components/Footer.jsx` (edit) — business details

New block above the legal nav, rendering a `BUSINESS_DETAILS` constant:

| Field | Placeholder |
|---|---|
| Legal business name | `[BUSINESS NAME - TO BE FILLED]` |
| BRELA registration number | `[BRELA REG. NO. - TO BE FILLED]` |
| TIN | `[TIN - TO BE FILLED]` |
| Registered physical address | `[REGISTERED PHYSICAL ADDRESS - TO BE FILLED]` |
| Support email | `[SUPPORT EMAIL - TO BE FILLED]` |
| Support phone | `[SUPPORT PHONE - TO BE FILLED]` |

**None of these exist anywhere in the repository.** I checked `backend/src/modules/settings`,
`backend/src/config`, and the env examples — there is no settings row, config file, or
environment variable holding a company name, registration number, TIN, or physical address.
They have to come from the business owner.

TIN was added beyond the phase's list because a Tanzanian consumer-facing business
typically discloses it alongside the BRELA number; drop it if it isn't wanted.

### 6. Checkout consent — `Checkout.jsx`, `order.validator.js`, `order.repository.js`, migration 110

Mirrors the signup consent pattern end to end:

| Layer | Signup (existing) | Checkout (new) |
|---|---|---|
| Field | `terms_accepted` | `checkout_terms_accepted` |
| Validation | `auth.validator.js` | `order.validator.js#checkoutValidation` |
| Stored | `users.terms_accepted_at` / `terms_version` | `orders.checkout_terms_accepted_at` / `checkout_terms_version` |
| Version constant | `CURRENT_TERMS_VERSION` in `auth.service.js` | `CURRENT_CHECKOUT_TERMS_VERSION` in `order.repository.js` |

- The checkbox links to all three documents (Terms, Privacy, **Refund**) and opens them in
  a new tab, so a buyer never loses a half-filled checkout form to read them.
- The submit button is disabled until it's ticked, plus a client-side guard gives an
  immediate in-context message rather than a bare 400.
- The timestamp is **set server-side**, never accepted from the client — same reasoning
  `auth.repository.js` documents for `terms_accepted_at`.
- Consent is recorded on the **top-level order row only**. A multi-vendor cart's per-vendor
  child orders leave it NULL: that's one purchase consented to once, not one consent per
  vendor. This mirrors how `buyer_protection_addon`/`buyer_protection_fee` already behave.

---



## Manual steps that cannot be done from code

1. **Supply the real business details** (item 5 above) — legal name, BRELA number, TIN,
   registered address, support email and phone. **This is the blocker for launch.**
2. **Run migration 110** against each environment. It has not been run.
3. **Legal review.** Both new documents carry the same template-notice blockquote the
   existing legal docs use. The Refund Policy in particular makes commitments about
   windows and remedies that should be checked against Tanzanian consumer-protection law
   before launch.
4. **Confirm the manual-refund reality.** The Refund Policy states plainly that some
   refunds are completed manually by an admin outside the app. If that's changed since the
   code comments were written, update Section 6 — it's the sentence most likely to generate
   complaints if inaccurate.
5. **Deploy frontend and backend together** (see deviation c).
6. **Decide the loyalty-points-on-refund question** (see item 1's flagged assumption).

