-- Migration 077: MalipoPay Card payment gateway.
-- Run after 076_user_last_active_tracking.sql.
--
-- Adds 'malipopay_card' as an accepted value alongside the existing
-- 'mobile_money' / 'cash_on_delivery' / 'snippe' / 'paypal', on both:
--   - orders.payment_method (what the buyer chose at checkout)
--   - payments.method (what a specific payment record used)
--
-- This is MalipoPay's separate card-checkout product (Visa / Mastercard
-- / American Express / UnionPay) - a distinct integration/credentials
-- from the existing 'mobile_money' rail's own MalipoPay adapter (see
-- malipopayCard.provider.js's header comment). Mirrors migration 030's
-- Snippe rollout exactly: payments.transaction_reference,
-- payments.purpose, and payments.seller_id/subscription_id/booking_id
-- (migrations 019/064/073) already generalize payments beyond a single
-- order-payment shape, so no other schema change is needed for order,
-- booking, verification-fee, or subscription payments to go through
-- this new rail.

ALTER TABLE orders
    MODIFY payment_method ENUM('mobile_money', 'cash_on_delivery', 'snippe', 'malipopay_card', 'paypal') NOT NULL;

ALTER TABLE payments
    MODIFY method ENUM('mobile_money', 'cash_on_delivery', 'snippe', 'malipopay_card', 'paypal') NOT NULL;

-- refunds.provider (migration 038) is deliberately its own ENUM, not a
-- foreign key into payments.method, so it needs the same widening here -
-- otherwise refund.service.js's automatic refund path would fail to
-- record a refund row for any completed MalipoPay Card payment.
ALTER TABLE refunds
    MODIFY provider ENUM('mobile_money', 'snippe', 'malipopay_card', 'paypal', 'cash_on_delivery') NOT NULL;
