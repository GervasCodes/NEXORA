-- Migration 083: Phase Q1 - Trust & Buyer Protection
-- Run after 082_orders_buyer_created_index.sql.
--
-- Three features:
--   1. Buyer protection / return-shipping workflow (order_returns +
--      order_return_history, mirroring the disputes/dispute_history
--      shape from 034_disputes.sql).
--   2. Checkout buyer-protection insurance add-on (two columns on
--      `orders` - whether it was purchased and what it cost, so the
--      order detail/refund/return logic can see it without re-deriving
--      it from the payment).
--   3. Progressive KYC tiers (a tier column on `users`, a small config
--      table of per-tier order limits, and an upgrade-request table
--      mirroring account_verification_documents/history's shape).

-- ---- 1. Returns -------------------------------------------------------

CREATE TABLE IF NOT EXISTS order_returns (
    id INT AUTO_INCREMENT PRIMARY KEY,

    order_id INT NOT NULL,
    order_item_id INT NULL, -- NULL = whole order
    buyer_id INT NOT NULL,
    seller_id INT NULL, -- NULL only possible for a parent (multi-vendor) order id, which returns don't target directly

    reason ENUM('damaged_item', 'wrong_item', 'defective_product', 'not_as_described', 'changed_mind', 'other')
        NOT NULL,
    description TEXT NULL,

    status ENUM('requested', 'approved', 'rejected', 'shipped_back', 'received', 'refunded', 'cancelled')
        NOT NULL DEFAULT 'requested',

    -- Snapshot of the return window (in days) that applied when this was
    -- filed, so a later change to the default/insured window never
    -- retroactively affects an already-open return.
    return_window_days INT NOT NULL,

    return_tracking_number VARCHAR(100) NULL,
    return_carrier VARCHAR(100) NULL,
    shipped_back_at TIMESTAMP NULL,
    received_at TIMESTAMP NULL,

    refund_amount DECIMAL(12, 2) NULL,
    rejection_reason VARCHAR(500) NULL,

    decided_by INT NULL,
    decided_at TIMESTAMP NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_order_returns_order
        FOREIGN KEY (order_id) REFERENCES orders(id),
    CONSTRAINT fk_order_returns_item
        FOREIGN KEY (order_item_id) REFERENCES order_items(id),
    CONSTRAINT fk_order_returns_buyer
        FOREIGN KEY (buyer_id) REFERENCES users(id),
    CONSTRAINT fk_order_returns_seller
        FOREIGN KEY (seller_id) REFERENCES users(id),
    CONSTRAINT fk_order_returns_decided_by
        FOREIGN KEY (decided_by) REFERENCES users(id),

    -- One open (non-terminal) return per order at a time - mirrors how a
    -- single dispute is expected to represent one order's issue. Terminal
    -- states (rejected/refunded/cancelled) are excluded via the app-layer
    -- check in return.service.js (a generated column + partial unique
    -- index would need MySQL 8 functional indexes we'd rather not require
    -- here), this index just makes the common case fast to look up.
    INDEX idx_order_returns_order (order_id),
    INDEX idx_order_returns_buyer (buyer_id),
    INDEX idx_order_returns_seller (seller_id),
    INDEX idx_order_returns_status (status)
);

CREATE TABLE IF NOT EXISTS order_return_history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    return_id INT NOT NULL,
    action VARCHAR(50) NOT NULL,
    note VARCHAR(500) NULL,
    actor_id INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_order_return_history_return
        FOREIGN KEY (return_id) REFERENCES order_returns(id)
        ON DELETE CASCADE,
    CONSTRAINT fk_order_return_history_actor
        FOREIGN KEY (actor_id) REFERENCES users(id),

    INDEX idx_order_return_history_return (return_id)
);

-- Generalize `refunds` (038_refunds.sql) to also cover return-driven
-- refunds, not just dispute-driven ones. dispute_id stays UNIQUE but
-- becomes nullable; return_id is added as its return-side counterpart.
-- The CHECK keeps "exactly one source" enforced at the DB layer the same
-- way dispute_id NOT NULL used to.
ALTER TABLE refunds
    MODIFY dispute_id INT NULL,
    ADD COLUMN return_id INT NULL UNIQUE AFTER dispute_id,
    ADD CONSTRAINT fk_refunds_return
        FOREIGN KEY (return_id) REFERENCES order_returns(id)
        ON DELETE CASCADE,
    ADD CONSTRAINT chk_refunds_one_source
        CHECK ((dispute_id IS NOT NULL AND return_id IS NULL) OR (dispute_id IS NULL AND return_id IS NOT NULL));

-- Reuse the wallet ledger reference_type set (see 034/054/064) for
-- return-driven earnings reversals (return.service.js's
-- reverseSellerEarningsForReturn, same shape as dispute.service.js's
-- reverseSellerEarnings).
ALTER TABLE wallet_transactions
    MODIFY reference_type ENUM('order', 'withdrawal', 'adjustment', 'dispute', 'escrow_release', 'booking', 'return')
        NOT NULL;

-- ---- 2. Checkout buyer-protection insurance add-on ---------------------

ALTER TABLE orders
    ADD COLUMN buyer_protection_addon TINYINT(1) NOT NULL DEFAULT 0 AFTER total_amount,
    ADD COLUMN buyer_protection_fee DECIMAL(12, 2) NOT NULL DEFAULT 0 AFTER buyer_protection_addon;

-- ---- 3. Progressive KYC tiers -------------------------------------------

ALTER TABLE users
    ADD COLUMN kyc_tier ENUM('tier0', 'tier1', 'tier2') NOT NULL DEFAULT 'tier0' AFTER account_verification_status;

CREATE TABLE IF NOT EXISTS kyc_tier_limits (
    tier ENUM('tier0', 'tier1', 'tier2') PRIMARY KEY,
    -- NULL = no cap. Applied per checkout order total (order.service.js).
    max_order_amount DECIMAL(12, 2) NULL,
    label VARCHAR(100) NOT NULL
);

INSERT INTO kyc_tier_limits (tier, max_order_amount, label) VALUES
    ('tier0', 500000.00, 'Light signup'),
    ('tier1', 5000000.00, 'ID verified'),
    ('tier2', NULL, 'Enhanced verification')
ON DUPLICATE KEY UPDATE max_order_amount = VALUES(max_order_amount), label = VALUES(label);

CREATE TABLE IF NOT EXISTS kyc_upgrade_requests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    target_tier ENUM('tier1', 'tier2') NOT NULL,

    status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',

    document_type VARCHAR(50) NOT NULL,
    file_url VARCHAR(500) NOT NULL,
    note VARCHAR(500) NULL,

    rejection_reason VARCHAR(500) NULL,
    reviewed_by INT NULL,
    reviewed_at TIMESTAMP NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_kyc_upgrade_requests_user
        FOREIGN KEY (user_id) REFERENCES users(id),
    CONSTRAINT fk_kyc_upgrade_requests_reviewed_by
        FOREIGN KEY (reviewed_by) REFERENCES users(id),

    INDEX idx_kyc_upgrade_requests_user (user_id),
    INDEX idx_kyc_upgrade_requests_status (status)
);
