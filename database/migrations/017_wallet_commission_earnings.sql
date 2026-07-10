-- Migration 017: platform commission, seller wallet, withdrawals, rider earnings
-- Run after 016_push_subscriptions.sql.
--
-- Design notes:
--  - platform_settings is a simple key/value store so the commission rate
--    and the flat rider delivery fee can be changed by an admin without a
--    deploy. order_items and deliveries each snapshot the rate/fee that
--    was actually applied, so changing a setting later never rewrites
--    history for orders that already happened.
--  - seller_wallets/wallet_transactions is an append-only ledger pattern:
--    every balance change writes a transaction row with the resulting
--    balance, so the balance can always be reconciled from history.
--  - agent_earnings is the delivery-agent equivalent of wallet_transactions,
--    kept as its own table (rather than reusing wallet_transactions) since
--    agents are paid per-delivery, not per-order, and never withdraw
--    through this MVP.

CREATE TABLE IF NOT EXISTS platform_settings (
    setting_key VARCHAR(100) PRIMARY KEY,
    setting_value VARCHAR(255) NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

INSERT INTO platform_settings (setting_key, setting_value) VALUES
    ('commission_rate', '10'),
    ('rider_delivery_fee', '3000')
ON DUPLICATE KEY UPDATE setting_key = setting_key;

-- Snapshot of the commission actually applied to each line item, filled in
-- the moment an order's payment is confirmed (see payment.service.js).
-- wallet_credited guards against crediting a seller's wallet twice.
ALTER TABLE order_items
    ADD COLUMN commission_rate DECIMAL(5, 2) NULL AFTER subtotal,
    ADD COLUMN commission_amount DECIMAL(12, 2) NULL AFTER commission_rate,
    ADD COLUMN seller_net_amount DECIMAL(12, 2) NULL AFTER commission_amount,
    ADD COLUMN wallet_credited BOOLEAN NOT NULL DEFAULT FALSE AFTER seller_net_amount;

-- Snapshot of the flat fee owed to the agent for this delivery, taken at
-- assignment time. earnings_credited guards against double-crediting when
-- a delivery is marked delivered.
ALTER TABLE deliveries
    ADD COLUMN delivery_fee DECIMAL(10, 2) NULL AFTER status,
    ADD COLUMN earnings_credited BOOLEAN NOT NULL DEFAULT FALSE AFTER delivery_fee;

CREATE TABLE IF NOT EXISTS seller_wallets (
    seller_id INT PRIMARY KEY,
    balance DECIMAL(14, 2) NOT NULL DEFAULT 0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_seller_wallets_seller
        FOREIGN KEY (seller_id) REFERENCES users(id)
        ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS wallet_transactions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    seller_id INT NOT NULL,

    type ENUM('credit', 'debit') NOT NULL,
    amount DECIMAL(14, 2) NOT NULL,
    balance_after DECIMAL(14, 2) NOT NULL,

    reference_type ENUM('order', 'withdrawal', 'adjustment') NOT NULL,
    reference_id INT NULL,
    description VARCHAR(255) NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_wallet_transactions_seller
        FOREIGN KEY (seller_id) REFERENCES users(id)
        ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS withdrawal_requests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    seller_id INT NOT NULL,

    amount DECIMAL(14, 2) NOT NULL,
    status ENUM('pending', 'approved', 'rejected', 'paid') NOT NULL DEFAULT 'pending',

    payout_method VARCHAR(50) NOT NULL,
    payout_details VARCHAR(255) NOT NULL,
    admin_note VARCHAR(255) NULL,

    requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP NULL,

    CONSTRAINT fk_withdrawal_requests_seller
        FOREIGN KEY (seller_id) REFERENCES users(id)
        ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS agent_earnings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    agent_id INT NOT NULL,
    delivery_id INT NOT NULL UNIQUE,
    order_id INT NOT NULL,

    amount DECIMAL(12, 2) NOT NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_agent_earnings_agent
        FOREIGN KEY (agent_id) REFERENCES users(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_agent_earnings_delivery
        FOREIGN KEY (delivery_id) REFERENCES deliveries(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_agent_earnings_order
        FOREIGN KEY (order_id) REFERENCES orders(id)
        ON DELETE CASCADE
);
