-- Migration 028: record actual charged currency/amount for foreign-
-- currency gateways.
-- Run after 027_stripe_paypal_gateways.sql.
--
-- payments.amount is always the TZS amount (the source of truth used
-- throughout the rest of the app - order totals, wallet crediting,
-- commission, etc). Stripe charges natively in TZS, so for Stripe rows
-- these two new columns are simply left NULL (amount === what was
-- charged). PayPal doesn't support TZS, so paypal.provider.js converts
-- to USD before charging - these columns record exactly what was
-- actually charged and at what rate, so a receipt/reconciliation never
-- has to guess or recompute a historical conversion after
-- usd_exchange_rate has since changed.

ALTER TABLE payments
    ADD COLUMN charged_currency CHAR(3) NULL AFTER amount,
    ADD COLUMN charged_amount DECIMAL(12, 2) NULL AFTER charged_currency;
