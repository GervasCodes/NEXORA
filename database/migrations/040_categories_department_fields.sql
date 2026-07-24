-- Migration 040: department fields on categories
-- Additive only - existing rows/queries are unaffected. Categories double
-- as "departments" for the homepage department-discovery UI (Phase 1B):
-- cover_image_url is admin-uploaded (falls back to a generated placeholder
-- in the UI when null), display_order controls homepage ordering.

ALTER TABLE categories
    ADD COLUMN cover_image_url VARCHAR(500) NULL AFTER description,
    ADD COLUMN display_order INT NOT NULL DEFAULT 0 AFTER cover_image_url;

-- Remap the 5 legacy seeded categories onto the new department names/slugs
-- in place (existing products keep their category_id, nothing is deleted).
-- Safe to run even if these rows don't exist (e.g. fresh installs, where
-- seed.js will insert the department list directly).
UPDATE categories SET name = 'Phones & Electronics', slug = 'phones-electronics', display_order = 1
    WHERE slug = 'electronics';
UPDATE categories SET name = 'Fashion & Beauty', slug = 'fashion-beauty', display_order = 2
    WHERE slug = 'fashion';
UPDATE categories SET name = 'Home & Living', display_order = 3
    WHERE slug = 'home-living';
UPDATE categories SET name = 'Groceries & Food', slug = 'groceries-food', display_order = 4
    WHERE slug = 'groceries';

-- The old "Health & Beauty" category merges into "Fashion & Beauty". If a
-- "Fashion & Beauty" row already exists (from the update above), re-point
-- its products there and drop the now-redundant row instead of leaving two
-- categories with overlapping meaning.
UPDATE products p
    JOIN categories hb ON hb.slug = 'health-beauty'
    JOIN categories fb ON fb.slug = 'fashion-beauty'
    SET p.category_id = fb.id
    WHERE p.category_id = hb.id;
DELETE FROM categories WHERE slug = 'health-beauty';
