-- Admin support columns
-- Run this in phpMyAdmin (SQL tab) on your NEXORA database.
-- Adds moderation/verification flags to tables that already exist.
-- If any column already exists (e.g. you added it yourself), just skip that line.

-- Let admins deactivate a user account without deleting their order history
ALTER TABLE users
    ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE;

-- Seller verification badge (SRS 2.2 / 4.2 - only verified sellers can publish products)
ALTER TABLE seller_profiles
    ADD COLUMN is_verified BOOLEAN NOT NULL DEFAULT FALSE;

-- Let admins remove inappropriate products without breaking order history
-- (hard-deleting a product would orphan existing order_items/reviews)
ALTER TABLE products
    ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE;
