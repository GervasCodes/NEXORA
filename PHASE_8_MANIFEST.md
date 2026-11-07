# Phase 8 - Small gaps (Workstream B)

Frontend + one doc. Unzip over the repository root (paths start with NEXORA/). No backend change, no migration.

## What changed
- PageMeta (title + description):
  - `ProductFeed.jsx`: "All products" + the existing browse description (en/sw keys already existed). Indexable;
    PageMeta's canonical drops the query string, so filtered and store-scoped feeds all canonicalize to `/feed`.
  - `legal/LegalPage.jsx`: this route is only a redirect to `/terms#<slug>`, whose text is the indexable copy.
    It now sets the document title and a description and is marked `noindex, follow` so `/legal/:slug` can never
    compete with `/terms` as a duplicate. Unknown slugs still show NotFound (already `noindex`).
- Sticky mobile CTA (same pattern as the ProductDetail buy bar: `md:hidden`, `fixed inset-x-0`,
  `bottom-[var(--bottom-inset)]`, `z-[var(--z-float)]`, plus a spacer), via one small shared component:
  - `StorePage`: "Shop this store" -> store feed. Hidden for the store's owner. Placed outside PullToRefresh.
  - `GroupBuyDetail`: open group -> group price + Join (signed-out visitors go to sign-in with a way back, same as the
    inline button; hidden after joining); successful group -> "Claim your price" opens the claim form and scrolls to it.
    Not shown to sellers/agents or non-open groups.
  - `/sell` (`Marketing.jsx#SellOnNexora`): "Create a seller account" -> `/register`. Hidden when signed in.
- `docs/design/MOBILE_QA_CHECKLIST.md`: 360px / 390px checklist for Home, Product detail, Checkout (+ the new bars).
  Document only. Nothing in it is ticked and no visual verification is claimed.

## Files added (8)
- frontend/src/components/StickyMobileCta.jsx
- docs/design/MOBILE_QA_CHECKLIST.md
- frontend/tests/components/StickyMobileCta.test.jsx
- frontend/tests/pages/ProductFeed.test.jsx
- frontend/tests/pages/LegalPage.test.jsx
- frontend/tests/pages/GroupBuyDetail.test.jsx
- frontend/tests/pages/SellOnNexora.test.jsx
- PHASE_8_MANIFEST.md (this file)

## Files modified (8)
- frontend/src/pages/ProductFeed.jsx, legal/LegalPage.jsx, StorePage.jsx, GroupBuyDetail.jsx, Marketing.jsx
- frontend/src/i18n/en.js, sw.js (6 keys each: `legal.metaDescription`, `store.stickyShop`, `group.sticky.*`)
- frontend/tests/pages/StorePage.test.jsx (auth mock is now switchable; 3 new tests)

## Files deleted
None.

## New env vars / migrations / dependencies
None.

## How to test
    cd frontend
    npx vitest run tests/components/StickyMobileCta.test.jsx tests/pages/ProductFeed.test.jsx \
        tests/pages/LegalPage.test.jsx tests/pages/GroupBuyDetail.test.jsx tests/pages/SellOnNexora.test.jsx \
        tests/pages/StorePage.test.jsx
    npx vitest run          # full suite
    npx eslint src tests
    npx vite build

Manual: open the three pages at 360px and 390px (see docs/design/MOBILE_QA_CHECKLIST.md section 4) and at 768px+
to confirm the bar is gone. View page source / head for `/feed` (title + description, no robots tag) and
`/legal/privacy-policy` (robots `noindex, follow`).

## Notes for you
- Meta tests capture PageMeta's props, because react-helmet-async is mocked globally in tests/setupTests.js.
- The `/sell` bar links to `/register`, which defaults to the Buyer role (see the last section of the QA checklist).
