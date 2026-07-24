-- Migration 048: seller store theme
-- Phase 7A (Store Themes). Additive only.
--
-- A small, fixed set of accent-color presets a seller can pick for their
-- public store page (StorePage.jsx) - not a free-form color picker or
-- custom CSS. The allowed values are enforced in application code
-- (seller.validator.js's isIn(...) list) rather than a SQL ENUM so that
-- adding a new preset later doesn't require another migration, matching
-- how store_type_id (a similar "pick one of a small admin-defined set")
-- already works via a lookup table rather than an ENUM - the important
-- difference here is the preset list is small/fixed/code-level rather
-- than admin-editable, so a lookup table would be overkill.
ALTER TABLE seller_profiles
    ADD COLUMN store_theme VARCHAR(20) NOT NULL DEFAULT 'default' AFTER store_banner;
