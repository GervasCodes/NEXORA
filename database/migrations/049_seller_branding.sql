-- Migration 049: seller branding (tagline + social links)
-- Phase 7B (Branding). Additive only.
--
-- Four new nullable columns on seller_profiles, all plain display fields
-- following the exact shape store_logo/store_banner/store_theme already
-- use (no lookup table, no ENUM - free text the seller controls):
--
--   store_tagline     - a short one-line hook shown directly under the
--                        store name on the public store page, distinct
--                        from store_description (the longer "About"
--                        paragraph added in Phase 5A/5D). VARCHAR(150) -
--                        deliberately much shorter than store_description's
--                        1000 chars, since a tagline that wraps to three
--                        lines defeats the point of a tagline.
--   social_instagram   - Instagram handle or profile URL, seller's choice
--   social_facebook     of which to paste; validated only for length, not
--   social_whatsapp     shape, at the API layer (see seller.validator.js)
--                        because sellers commonly paste a bare handle
--                        ("@storename") rather than a full URL, and a
--                        strict URL/handle format check would reject valid
--                        input more often than it'd catch typos. All three
--                        are optional - a store with none of them simply
--                        shows no social row on its public page.
ALTER TABLE seller_profiles
    ADD COLUMN store_tagline VARCHAR(150) NULL AFTER store_description,
    ADD COLUMN social_instagram VARCHAR(150) NULL AFTER store_theme,
    ADD COLUMN social_facebook VARCHAR(150) NULL AFTER social_instagram,
    ADD COLUMN social_whatsapp VARCHAR(20) NULL AFTER social_facebook;
