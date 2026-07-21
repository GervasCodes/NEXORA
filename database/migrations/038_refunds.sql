-- Migration 038: Refunds (Phase 2 - Refund Automation)
-- Run after 037_delivery_timeline_timestamps.sql.
--
-- Tracks every automatic refund triggered when an admin resolves a
-- dispute in the buyer's favor (resolution = refund_full/refund_partial),
-- plus any manual admin retry of a failed one. One row per dispute
-- (dispute_id is UNIQUE) - retries update the same row instead of
-- inserting a new one, so `attempts`/`last_error` reflect the full
-- history and a resolve-twice / retry-twice can never double-refund the
-- buyer. That per-dispute uniqueness is the actual idempotency guarantee;
-- `idempotency_key` mirrors it in a form that's convenient to pass around
-- (refund.service.js) without re-deriving "dispute:<id>" everywhere.

CREATE TABLE IF NOT EXISTS refunds (
    id INT AUTO_INCREMENT PRIMARY KEY,

    dispute_id INT NOT NULL UNIQUE,
    payment_id INT NOT NULL,
    order_id INT NOT NULL,
    buyer_id INT NOT NULL,
    seller_id INT NULL,

    -- Mirrors payments.method (see 027/030) rather than reusing that
    -- ENUM directly, so this table can add a refund-specific value
    -- (e.g. a future 'manual' provider) without altering `payments`.
    provider ENUM('mobile_money', 'snippe', 'paypal', 'cash_on_delivery') NOT NULL,
    amount DECIMAL(12, 2) NOT NULL,

    idempotency_key VARCHAR(64) NOT NULL UNIQUE,

    status ENUM('pending', 'processing', 'completed', 'failed', 'manual_required')
        NOT NULL DEFAULT 'pending',

    -- Refund id/reference returned by the provider once completed
    -- (PayPal refund id, Snippe refund id, mobile-money payout reference).
    provider_reference VARCHAR(150) NULL,

    attempts INT NOT NULL DEFAULT 0,
    last_error VARCHAR(500) NULL,

    requested_by INT NULL,
    completed_at TIMESTAMP NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_refunds_dispute
        FOREIGN KEY (dispute_id) REFERENCES disputes(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_refunds_payment
        FOREIGN KEY (payment_id) REFERENCES payments(id),

    CONSTRAINT fk_refunds_order
        FOREIGN KEY (order_id) REFERENCES orders(id),

    CONSTRAINT fk_refunds_buyer
        FOREIGN KEY (buyer_id) REFERENCES users(id),

    CONSTRAINT fk_refunds_seller
        FOREIGN KEY (seller_id) REFERENCES users(id),

    CONSTRAINT fk_refunds_requested_by
        FOREIGN KEY (requested_by) REFERENCES users(id),

    INDEX idx_refunds_status (status),
    INDEX idx_refunds_order (order_id),
    INDEX idx_refunds_buyer (buyer_id)
);

-- Reuse the existing audit_logs event_type free-text column (VARCHAR, not
-- an ENUM - see 035_audit_log.sql) - no schema change needed there for
-- the new "refund.*" event types emitted by refund.service.js.
