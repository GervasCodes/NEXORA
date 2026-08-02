-- Migration 068: Maintenance Management foundation.
--
-- Backs the new Admin Panel "Maintenance" section, which lets admins take
-- three kinds of things offline without a deploy:
--   - Departments  (categories table   - already has `is_active`, reused)
--   - Services     (service_categories - already has `is_active`, reused)
--   - Modules      (platform-wide features not tied to a category, e.g.
--                    Wallet, Wishlist, Bookings, Chat, Disputes - new
--                    `platform_modules` table below)
--
-- Departments/services already had an is_active flag (migrations 040/055
-- and the services equivalent), but flipping it only ever hid the row
-- from listings - a direct link to a disabled department returned a bare
-- 404 "not found". This migration adds a `maintenance_message` column to
-- both tables so an admin can leave a short note for shoppers, which the
-- backend now serves (as a 503 + code, instead of a 404) whenever a
-- disabled department/service is opened directly. See
-- category.service.js#getDepartmentBySlug and the serviceCategory
-- equivalent.

ALTER TABLE categories
    ADD COLUMN maintenance_message VARCHAR(255) NULL AFTER is_active;

ALTER TABLE service_categories
    ADD COLUMN maintenance_message VARCHAR(255) NULL AFTER is_active;

-- Modules: platform-wide features that don't belong to any one
-- department/service category, so they need their own on/off switch.
-- `is_active = 1` (the default) means the module works normally; flipping
-- it to 0 puts every route behind it into maintenance mode (see
-- middleware/maintenance.middleware.js and modules/maintenance).
CREATE TABLE IF NOT EXISTS platform_modules (
    id INT AUTO_INCREMENT PRIMARY KEY,
    module_key VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    description VARCHAR(255) NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    maintenance_message VARCHAR(255) NULL,
    updated_by INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_platform_modules_updated_by FOREIGN KEY (updated_by)
        REFERENCES users(id) ON DELETE SET NULL
);

-- Seed the modules that currently ship with their own dedicated
-- section/page, so the admin has something to toggle immediately after
-- this migration runs. Safe to re-run - INSERT IGNORE on the unique key.
INSERT IGNORE INTO platform_modules (module_key, name, description) VALUES
    ('wallet', 'Wallet & withdrawals', 'Seller wallet balance, earnings, and withdrawal requests'),
    ('wishlist', 'Wishlist', 'Buyers saving products for later ("Saved" page and heart icon)'),
    ('bookings', 'Bookings', 'Booking a service and managing existing bookings'),
    ('chat', 'Chat & messaging', 'Buyer-seller conversations and attachments'),
    ('disputes', 'Disputes', 'Filing and managing order/booking disputes');
