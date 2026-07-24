-- Migration 054: Escrow foundation (Phase 9B - Payment Trust System)
-- Depends on: seller_wallets / wallet_transactions / order_items (017),
-- disputes (034)
-- Additive only. No existing behavior changes as a result of this
-- migration - payment.service.js / wallet.service.js keep crediting
-- seller_wallets.balance directly exactly as before until Phase 9C
-- switches that over. See docs/ESCROW_ANALYSIS.md (Phase 9A) for the
-- full problem statement and design this schema implements.
--
-- Design notes:
--  - seller_wallets.balance has always meant "withdrawable". Rather than
--    add a whole new table, this splits it into two columns on the same
--    row: `balance` keeps meaning "available, withdrawable" (so
--    wallet.service.js#requestWithdrawal's existing
--    `amount > wallet.balance` check keeps working completely unchanged),
--    and the new `held_balance` is earnings from paid-but-not-yet-
--    released orders - visible to the seller, not withdrawable. Phase 9C
--    is what starts writing to `held_balance` instead of `balance`;
--    Phase 9D is what moves money from one to the other.
--  - order_items.wallet_credited (migration 017) already marks "has this
--    item's earnings been credited at all" and stays exactly as-is,
--    still set the moment payment is confirmed (now meaning "moved into
--    held_balance" once 9C ships, not "moved into balance"). The new
--    `wallet_released` is the second half of that lifecycle: set once
--    Phase 9D's release job moves this item's net amount from held into
--    available. An item with wallet_credited = TRUE and
--    wallet_released = FALSE is "held, awaiting release" - the exact set
--    Phase 9D's background job needs to scan, hence the composite index.
--  - wallet_transactions.reference_type gets one new value,
--    'escrow_release', for the ledger row Phase 9D's release job writes
--    (mirroring how migration 034 added 'dispute' for the existing
--    refund-clawback ledger rows). The existing 'order' value continues
--    to cover the hold-side entry Phase 9C will write when payment is
--    confirmed - only the release side is new.
--  - escrow_hold_days is a platform_settings row, same key/value shape
--    every other admin-tunable number already uses (commission_rate,
--    rider_delivery_fee, etc. - migration 017). Not read anywhere yet;
--    settings.service.js#getEscrowHoldDays is added in this same phase
--    purely as the accessor Phase 9D's release job will call, following
--    the same DEFAULTS-fallback pattern every other setting uses.

ALTER TABLE seller_wallets
    ADD COLUMN held_balance DECIMAL(14, 2) NOT NULL DEFAULT 0 AFTER balance;

ALTER TABLE order_items
    ADD COLUMN wallet_released BOOLEAN NOT NULL DEFAULT FALSE AFTER wallet_credited;

CREATE INDEX idx_order_items_escrow_release
    ON order_items (wallet_credited, wallet_released);

ALTER TABLE wallet_transactions
    MODIFY reference_type ENUM('order', 'withdrawal', 'adjustment', 'dispute', 'escrow_release') NOT NULL;

-- Default hold period (days after delivery, with no open dispute) before
-- a seller's held earnings for an order become withdrawable. Admin-
-- editable via the existing PUT /admin/settings once Phase 9D wires up
-- the whitelist entry the same way every other rate/fee setting already
-- is (see settings.service.js#updateSettings).
INSERT INTO platform_settings (setting_key, setting_value) VALUES
    ('escrow_hold_days', '5')
ON DUPLICATE KEY UPDATE setting_key = setting_key;
