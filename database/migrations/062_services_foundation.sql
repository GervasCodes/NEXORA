-- Migration 062: Nexora Services — Phase 1 (Foundation)
-- Depends on: seller_profiles (003), users (001)
--
-- Implements the first phase of CHANGES.md's own 5-phase roadmap
-- (Foundation -> Booking Infrastructure -> Financial Integration ->
-- Customer Experience -> Growth). This migration only covers Foundation:
-- Merchant Type System, Service Categories, Service Providers, Service
-- Listings. Availability/booking/payout tables are deliberately left for
-- the Phase 2 migration (Booking Infrastructure) — CHANGES.md's "Database
-- Tables" list groups everything together, but its own Development
-- Roadmap section splits it by phase, and that's the split this project
-- is following, matching how every other multi-phase feature here has
-- shipped (see docs/CHANGELOG.md).
--
-- Design notes:
--  - "Service Provider" (CHANGES.md's Core Entities) is NOT a new table.
--    seller_profiles already IS the merchant record (store name, logo,
--    banner, contact info, is_verified) — a second table duplicating
--    that would violate CHANGES.md's own "Reuse Existing Infrastructure"
--    principle and split verification/branding across two places. A
--    seller becomes a service provider by having merchant_type include
--    services; there is no separate provider row or id.
--  - merchant_type is on seller_profiles, not users, because it's a
--    property of the *store*, not the account — consistent with every
--    other store attribute (store_name, is_verified, etc.) already living
--    there. Existing rows default to 'product' so every current seller's
--    access is completely unchanged (Permission Matrix in CHANGES.md:
--    product sellers keep Products/Inventory/Orders/Shipping and stay
--    restricted from Services/Bookings/Availability until they opt in).
--  - service_categories is a separate table from `categories`, not a
--    repurposing of it. `categories` already has a disabled 'services'
--    row (migration 055) that exists purely so the old product-department
--    grid can hide it — that row is untouched by this migration. Product
--    departments (Electronics, Fashion, ...) and service categories
--    (Accommodation, Transportation, ...) are different taxonomies with
--    different admins-facing meaning, so keeping them as separate tables
--    avoids overloading one is_active flag with two unrelated meanings.
--    Column shape (name/slug/description/cover_image_url/display_order/
--    is_active) intentionally mirrors `categories` (002, 040) so the
--    admin UI and repository patterns can be reused directly.
--  - services.provider_id references users(id), exactly like
--    products.seller_id does — NOT seller_profiles(id). Every existing
--    module (auth middleware's req.user.id, seller.repository's
--    findByUserId, products' own sp.user_id = p.seller_id join) treats
--    the JWT-carried users.id as the identity and looks up
--    seller_profiles via user_id when it needs store details. Keeping
--    provider_id on that same convention means the service module can
--    reuse the identical "seller_id -> JOIN seller_profiles sp ON
--    sp.user_id = X.seller_id" pattern products already uses, instead of
--    introducing a second identity convention into the codebase.
--  - pricing_model is a plain ENUM covering the Phase 1 category set
--    (Accommodation/Transportation/Tourism/Business Spaces) from
--    CHANGES.md's own Availability Engine examples (per-night rooms,
--    per-day car rentals, per-person tour seats, flat hall bookings).
--    Availability-driven date/unit pricing itself is Phase 2 — base_price
--    here is the listing's starting/display price shown before a date is
--    picked, same role products.price plays before cart/checkout math.
--  - service_media mirrors product_images (004) exactly, plus a
--    media_type column, since CHANGES.md's ServiceMedia entity is
--    image/video (the existing product_media video/audio work — 045 —
--    already established the "type enum on a media row" pattern this
--    reuses).
--  - No changes to reviews/wallet/escrow/notifications yet — those are
--    reused as-is starting in later phases, exactly as CHANGES.md's Core
--    Principles specify.

-- 1. Merchant Type System -----------------------------------------------
-- Existing rows default to 'product', so this is a no-op for every
-- current seller until they explicitly switch (Phase 1 backend adds the
-- endpoint for that). Widening to 'service' or 'hybrid' is what unlocks
-- the Services module of the seller dashboard.
ALTER TABLE seller_profiles
    ADD COLUMN merchant_type ENUM('product', 'service', 'hybrid')
        NOT NULL DEFAULT 'product' AFTER user_id;

-- 2. Service Categories ---------------------------------------------------
CREATE TABLE IF NOT EXISTS service_categories (
    id INT AUTO_INCREMENT PRIMARY KEY,

    name VARCHAR(100) NOT NULL UNIQUE,
    slug VARCHAR(120) NOT NULL UNIQUE,
    description VARCHAR(255) NULL,

    cover_image_url VARCHAR(500) NULL,
    display_order INT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Phase 1 categories, per CHANGES.md's own "Phase 1 Categories" section.
-- Idempotent: safe to re-run on a database that already has these.
INSERT INTO service_categories (name, slug, description, display_order) VALUES
    ('Accommodation', 'accommodation', 'Hotels, apartments, villas, guest houses and lodges', 1),
    ('Transportation', 'transportation', 'Car rentals, motorcycle rentals and airport transfers', 2),
    ('Tourism', 'tourism', 'Tours, safari packages and travel experiences', 3),
    ('Business Spaces', 'business-spaces', 'Conference halls, meeting rooms and training facilities', 4)
ON DUPLICATE KEY UPDATE name = name;

-- 3. Service Listings -----------------------------------------------------
CREATE TABLE IF NOT EXISTS services (
    id INT AUTO_INCREMENT PRIMARY KEY,
    provider_id INT NOT NULL,
    category_id INT NULL,

    title VARCHAR(200) NOT NULL,
    slug VARCHAR(220) NOT NULL UNIQUE,
    description VARCHAR(2000) NULL,

    pricing_model ENUM('fixed', 'per_night', 'per_hour', 'per_day', 'per_person')
        NOT NULL DEFAULT 'fixed',
    base_price DECIMAL(12, 2) NOT NULL,
    discount_price DECIMAL(12, 2) NULL,

    country VARCHAR(100) NULL,
    region VARCHAR(100) NULL,
    city VARCHAR(100) NULL,
    address VARCHAR(255) NULL,
    lat DECIMAL(10, 7) NULL,
    lng DECIMAL(10, 7) NULL,

    -- draft: provider is still editing, never shown publicly.
    -- published: live and bookable (once Phase 2 ships booking).
    -- suspended: admin-hidden (policy violation, disabled provider, etc.),
    -- distinct from is_active so a provider's own pause/unpause action
    -- doesn't clobber an admin suspension, same split products.is_active
    -- vs seller account suspension already relies on.
    status ENUM('draft', 'published', 'suspended') NOT NULL DEFAULT 'draft',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_services_provider
        FOREIGN KEY (provider_id) REFERENCES users(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_services_category
        FOREIGN KEY (category_id) REFERENCES service_categories(id)
        ON DELETE SET NULL
);

CREATE INDEX idx_services_provider ON services (provider_id);
CREATE INDEX idx_services_category_status ON services (category_id, status);
CREATE INDEX idx_services_city ON services (city);

-- 4. Service Media ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS service_media (
    id INT AUTO_INCREMENT PRIMARY KEY,
    service_id INT NOT NULL,

    media_url VARCHAR(500) NOT NULL,
    media_type ENUM('image', 'video') NOT NULL DEFAULT 'image',
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    display_order INT NOT NULL DEFAULT 0,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_service_media_service
        FOREIGN KEY (service_id) REFERENCES services(id)
        ON DELETE CASCADE
);

CREATE INDEX idx_service_media_service ON service_media (service_id);
