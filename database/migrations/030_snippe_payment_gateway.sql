-- Migration 030: Replace Stripe with Snippe as a payment gateway.
-- Run after 029_remove_seller_verification_documents.sql.
--
-- Stripe has been removed from the codebase (see payment.service.js,
-- providers/snippe.provider.js) in favor of Snippe. Existing rows with
-- payment_method/method = 'stripe' are migrated to 'snippe' so historical
-- orders/payments keep an accurate, still-valid value rather than being
-- left pointing at a gateway the app no longer knows how to handle.
--
-- Done in three steps because MySQL won't let you rename an ENUM value
-- and drop the old one in a single ALTER while rows still reference it:
--   1. Widen the ENUM to accept both 'stripe' and 'snippe' at once.
--   2. Move any existing 'stripe' rows over to 'snippe'.
--   3. Narrow the ENUM back down, dropping 'stripe' for good.

ALTER TABLE orders
    MODIFY payment_method ENUM('mobile_money', 'cash_on_delivery', 'stripe', 'paypal', 'snippe') NOT NULL;

ALTER TABLE payments
    MODIFY method ENUM('mobile_money', 'cash_on_delivery', 'stripe', 'paypal', 'snippe') NOT NULL;

UPDATE orders SET payment_method = 'snippe' WHERE payment_method = 'stripe';
UPDATE payments SET method = 'snippe' WHERE method = 'stripe';

ALTER TABLE orders
    MODIFY payment_method ENUM('mobile_money', 'cash_on_delivery', 'snippe', 'paypal') NOT NULL;

ALTER TABLE payments
    MODIFY method ENUM('mobile_money', 'cash_on_delivery', 'snippe', 'paypal') NOT NULL;
