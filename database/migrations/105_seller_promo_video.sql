-- Migration 105: seller promo video (Phase 7 - Promo Video Unification).
--
-- One nullable URL column, same additive shape as store_logo/store_banner
-- (003_create_seller_profiles.sql) and the store_tagline/social_* columns
-- 049_seller_branding.sql added on top of them - free-text URL the seller
-- controls, no lookup table, no ENUM.
--
-- This is deliberately store-level (one video per seller, managed from
-- the Promote hub - see SellerPromote.jsx), not tied to any single
-- sponsorship/featured-store/department-sponsorship campaign row: those
-- three campaign types are pure paid-visibility scheduling and stay
-- untouched (no columns added to sponsorship_campaigns / featured_store_
-- campaigns / department_sponsorship_campaigns here). Uploaded through
-- the existing uploadVideo.middleware.js + uploadToCloudinary("video")
-- pipeline product videos already use (044_product_videos.sql) - no
-- parallel upload path.
ALTER TABLE seller_profiles
    ADD COLUMN promo_video_url VARCHAR(500) NULL AFTER store_banner;
