-- Migration 120: Wallets, escrow, COD and withdrawals (master prompt Phase 2).
-- Run after 119_payment_integrity.sql. Safe to re-run: every column, index
-- and table below is guarded so a second run changes nothing.
--
--   buyer_wallet_transactions.payment_id / dedupe_key
--                                A generated column that is only non-NULL
--                                for a 'topup' credit or an 'order_payment'
--                                debit - CONCAT(reference_type, ':', X)
--                                where X is reference_id for a topup
--                                (one credit per top-up, ever) and
--                                payment_id for an order payment (one debit
--                                per payment ATTEMPT, ever - using the
--                                attempt's own id rather than order_id
--                                because a pre-order's deposit and balance
--                                legs share one order_id but must each be
--                                debited once). The unique index on it is
--                                the "can't debit/credit twice" guard -
--                                MySQL allows unlimited NULLs in a unique
--                                index, so refund/adjustment rows (which
--                                legitimately can repeat per order) are
--                                untouched.
--   seller_wallets.balance      Already allowed negative values at the
--                                column level (plain DECIMAL, no UNSIGNED/
--                                CHECK) - nothing to alter there. The new
--                                index just makes "sellers with a negative
--                                balance" a fast admin query.
--   wallet_transactions.reference_type 'cod_commission'
--                                The ledger entry for a Cash on Delivery
--                                order: the seller already holds the cash,
--                                so instead of a credit into `balance` this
--                                phase debits just the platform's
--                                commission out of it (see
--                                wallet.service.js#creditSellersForOrder).
--   withdrawal_requests.payout_reference / hold_until / payout_details_is_new
--                                payout_reference is the receipt/reference
--                                an admin records when marking a withdrawal
--                                paid. hold_until + payout_details_is_new
--                                implement the 24-hour hold on a seller's
--                                first-ever withdrawal to a given payout
--                                method+details combination.
--   kyc_tier_limits.max_cod_order_amount / max_unpaid_cod_orders
--                                Cash on Delivery is riskier than a
--                                prepaid order (no payment confirmation at
--                                all until delivery), so it gets its own,
--                                stricter per-tier caps alongside the
--                                existing max_order_amount.
--   users.refused_cod_count     Incremented when a delivery agent marks a
--                                Cash on Delivery delivery "failed" -
--                                see delivery.service.js#updateDeliveryStatus.
--                                Past a platform-settings threshold, a
--                                buyer's Cash on Delivery option is
--                                switched off (order.service.js#checkout).
--   agent_earnings.status / released_at
--                                Delivery agent earnings for an order now
--                                start 'held' (mirrors seller_wallets.
--                                held_balance) and only count toward the
--                                agent's withdrawable-looking totals once
--                                'released' by the same escrow-release
--                                sweep as seller/provider earnings - see
--                                earnings.service.js.
--   wallet_reconciliation_flags  Admin-visible output of the nightly
--                                balance-vs-ledger reconciliation job
--                                (jobs/walletReconciliation.job.js).

-- ---- buyer_wallet_transactions -------------------------------------------

SET @s := IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'buyer_wallet_transactions' AND COLUMN_NAME = 'payment_id') = 0,
    'ALTER TABLE buyer_wallet_transactions ADD COLUMN payment_id INT NULL AFTER reference_id',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s := IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'buyer_wallet_transactions' AND COLUMN_NAME = 'dedupe_key') = 0,
    'ALTER TABLE buyer_wallet_transactions ADD COLUMN dedupe_key VARCHAR(64)
        GENERATED ALWAYS AS (
            CASE
                WHEN reference_type = ''topup'' AND type = ''credit'' THEN CONCAT(''topup:'', reference_id)
                WHEN reference_type = ''order_payment'' AND type = ''debit'' THEN CONCAT(''order_payment:'', payment_id)
                ELSE NULL
            END
        ) STORED',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s := IF(
    (SELECT COUNT(*) FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'buyer_wallet_transactions' AND INDEX_NAME = 'uniq_buyer_wallet_dedupe') = 0,
    'ALTER TABLE buyer_wallet_transactions ADD UNIQUE KEY uniq_buyer_wallet_dedupe (dedupe_key)',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Buyer's last-used top-up number, so the top-up form can default to it
-- instead of the buyer retyping it (never defaults to the shipping phone).
SET @s := IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'buyer_wallets' AND COLUMN_NAME = 'last_topup_phone') = 0,
    'ALTER TABLE buyer_wallets ADD COLUMN last_topup_phone VARCHAR(20) NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---- seller_wallets / wallet_transactions --------------------------------

