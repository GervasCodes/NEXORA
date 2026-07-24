# NEXORA

NEXORA is a regional multi-seller e-commerce marketplace built for a
Tanzanian buyer base, connecting buyers, sellers, and delivery agents on
one platform. Prices default to TZS.

## Stack

- **Backend**: Node.js / Express, MySQL 8 (Aiven-hosted, SSL), Socket.IO
- **Frontend**: React + Vite
- **Media**: Cloudinary
- **Payments**: Snippe (hosted card/mobile-money/QR checkout), PayPal,
  and direct mobile money via Selcom and MalipoPay
- **Email**: Brevo HTTPS API (OTP login, account notifications — no SMTP)
- **Push**: Web Push via a service worker
- **Delivery tracking**: Leaflet / OpenStreetMap, Bolt-style live tracking
  with auto-offer-to-nearest-agent and a 30-second acceptance timeout

## Project structure

```
NEXORA/
├── backend/          Express API, one module per domain under src/modules/
├── frontend/          React + Vite app
├── database/          Numbered SQL migrations, seeders, migration runner
├── docs/               API.md, DATABASE.md, DEPLOYMENT.md, SRS.md,
│                        CHANGELOG.md, ESCROW_ANALYSIS.md, REFUNDS.md,
│                        ROUTING.md
└── assets/
```

## Getting started

See **`docs/DEPLOYMENT.md`** for the full setup guide (database creation,
migrations, environment variables, and both local and production
deployment). Short version:

```bash
# database
cd database && npm install && npm run migrate && npm run seed

# backend
cd ../backend && npm install && npm run dev

# frontend
cd ../frontend && npm install && npm run dev
```

Useful scripts:

| | backend | frontend |
|---|---|---|
| dev server | `npm run dev` | `npm run dev` |
| build | — | `npm run build` |
| lint | `npm run lint` | `npm run lint` |
| unit tests | `npm run test:unit` | `npm test` |
| integration tests | `npm run test:integration` | — |
| db-integration tests | `npm run test:db` (needs a real MySQL — see `docs/DATABASE.md`) | — |

## Documentation

- **`docs/API.md`** — endpoint reference, module by module, plus the
  admin dispatch Socket.IO event reference
- **`docs/DATABASE.md`** — schema overview by domain, migration process,
  and the three-tier test suite (unit / integration / db-integration)
- **`docs/DEPLOYMENT.md`** — full local-to-production deployment guide
- **`docs/SRS.md`** — software requirements specification
- **`docs/CHANGELOG.md`** — phase-by-phase history of the
  homepage/marketplace upgrade project
- **`docs/ESCROW_ANALYSIS.md`**, **`docs/REFUNDS.md`**,
  **`docs/ROUTING.md`** — design notes for the escrow/payment-holding
  system, refund handling, and delivery routing/ETA respectively

Per-phase implementation notes for the three most recent phases live at
the repo root: `README-phase-10A.md`, `README-phase-10B.md`,
`README-phase-10C.md`.

## Feature overview

**Marketplace & discovery** — department-first and product-first
browsing, product search with autocomplete and debouncing, filters
(price, seller, region, rating) and sort, infinite scroll, skeleton
loaders, sponsored product/store/department placement, store profiles
with trust info, collections, themes, and branding, product
videos/audio, photo reviews with seller replies.

**Buyer experience** — cart, multi-vendor order splitting (one order per
seller from a single checkout), wishlist/save-for-later, Bolt-style live
delivery tracking, Web Push and in-app notifications, buyer-seller and
buyer-agent chat, disputes, English/Swahili language support with a
theme and currency preference.

**Seller tools** — product management (images/video/audio), seller
analytics, wallet and payout requests, seller verification with a paid
Verified Seller badge, collections, store branding/theming, sponsorship
campaigns (products, store, or department-level).

**Delivery** — agent shift toggle, auto-offer to nearest agent with a
30-second timeout, Tanzania distance-band pricing (haversine + admin
configurable bands, flat-fee fallback when no pickup pin is set),
live position tracking, post-delivery ratings, vehicle
type/plate capture.

**Payments** — Snippe, PayPal, and mobile money (Selcom, MalipoPay), plus
cash-on-delivery; collect-then-disburse split covering platform
commission, seller share, and agent delivery fee; escrow-style holding
of captured payments with admin-triggered release to the seller wallet
once delivery is confirmed.

**Admin** — dashboard and analytics, live dispatch overview (Socket.IO
driven), fraud flag review, audit log, refund management, user/seller/
product moderation, sponsorship campaign oversight, withdrawal approval,
platform settings, and (for super admins) admin account management.

**Platform hardening** — Helmet security headers, gzip compression, rate
limiting, an in-memory TTL cache for platform settings, FULLTEXT search
indexing, composite indexes, React route-based code splitting, OTP-based
login and password recovery via Brevo, and memoized React context/
component rendering to avoid whole-tree re-renders (Phase 10C).

## Project history

NEXORA went through two sequential improvement efforts after its initial
build:

1. **Maintenance roadmap** (10 phases) — gateway consolidation (Stripe
   removed, Snippe added), moving all email off SMTP onto Brevo's HTTPS
   API, multi-vendor order splitting, delivery agent vehicle/ratings,
   Tanzania distance-band delivery pricing, disputes, legal docs,
   multi-language support, UI animation, and automated testing.
2. **Homepage/marketplace upgrade project** (10 phases, detailed in
   `docs/CHANGELOG.md`) — homepage and department discovery, department
   marketplace pages, product discovery/filtering, product card
   redesign, store profiles, store content (video/audio/reviews),
   seller branding, the sponsored marketplace, an escrow-style payment
   trust system, and this final testing/optimization/documentation pass.

As of the most recent verification session, the backend passes 390 unit
+ 15 integration tests with 0 lint errors, and the frontend passes 101
tests with a clean build and 0 lint errors. Known gaps: the
db-integration suite has not been run against a real production-like
MySQL instance in CI, payment providers haven't been exercised against
live sandboxes, legal docs have no Swahili translation yet, and OSRM
routing defaults to the public demo server rather than a self-hosted
instance — see `docs/DEPLOYMENT.md` for the production checklist.
