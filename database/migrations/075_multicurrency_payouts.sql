-- Migration 075: multi-currency seller payouts.
--
-- Design notes:
--  - Reuses the existing currency infrastructure exactly as the roadmap
--    asked, rather than introducing a second exchange-rate mechanism:
--    the same admin-editable `usd_exchange_rate` platform_settings row
--    (017/DEFAULTS in settings.service.js) that already converts a TZS
--    amount to USD for PayPal (paypal.provider.js) is now also used by
--    wallet.service.js#requestWithdrawal to compute a USD-equivalent
--    payout amount when a seller asks to be paid out in USD.
--  - A seller's wallet balance itself stays TZS-denominated (every
--    order/booking commission calculation in wallet.service.js is
--    unaffected) - only the payout leg gains a currency choice. This
--    keeps the change additive: existing TZS payouts (the only kind
--    before this migration) work exactly as before with
--    payout_currency defaulting to 'TZS' and payout_exchange_rate NULL.
--  - payout_exchange_rate snapshots the rate actually used at request
--    time (same reasoning order_items.commission_rate snapshots the
--    commission rate - 017's own design notes) so a later admin change
--    to usd_exchange_rate never rewrites what a seller was already
--    quoted for a pending/processed withdrawal.
ALTER TABLE withdrawal_requests
    ADD COLUMN payout_currency ENUM('TZS', 'USD') NOT NULL DEFAULT 'TZS' AFTER amount,
    ADD COLUMN payout_amount DECIMAL(14, 2) NULL AFTER payout_currency,
    ADD COLUMN payout_exchange_rate DECIMAL(10, 4) NULL AFTER payout_amount;
