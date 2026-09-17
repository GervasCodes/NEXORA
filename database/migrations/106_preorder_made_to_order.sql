-- Migration 106: Pre-order / made-to-order support (Phase 8)
-- Run after 105_user_map_location.sql.
--
-- Three layers, matching how the rest of the catalog/order schema splits
-- store-level vs product-level vs order-level concerns:
--
--   1. seller_profiles - the store-level toggle + defaults. A store must
--      opt in (accepts_preorders) before any of its products can be
--      flagged as made-to-order (enforced in product.service.js, not
--      here - same "schema allows it, service layer gates it" split as
--      every other cross-table business rule in this codebase).
--      preorder_deposit_percent/preorder_default_lead_time_days are the
--      store's defaults; a product can override the lead time (see
--      products.preorder_lead_time_days below) the same way migration
--      094's ships_within_days is nullable and product-level for the
--      same "different products, different terms" reason.
--
--   2. products - the per-product is_preorder flag + optional lead-time
--      override. Mirrors migration 094's ships_within_days/
--      return_window_days shape exactly (nullable, product.repository.js
--      already selects p.*, so reads need no repository change).
--
--   3. orders - order_type + the deposit/balance split. Scope
--      deliberately narrow for v1: a pre-order is single-vendor only and
--      cannot mix with regular items in the same cart (enforced in
--      order.service.js#checkout) - so these columns only ever get set
--      on a standalone order, never a split-cart parent/child pair. That
--      keeps this migration from having to reason about how a deposit
--      splits across multiple vendor child orders, which is a
--      substantially harder problem left for a later phase if real
--      demand shows up.
--
-- payment_status gets a new 'deposit_paid' value sitting between the
-- existing 'unpaid' and 'paid' - every existing `payment_status = 'paid'`
-- check across the codebase (wallet crediting, EFD receipts, referral
-- points, recommendation signals, admin revenue reports) stays correct
-- unchanged, since a deposit alone deliberately does NOT satisfy that
-- comparison. Escrow/wallet crediting for a pre-order only fires once
-- the balance is in and payment_status reaches 'paid', same as any
-- other order - see payment.service.js#_handleOrderPaymentWebhook.

ALTER TABLE seller_profiles
    ADD COLUMN accepts_preorders BOOLEAN NOT NULL DEFAULT FALSE AFTER store_type_id,
    ADD COLUMN preorder_deposit_percent DECIMAL(5, 2) NOT NULL DEFAULT 30.00 AFTER accepts_preorders,
    ADD COLUMN preorder_default_lead_time_days INT NULL AFTER preorder_deposit_percent;

ALTER TABLE products
    ADD COLUMN is_preorder BOOLEAN NOT NULL DEFAULT FALSE AFTER stock,
    ADD COLUMN preorder_lead_time_days INT NULL AFTER is_preorder;

ALTER TABLE orders
    MODIFY payment_status ENUM('unpaid', 'deposit_paid', 'paid') NOT NULL DEFAULT 'unpaid',
    ADD COLUMN order_type ENUM('standard', 'pre_order') NOT NULL DEFAULT 'standard' AFTER status,
    ADD COLUMN preorder_lead_time_days INT NULL AFTER order_type,
    ADD COLUMN preorder_ready_by DATE NULL AFTER preorder_lead_time_days,
    ADD COLUMN deposit_amount DECIMAL(12, 2) NULL AFTER total_amount,
    ADD COLUMN deposit_paid_at TIMESTAMP NULL AFTER deposit_amount,
    ADD COLUMN balance_amount DECIMAL(12, 2) NULL AFTER deposit_paid_at,
    ADD COLUMN balance_requested_at TIMESTAMP NULL AFTER balance_amount,
    ADD COLUMN balance_paid_at TIMESTAMP NULL AFTER balance_requested_at;

-- Lets a pre-order payment have two rows (deposit, then balance) instead
-- of the one-row-per-order convention every other payment purpose uses -
-- see payment.repository.js's updated findByOrderId (now "latest row for
-- this order", not "the row") and the initiate*Payment reuse-guard fix
-- (only reuse a still-pending row; a completed deposit row must never be
-- silently reused/overwritten for the balance charge).
ALTER TABLE payments
    ADD COLUMN payment_leg ENUM('full', 'deposit', 'balance') NOT NULL DEFAULT 'full' AFTER purpose;
