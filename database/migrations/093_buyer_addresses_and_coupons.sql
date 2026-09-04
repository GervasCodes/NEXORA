-- Migration 093: Phase 1 (UI/UX remediation) - Checkout & cart core
-- Run after 092_delivery_offer_channels.sql.
--
-- Two independent additions bundled in one migration since both are
-- small and both exist purely to reduce checkout friction:
--
-- 1) buyer_addresses - a saved address book. Checkout.jsx previously had
--    one free-text address form with nothing persisted between orders,
--    so a repeat buyer retyped their full address every single time.
--    Mirrors pickup_points' shape (address/city/region/lat/lng) rather
--    than inventing a different one, since order.service.js's checkout
--    already knows how to take "a delivery destination" and substitute
--    it into shippingInfo (see its pickup_point_id handling) - the same
--    pattern is reused for address_id below instead of a parallel one.
--
-- 2) coupons / coupon_redemptions - single-code checkout discounts.
--    Deliberately minimal: one active code per order, no stacking, no
--    per-user usage cap beyond max_redemptions (a coupon.service.js
--    concern, not a schema one) - this is scoped to "a working
--    redemption flow", not a full promotions engine.

CREATE TABLE IF NOT EXISTS buyer_addresses (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,

    -- Free-text label the buyer picks for their own reference
    -- ("Home", "Office", "Mum's place") - shown instead of the raw
    -- address in the checkout selector once there's more than one.
    label VARCHAR(60) NOT NULL DEFAULT 'Address',
    recipient_name VARCHAR(150) NULL,

    address VARCHAR(255) NOT NULL,
    city VARCHAR(100) NOT NULL,
    region VARCHAR(100) NOT NULL,
    latitude DECIMAL(10, 7) NULL,
    longitude DECIMAL(10, 7) NULL,

    phone VARCHAR(30) NOT NULL,

    -- Exactly one default per buyer, enforced in
    -- buyerAddress.service.js (unset the previous default before
    -- setting a new one) rather than a DB constraint, since MySQL has
    -- no native "unique per user where is_default = 1" construct
    -- without a generated column - not worth the complexity here.
    is_default TINYINT(1) NOT NULL DEFAULT 0,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_buyer_addresses_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_buyer_addresses_user (user_id)
);

-- checkout can reference a saved address instead of re-submitting the
-- full address every time - nullable/no FK constraint kept loose
-- deliberately (a deleted address shouldn't ever block reading an old
-- order), matching how pickup_point_id already behaves on this table.
ALTER TABLE orders
    ADD COLUMN buyer_address_id INT NULL AFTER pickup_point_id;

CREATE TABLE IF NOT EXISTS coupons (
    id INT AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(40) NOT NULL,

    discount_type ENUM('percent', 'fixed') NOT NULL,
    -- percent: 0-100 (a whole-number percentage off the subtotal)
    -- fixed: a flat TZS amount off the subtotal
    discount_value DECIMAL(12, 2) NOT NULL,

    min_order_amount DECIMAL(12, 2) NOT NULL DEFAULT 0,
    -- NULL = no cap on a percent discount's absolute value
    max_discount_amount DECIMAL(12, 2) NULL,

    -- NULL = unlimited redemptions
    max_redemptions INT NULL,
    times_redeemed INT NOT NULL DEFAULT 0,

    starts_at TIMESTAMP NULL,
    expires_at TIMESTAMP NULL,

    is_active TINYINT(1) NOT NULL DEFAULT 1,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT uq_coupons_code UNIQUE (code)
);

-- One row per order a coupon was actually applied to - lets
-- coupon.service.js enforce "this buyer hasn't already used this code"
-- without scanning the orders table, and gives a simple audit trail of
-- what discount was granted on which order.
CREATE TABLE IF NOT EXISTS coupon_redemptions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    coupon_id INT NOT NULL,
    user_id INT NOT NULL,
    order_id INT NULL,
    discount_amount DECIMAL(12, 2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_coupon_redemptions_coupon FOREIGN KEY (coupon_id) REFERENCES coupons(id) ON DELETE CASCADE,
    CONSTRAINT fk_coupon_redemptions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_coupon_redemptions_coupon_user (coupon_id, user_id)
);

ALTER TABLE orders
    ADD COLUMN coupon_id INT NULL AFTER buyer_address_id,
    ADD COLUMN coupon_discount_amount DECIMAL(12, 2) NOT NULL DEFAULT 0 AFTER coupon_id;
