-- Migration 065: Nexora Services — Phase 4 (Customer Experience)
-- Depends on: reviews (009), review_photos (046), seller_reply (047),
-- bookings (063), services (062)
--
-- Covers the three items CHANGES.md's own roadmap lists under Phase 4:
-- Reviews, Notifications, Search & Filters.
--
-- Design notes:
--  - Reviews: per CHANGES.md's "Reuse Existing Infrastructure" principle
--    (and per service.repository.js's own Phase 1 comment, which already
--    flagged this as deferred to Phase 4), a booking review is NOT a new
--    table. It's the same `reviews` row shape as a product review, just
--    keyed on booking_id instead of product_id — same columns
--    (rating/comment/photos/reply), same review_photos table, same
--    seller_reply/seller_reply_at columns (a provider's reply to a
--    booking review is functionally identical to a seller's reply to a
--    product review — one editable reply, no thread — so reusing the
--    column instead of adding provider_reply/provider_reply_at avoids
--    two columns that would only ever be populated in mutual exclusion).
--  - product_id becomes nullable and booking_id is added, with a CHECK
--    ensuring exactly one of the two is set — mirrors how bookings
--    themselves reuse orders' payment/escrow tables (migration 064)
--    rather than forking a parallel schema.
--  - unique_buyer_booking mirrors unique_buyer_product: one review per
--    buyer per booking (editable, not duplicated).
--  - fk_reviews_booking has ON DELETE CASCADE, same as fk_reviews_product.
--  - Search & Filters: services gets the same FULLTEXT index products
--    got in migration 022, so service.repository.js can reuse
--    utils/productSearch.js's buildProductSearchPlan as-is instead of a
--    parallel implementation (title/description is the service
--    equivalent of products' name/brand/description). Mirrors
--    ft_products_search (022).
--  - Notifications: no schema change — review-received / reply-received
--    events reuse the existing notifications table via
--    notificationService.notify(), same as every other module.

-- 1. Reviews: allow booking-keyed reviews alongside product-keyed ones --

ALTER TABLE reviews
    MODIFY COLUMN product_id INT NULL,
    ADD COLUMN booking_id INT NULL AFTER product_id;

ALTER TABLE reviews
    ADD CONSTRAINT fk_reviews_booking
        FOREIGN KEY (booking_id) REFERENCES bookings(id)
        ON DELETE CASCADE;

ALTER TABLE reviews
    ADD CONSTRAINT chk_reviews_target
        CHECK (
            (product_id IS NOT NULL AND booking_id IS NULL)
            OR (product_id IS NULL AND booking_id IS NOT NULL)
        );

ALTER TABLE reviews
    ADD CONSTRAINT unique_buyer_booking UNIQUE (buyer_id, booking_id);

CREATE INDEX idx_reviews_booking ON reviews (booking_id);

-- 2. Search: FULLTEXT index for service title/description, same shape as
-- products' ft_products_search (022) --------------------------------

ALTER TABLE services
    ADD FULLTEXT INDEX ft_services_search (title, description);
