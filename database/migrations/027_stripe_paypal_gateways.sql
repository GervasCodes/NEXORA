-- Migration 027: Stripe + PayPal payment gateways.
-- Run after 026_account_verification.sql.
--
-- Adds 'stripe' and 'paypal' as accepted values alongside the existing
-- 'mobile_money' / 'cash_on_delivery', on both:
--   - orders.payment_method (what the buyer chose at checkout)
--   - payments.method (what a specific payment record used)
--
-- payments.transaction_reference already exists and is reused to store
-- the Stripe Checkout Session id / PaymentIntent id, or the PayPal Order
-- id - no new column needed there. payments.purpose / payments.seller_id
-- (migration 019) already generalize payments beyond just order
-- payments, so the seller verification fee can go through Stripe/PayPal
-- via the exact same payments row shape as mobile money, no schema
-- change needed for that either.

ALTER TABLE orders
    MODIFY payment_method ENUM('mobile_money', 'cash_on_delivery', 'stripe', 'paypal') NOT NULL;

ALTER TABLE payments
    MODIFY method ENUM('mobile_money', 'cash_on_delivery', 'stripe', 'paypal') NOT NULL;
