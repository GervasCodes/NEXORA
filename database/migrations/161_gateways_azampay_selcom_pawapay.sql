-- Migration 161: payment gateways -> AzamPay / Selcom / PawaPay (+ PayPal).
-- Run after 160_search_queries.sql.
--
-- Snippe and MalipoPay (mobile + card) are removed from the app. The buyer-
-- facing payment methods are now: mobile_money, card, paypal (plus
-- cash_on_delivery and wallet, which are not external gateways).
--   * 'mobile_money' and 'card' are gateway-agnostic rails; which gateway
--     (azampay | selcom | pawapay for mobile money, selcom | azampay for card)
--     is chosen by MOBILE_MONEY_PROVIDER / CARD_PROVIDER and recorded per
--     payment in the new payments.provider column.
--   * Historical 'snippe' and 'malipopay_card' rows become method 'card' with
--     provider 'snippe' / 'malipopay', so history stays accurate and refunds
--     for them are routed to manual handling (no adapter remains).
--
-- Three steps per table (MySQL cannot drop an ENUM value still in use):
-- widen, move rows, narrow.

-- 1. payments.provider
ALTER TABLE payments
    ADD COLUMN provider VARCHAR(20) NULL AFTER method;

-- 2. widen enums
ALTER TABLE orders
    MODIFY payment_method ENUM('mobile_money', 'cash_on_delivery', 'snippe', 'malipopay_card', 'card', 'paypal', 'wallet') NOT NULL;

ALTER TABLE payments
    MODIFY method ENUM('mobile_money', 'cash_on_delivery', 'snippe', 'malipopay_card', 'card', 'paypal', 'wallet') NOT NULL;

ALTER TABLE refunds
    MODIFY COLUMN provider ENUM('mobile_money', 'snippe', 'malipopay_card', 'card', 'paypal', 'wallet', 'cash_on_delivery') NOT NULL;

-- 3. move rows (payments first: provider is derived from the old method)
UPDATE payments SET provider = 'snippe' WHERE method = 'snippe';
UPDATE payments SET provider = 'malipopay' WHERE method = 'malipopay_card';
UPDATE payments SET method = 'card' WHERE method IN ('snippe', 'malipopay_card');
UPDATE orders SET payment_method = 'card' WHERE payment_method IN ('snippe', 'malipopay_card');
UPDATE refunds SET provider = 'card' WHERE provider IN ('snippe', 'malipopay_card');

-- Mobile-money payments taken before this migration went through MalipoPay,
-- Selcom or AzamPay - which one was never recorded, so provider stays NULL
-- ("use the gateway currently configured", the previous behaviour).

-- 4. narrow
ALTER TABLE orders
    MODIFY payment_method ENUM('mobile_money', 'cash_on_delivery', 'card', 'paypal', 'wallet') NOT NULL;

ALTER TABLE payments
    MODIFY method ENUM('mobile_money', 'cash_on_delivery', 'card', 'paypal', 'wallet') NOT NULL;

ALTER TABLE refunds
    MODIFY COLUMN provider ENUM('mobile_money', 'card', 'paypal', 'wallet', 'cash_on_delivery') NOT NULL;
