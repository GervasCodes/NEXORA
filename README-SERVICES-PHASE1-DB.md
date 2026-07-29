# Nexora Services — Phase 1 (Foundation): DB layer

Following CHANGES.md's own 5-phase roadmap (Foundation → Booking
Infrastructure → Financial Integration → Customer Experience → Growth).
This delivery is **DB only**. Backend, frontend, and UI/UX for Phase 1
follow as their own zips.

## What this adds

One new migration: `database/migrations/062_services_foundation.sql`.
Full reasoning is in the file's own header comment (matches the style of
every other migration in this project) — short version:

1. **Merchant Type System** — `seller_profiles.merchant_type` ENUM
   (`product` / `service` / `hybrid`), defaults to `product`. Every
   existing seller keeps working exactly as before; nothing changes
   until a seller explicitly opts into Services.
2. **Service Providers** — deliberately **not** a new table. CHANGES.md's
   "Service Provider" entity maps onto the seller_profiles row that
   already exists (store name, logo, banner, verification). A second
   table would duplicate merchant data and split verification across two
   places — against CHANGES.md's own "Reuse Existing Infrastructure"
   principle.
3. **Service Categories** — new `service_categories` table (own taxonomy,
   not the product `categories` table), seeded with the four Phase 1
   categories from CHANGES.md: Accommodation, Transportation, Tourism,
   Business Spaces.
4. **Service Listings** — new `services` table (title, description,
   pricing model, base price, location, draft/published/suspended
   status) and `service_media` (image/video gallery, mirrors
   `product_images`).

## What this deliberately leaves out (comes in Phase 2+)

- `service_availability`, `bookings`, `booking_items`, `provider_payouts`
  — CHANGES.md's own roadmap puts these under Phase 2 (Booking
  Infrastructure), not Phase 1.
- Escrow/payout wiring, reviews-for-services, notifications — Phase 3/4,
  reusing the existing wallet/escrow/review/notification systems as-is
  per CHANGES.md's Core Principles.

## Files in this zip

```
database/migrations/062_services_foundation.sql   (new)
docs/DATABASE.md                                   (updated — schema overview entry)
```

## To apply

```bash
cd database
npm run migrate          # applies 062 along with any other pending migrations
npm run migrate:status   # confirm it's marked applied
```

Safe to re-run: the category seed uses
`ON DUPLICATE KEY UPDATE`, and every `CREATE TABLE` uses
`IF NOT EXISTS`.

## Next: Backend

Once you confirm this schema looks right, next up is the backend module
(`backend/src/modules/service/` + `serviceCategory/`, following the
existing `category`/`storeType`/`seller` module pattern — repository /
service / controller / validator / routes), wired into `app.js` at
`/api/v1/services` and `/api/v1/service-categories`.
