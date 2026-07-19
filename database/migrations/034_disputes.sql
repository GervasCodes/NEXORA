-- Migration 034: Dispute management (Phase 6)
-- Run after 033_delivery_distance_pricing.sql.
--
-- Design notes:
--  - Orders are single-seller by construction (see order_items /
--    createSplitOrder in order.repository.js - a parent order has no
--    items of its own, only its child orders do), so one dispute always
--    maps to exactly one seller. `seller_id` is snapshotted at creation
--    time via order_items so it never needs a join later.
--  - `dispute_number` mirrors `orders.order_number` (human-referenceable,
--    e.g. in support emails) - format DSP-<timestamp>-<random> assigned
--    in dispute.service.js.
--  - dispute_evidence is a separate table (not a JSON column) so buyers
--    and sellers can each attach multiple photos over time as the case
--    develops, same shape as account_verification_documents.
--  - dispute_messages is a lightweight append-only thread so buyer,
--    seller, and admin can discuss the case in one place instead of
--    over chat/email, and so admins have the full context when deciding
--    a resolution.
--  - dispute_history is an audit trail of every status change/decision,
--    same pattern as account_verification_history.

CREATE TABLE IF NOT EXISTS disputes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    dispute_number VARCHAR(40) NOT NULL UNIQUE,

    order_id INT NOT NULL,
    order_item_id INT NULL,
    buyer_id INT NOT NULL,
    seller_id INT NULL,

    -- The five required categories, plus a general fallback so a buyer
    -- is never blocked from filing just because their issue doesn't
    -- neatly fit one of the five.
    type ENUM(
        'damaged_item',
        'delayed_delivery',
        'defective_product',
        'wrong_item',
        'missing_delivery',
        'other'
    ) NOT NULL,

    status ENUM('open', 'under_review', 'resolved', 'rejected', 'withdrawn')
        NOT NULL DEFAULT 'open',

    subject VARCHAR(150) NOT NULL,
    description TEXT NOT NULL,

    -- Filled in only once an admin resolves the case (see dispute.service.js).
    resolution ENUM('refund_full', 'refund_partial', 'replacement', 'compensation', 'no_action') NULL,
    resolution_note VARCHAR(1000) NULL,
    refund_amount DECIMAL(12, 2) NULL,

    resolved_by INT NULL,
    resolved_at TIMESTAMP NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_disputes_order
        FOREIGN KEY (order_id) REFERENCES orders(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_disputes_order_item
        FOREIGN KEY (order_item_id) REFERENCES order_items(id)
        ON DELETE SET NULL,

    CONSTRAINT fk_disputes_buyer
        FOREIGN KEY (buyer_id) REFERENCES users(id),

    CONSTRAINT fk_disputes_seller
        FOREIGN KEY (seller_id) REFERENCES users(id),

    CONSTRAINT fk_disputes_resolved_by
        FOREIGN KEY (resolved_by) REFERENCES users(id),

    INDEX idx_disputes_status (status),
    INDEX idx_disputes_buyer (buyer_id),
    INDEX idx_disputes_seller (seller_id),
    INDEX idx_disputes_order (order_id)
);

CREATE TABLE IF NOT EXISTS dispute_evidence (
    id INT AUTO_INCREMENT PRIMARY KEY,
    dispute_id INT NOT NULL,
    uploaded_by INT NOT NULL,
    file_url VARCHAR(500) NOT NULL,
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_dispute_evidence_dispute
        FOREIGN KEY (dispute_id) REFERENCES disputes(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_dispute_evidence_user
        FOREIGN KEY (uploaded_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS dispute_messages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    dispute_id INT NOT NULL,
    sender_id INT NOT NULL,
    -- Snapshotted so a message's context still reads correctly even if
    -- an admin's role/level changes later.
    sender_role ENUM('buyer', 'seller', 'admin') NOT NULL,
    message VARCHAR(2000) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_dispute_messages_dispute
        FOREIGN KEY (dispute_id) REFERENCES disputes(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_dispute_messages_sender
        FOREIGN KEY (sender_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS dispute_history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    dispute_id INT NOT NULL,
    action VARCHAR(50) NOT NULL,
    note VARCHAR(500) NULL,
    actor_id INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_dispute_history_dispute
        FOREIGN KEY (dispute_id) REFERENCES disputes(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_dispute_history_actor
        FOREIGN KEY (actor_id) REFERENCES users(id)
);

-- Reuse the existing wallet ledger `reference_type` set for dispute-driven
-- seller wallet debits (a refund reverses commission-net earnings the
-- seller was already credited - see dispute.service.js resolve()).
ALTER TABLE wallet_transactions
    MODIFY reference_type ENUM('order', 'withdrawal', 'adjustment', 'dispute') NOT NULL;
