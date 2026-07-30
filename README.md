# NEXORA

NEXORA is a regional multi-vendor e-commerce platform that connects buyers, sellers, service providers, and delivery agents in one marketplace. Alongside physical products, NEXORA supports bookable services (accommodation, transportation, tours, and more), with secure payments, escrow-backed order protection, and real-time delivery tracking.

## What you can do on NEXORA

- **Buyers** — browse departments and service categories, search and filter products or services, chat with sellers, place orders, pay securely, track deliveries in real time, leave reviews, and raise disputes if something goes wrong.
- **Sellers** — set up a storefront, list products or bookable services, manage orders and availability, run sponsorship/featured-store campaigns, track earnings, and withdraw from a wallet.
- **Delivery agents** — pick up available deliveries, manage their own queue, and track earnings and ratings.
- **Admins** — verify sellers, moderate products and categories, resolve disputes and fraud flags, manage sponsorships, and oversee the platform via an audit log.

## Tech stack

**Frontend**
- React 18 + React Router
- Tailwind CSS
- Vite (dev server / build)
- Socket.IO client (real-time chat & notifications)
- Leaflet / React-Leaflet (delivery tracking maps)
- Vitest + Testing Library

**Backend**
- Node.js + Express 5
- MySQL (via `mysql2`)
- JWT authentication, bcrypt password hashing
- Socket.IO (real-time events)
- Cloudinary (media storage)
- node-cron (scheduled jobs), web-push (push notifications)
- Jest + Supertest

**Database**
- MySQL schema managed through sequential, numbered SQL migrations (65+ at time of writing) with matching seeders

## Project structure

```
NEXORA/
├── frontend/          React SPA (buyer, seller, delivery, and admin experiences)
│   └── src/
│       ├── pages/         Route-level pages (Home, ServicesBrowse, DepartmentPage, seller/, admin/, delivery/ ...)
│       ├── components/    Shared UI (Header, ProductGrid, ServiceCard, DepartmentCard ...)
│       └── context/       App-wide React context (auth, currency, etc.)
├── backend/           Express API
│   └── src/modules/       One folder per domain (auth, product, service, booking, order,
│                           payment, wallet, dispute, sponsorship, admin, ...), each with its
│                           own routes/controller/service/repository
├── database/
│   ├── migrations/        Sequential, numbered schema changes
│   ├── seeders/            Sample/reference data
│   └── schema/             Baseline schema reference
├── docs/              API reference, database docs, deployment notes, SRS, etc.
└── assets/            Shared static assets
```

## Core features

- **Departments & products** — homepage department grid, filtering, search, product detail pages, seller product management.
- **Services & bookings** — a dedicated Services section with its own categories (accommodation, transportation, tours, etc.), availability calendars, and a booking flow, separate from the product-buying flow.
- **Orders & payments** — cart, checkout, escrow-backed payments, refunds, and order tracking.
- **Delivery** — delivery agent dispatch, live tracking, and buyer delivery confirmation.
- **Trust & safety** — seller/account verification, fraud checks, disputes, reviews and ratings, admin audit logs.
- **Growth tools** — seller sponsorship campaigns, featured stores, and department sponsorship placements.
- **Messaging & notifications** — real-time chat between buyers and sellers, in-app and push notifications.

## Getting started

### Prerequisites
- Node.js 18+
- MySQL

### Backend
```bash
cd backend
npm install
npm run db:migrate   # apply database migrations
npm run db:seed      # optional: load sample data
npm run dev           # starts the API with nodemon
```

### Frontend
```bash
cd frontend
npm install
npm run dev           # starts the Vite dev server
```

### Tests
```bash
# backend
cd backend && npm test

# frontend
cd frontend && npm test
```

## Documentation

More detailed docs live in [`docs/`](./docs), including:
- [`docs/API.md`](./docs/API.md) — API module map and endpoint reference
- [`docs/DATABASE.md`](./docs/DATABASE.md) — database schema notes
- [`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md) — deployment notes
- [`docs/SRS.md`](./docs/SRS.md) — software requirements specification
- [`docs/ROUTING.md`](./docs/ROUTING.md) — frontend routing map
- [`docs/REFUNDS.md`](./docs/REFUNDS.md) / [`docs/ESCROW_ANALYSIS.md`](./docs/ESCROW_ANALYSIS.md) — payment protection details
