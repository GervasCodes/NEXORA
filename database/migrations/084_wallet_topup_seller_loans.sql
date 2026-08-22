-- Migration 084: Phase Q2 - Wallet & Seller Finance
-- Run after 083_buyer_protection_returns_kyc.sql.
--
-- Two features:
--   1. General-purpose wallet top-up: a buyer-side balance
--      (buyer_wallets/buyer_wallet_transactions, mirroring
--      seller_wallets/wallet_transactions from 017_wallet_commission_
--      earnings.sql exactly, just keyed by buyer instead of seller) that
--      can be topped up via mobile money ahead of time and spent at
--      checkout as its own payment method.
--   2. Seller working-capital microloans: a cash advance against a
--      seller's pending (held, not-yet-released) escrow balance, for a
--      flat fee, automatically repaid out of held_balance as it's
--      released rather than requiring a separate repayment action.

-- ---- 1. Buyer wallet top-up ---------------------------------------------

CREATE TABLE IF NOT EXISTS buyer_wallets (
    buyer_id INT PRIMARY KEY,
    balance DECIMAL(14, 2) NOT NULL DEFAULT 0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_buyer_wallets_buyer
        FOREIGN KEY (buyer_id) REFERENCES users(id)
        ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS buyer_wallet_transactions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    buyer_id INT NOT NULL,

    type ENUM('credit', 'debit') NOT NULL,
    amount DECIMAL(14, 2) NOT NULL,
    balance_after DECIMAL(14, 2) NOT NULL,

    reference_type ENUM('topup', 'order_payment', 'refund', 'adjustment') NOT NULL,
    reference_id INT NULL,
    description VARCHAR(255) NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_buyer_wallet_transactions_buyer
        FOREIGN KEY (buyer_id) REFERENCES users(id)
        ON DELETE CASCADE
);

-- A top-up request tracked separately from `payments` (same reasoning as
-- bookings/subscriptions/verification fees in payment.repository.js -
-- something payment.service.js's provider/webhook plumbing needs its own
-- id for, distinct from an order). Completed the moment the mobile money
-- webhook confirms it - see payment.service.js#_handleWalletTopupWebhook.
CREATE TABLE IF NOT EXISTS wallet_top_ups (
    id INT AUTO_INCREMENT PRIMARY KEY,
    buyer_id INT NOT NULL,
    amount DECIMAL(14, 2) NOT NULL,
    status ENUM('pending', 'completed', 'failed') NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP NULL,

    CONSTRAINT fk_wallet_top_ups_buyer
        FOREIGN KEY (buyer_id) REFERENCES users(id)
        ON DELETE CASCADE
);

ALTER TABLE payments
    ADD COLUMN topup_id INT NULL AFTER subscription_id,
    MODIFY purpose ENUM('order_payment', 'seller_verification_fee', 'booking_payment', 'subscription_payment', 'wallet_topup')
        NOT NULL DEFAULT 'order_payment',
    -- 'wallet' here is the ORDER-payment method (paying at checkout out
    -- of an already-topped-up balance) - a synchronous internal debit,
    -- not a provider. A top-up itself is always charged through a real
    -- provider (mobile_money below), never 'wallet' - you can't top up
    -- your wallet from your wallet.
    MODIFY method ENUM('mobile_money', 'cash_on_delivery', 'snippe', 'malipopay_card', 'paypal', 'wallet') NOT NULL;

ALTER TABLE payments
    ADD CONSTRAINT fk_payments_topup
        FOREIGN KEY (topup_id) REFERENCES wallet_top_ups(id)
        ON DELETE CASCADE;

CREATE INDEX idx_payments_topup ON payments (topup_id);

ALTER TABLE orders
    MODIFY payment_method ENUM('mobile_money', 'cash_on_delivery', 'snippe', 'malipopay_card', 'paypal', 'wallet') NOT NULL;

ALTER TABLE buyer_wallet_transactions
    MODIFY reference_type ENUM('topup', 'order_payment', 'refund', 'adjustment') NOT NULL;

-- refunds.provider (migration 038/077) needs the same widening as
-- payments.method above - a wallet-paid order's refund otherwise has no
-- valid provider value to record (see refund.service.js's new "wallet"
-- branch in callProvider, which reverses the buyer's wallet debit
-- directly instead of calling an external gateway).
ALTER TABLE refunds
    MODIFY provider ENUM('mobile_money', 'snippe', 'malipopay_card', 'paypal', 'cash_on_delivery', 'wallet') NOT NULL;

-- ---- 2. Seller working-capital microloans --------------------------------

CREATE TABLE IF NOT EXISTS seller_loans (
    id INT AUTO_INCREMENT PRIMARY KEY,
    seller_id INT NOT NULL,

    -- Amount actually advanced to the seller's withdrawable balance.
    principal_amount DECIMAL(14, 2) NOT NULL,
    -- Flat fee (see loan.service.js#FEE_RATE), added on top of the
    -- principal to get what's actually owed back.
    fee_amount DECIMAL(14, 2) NOT NULL,
    total_repayable DECIMAL(14, 2) NOT NULL,
    amount_repaid DECIMAL(14, 2) NOT NULL DEFAULT 0,

    status ENUM('active', 'repaid', 'written_off') NOT NULL DEFAULT 'active',

    disbursed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    repaid_at TIMESTAMP NULL,

    CONSTRAINT fk_seller_loans_seller
        FOREIGN KEY (seller_id) REFERENCES users(id)
        ON DELETE CASCADE,

    INDEX idx_seller_loans_seller_status (seller_id, status)
);

-- 'loan_disbursement'/'loan_repayment' let a seller's wallet ledger show
-- the advance and each auto-repayment alongside everything else that
-- already moves their balance (order earnings, withdrawals, dispute/
-- return reversals).
ALTER TABLE wallet_transactions
    MODIFY reference_type ENUM('order', 'withdrawal', 'adjustment', 'dispute', 'escrow_release', 'booking', 'return', 'loan_disbursement', 'loan_repayment')
        NOT NULL;