SET @s := IF(
    (SELECT COUNT(*) FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'seller_wallets' AND INDEX_NAME = 'idx_seller_wallets_negative') = 0,
    'ALTER TABLE seller_wallets ADD INDEX idx_seller_wallets_negative (balance)',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

ALTER TABLE wallet_transactions
    MODIFY reference_type ENUM('order', 'withdrawal', 'adjustment', 'dispute', 'escrow_release', 'booking', 'cod_commission')
        NOT NULL;

-- ---- withdrawal_requests --------------------------------------------------

SET @s := IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'withdrawal_requests' AND COLUMN_NAME = 'payout_reference') = 0,
    'ALTER TABLE withdrawal_requests ADD COLUMN payout_reference VARCHAR(100) NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s := IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'withdrawal_requests' AND COLUMN_NAME = 'hold_until') = 0,
    'ALTER TABLE withdrawal_requests ADD COLUMN hold_until TIMESTAMP NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s := IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'withdrawal_requests' AND COLUMN_NAME = 'payout_details_is_new') = 0,
    'ALTER TABLE withdrawal_requests ADD COLUMN payout_details_is_new BOOLEAN NOT NULL DEFAULT FALSE',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s := IF(
    (SELECT COUNT(*) FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'withdrawal_requests' AND INDEX_NAME = 'idx_withdrawal_seller_method_details') = 0,
    'ALTER TABLE withdrawal_requests ADD INDEX idx_withdrawal_seller_method_details (seller_id, payout_method, payout_details(100))',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---- kyc_tier_limits (Cash on Delivery caps) ------------------------------

SET @s := IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'kyc_tier_limits' AND COLUMN_NAME = 'max_cod_order_amount') = 0,
    'ALTER TABLE kyc_tier_limits ADD COLUMN max_cod_order_amount DECIMAL(12, 2) NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s := IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'kyc_tier_limits' AND COLUMN_NAME = 'max_unpaid_cod_orders') = 0,
    'ALTER TABLE kyc_tier_limits ADD COLUMN max_unpaid_cod_orders INT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Backfill: stricter than the general per-order cap at every tier, and a
-- cap on how many COD orders a buyer can have "in flight" (not yet
-- delivered+confirmed or cancelled) at once. NULL max_cod_order_amount
-- falls back to the tier's own max_order_amount in code - only fill this
-- in where a stricter number actually makes sense.
UPDATE kyc_tier_limits SET max_cod_order_amount = LEAST(COALESCE(max_order_amount, 200000), 200000), max_unpaid_cod_orders = 3
    WHERE tier = 'tier0' AND max_unpaid_cod_orders IS NULL;
UPDATE kyc_tier_limits SET max_unpaid_cod_orders = 5
    WHERE tier = 'tier1' AND max_unpaid_cod_orders IS NULL;
UPDATE kyc_tier_limits SET max_unpaid_cod_orders = 8
    WHERE tier = 'tier2' AND max_unpaid_cod_orders IS NULL;

-- ---- users: refused-Cash-on-Delivery strikes ------------------------------

SET @s := IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'refused_cod_count') = 0,
    'ALTER TABLE users ADD COLUMN refused_cod_count INT NOT NULL DEFAULT 0',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---- agent_earnings: held -> released (dispute-window hold) --------------

SET @s := IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'agent_earnings' AND COLUMN_NAME = 'status') = 0,
    'ALTER TABLE agent_earnings ADD COLUMN status ENUM(''held'', ''released'') NOT NULL DEFAULT ''held''',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s := IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'agent_earnings' AND COLUMN_NAME = 'released_at') = 0,
    'ALTER TABLE agent_earnings ADD COLUMN released_at TIMESTAMP NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Backfill: every agent_earnings row that existed before this migration was
-- credited under the old "pay out immediately" rule - treat it as already
-- released rather than retroactively holding money agents already consider
-- theirs.
UPDATE agent_earnings SET status = 'released', released_at = created_at WHERE status = 'held';

SET @s := IF(
    (SELECT COUNT(*) FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'agent_earnings' AND INDEX_NAME = 'idx_agent_earnings_release') = 0,
    'ALTER TABLE agent_earnings ADD INDEX idx_agent_earnings_release (status, created_at)',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---- Nightly wallet reconciliation ----------------------------------------

CREATE TABLE IF NOT EXISTS wallet_reconciliation_flags (
    id INT AUTO_INCREMENT PRIMARY KEY,
    wallet_type ENUM('seller', 'buyer') NOT NULL,
    owner_id INT NOT NULL,
    recorded_balance DECIMAL(14, 2) NOT NULL,
    computed_balance DECIMAL(14, 2) NOT NULL,
    drift DECIMAL(14, 2) NOT NULL,
    status ENUM('open', 'resolved') NOT NULL DEFAULT 'open',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP NULL,

    KEY idx_wallet_reconciliation_status (status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---- New platform_settings keys (withdrawal / top-up limits, holds) ------

INSERT INTO platform_settings (setting_key, setting_value) VALUES
    ('withdrawal_min_amount', '5000'),
    ('withdrawal_max_amount', '5000000'),
    ('withdrawal_daily_cap_none', '200000'),
    ('withdrawal_daily_cap_id_verified', '2000000'),
    ('withdrawal_daily_cap_business_verified', '10000000'),
    ('withdrawal_new_payout_hold_hours', '24'),
    ('withdrawal_open_dispute_block_threshold', '3'),
    ('topup_min_amount', '1000'),
    ('topup_max_amount', '3000000'),
    ('topup_daily_cap_tier0', '500000'),
    ('topup_daily_cap_tier1', '2000000'),
    ('topup_daily_cap_tier2', '10000000'),
    ('cod_auto_confirm_hours', '48'),
    ('cod_block_after_refused_count', '3')
ON DUPLICATE KEY UPDATE setting_key = setting_key;
