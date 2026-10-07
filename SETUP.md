# NEXORA setup package

This package holds every file changed in this session. Copy each file into the
same path in your repo (overwrite the existing file). Then do the steps below.

## 1. Copy the files
Copy everything under this folder into the root of your NEXORA repo.
Files are placed at their original repo paths.

## 2. Delete the files in DELETE_THESE_FILES.txt

## 3. Run the database migrations, in order
Run these after your existing migrations (the highest one so far is 134):

- 135_store_opening_hours.sql  (adds seller_profiles.opening_hours)
- 136_wishlist_saved_price.sql (adds wishlist_items.saved_price)
- 137_public_call_number.sql   (adds seller_profiles.public_phone)
- 138_drop_seller_loans.sql    (drops the unused seller_loans table)

All four are safe to re-run. Use your usual migration command, for example:
    cd database && <your migration runner>

## 4. Backend
    cd backend
    npm install
    npm test                       # unit + integration suites

Real-database tests (needs Docker):
    docker compose -f docker-compose.test.yml up -d
    npm run test:db                # includes the new concurrency.db.test.js

## 5. Frontend
    cd frontend
    npm install
    npm run build
    npm test

## 6. Check these by hand
- Profile photo: choosing a photo opens the crop step before upload.
- Store page: sold count, reply time and hours show only when there is data;
  a store with no banner shows the themed fallback banner.
- Store form: new "Public call number" field. When set, Call buttons appear on
  the store and service pages.
- Service page: gallery swipes on touch, Similar services appear, WhatsApp button
  appears when set.
- Saved page: "Price down X%" badge shows only on items saved after this update.
- Delivery earnings: each row shows Held until / Released; the tip appears at top.

## Known gaps (not built)
- Opening hours have no seller editing screen yet, so the line stays hidden
  until sellers can set hours.
- Price-drop badges need a save-time price, so older saved items show no badge.
- Time slots and register/login changes are not included.
- Loan money history stays in the wallet ledger; only the feature was removed.
