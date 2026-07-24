-- Migration 047: seller replies on reviews
-- Depends on: reviews (009)
-- Additive only. Phase 6C - Enhanced Reviews.
--
-- One reply per review, owned by the seller whose product the review is
-- on (ownership is checked in review.service.js against products.seller_id
-- - there's no separate seller_id column here, same reasoning
-- review.repository.js's existing findBySeller/getSellerRatingSummary
-- give for joining through products instead of duplicating the column).
-- A single nullable TEXT + timestamp is enough: a reply is either not
-- there yet, or is the seller's current (editable) reply - there's no
-- reply history or thread, which is deliberate (see "No Social
-- Features" in this phase's title).

ALTER TABLE reviews
    ADD COLUMN seller_reply TEXT NULL AFTER comment,
    ADD COLUMN seller_reply_at TIMESTAMP NULL AFTER seller_reply;
