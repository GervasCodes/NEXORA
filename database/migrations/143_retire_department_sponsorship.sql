-- Migration 143: Retire Department Sponsorship (Phase 5, monetization
-- recalibration).
--
-- Department Sponsorship (migrations 053, 115, 126, 127) is no longer a
-- product: the module, its routes, its expiry job and its seller/admin
-- screens are gone, and the homepage department grid is back to plain
-- display_order, name ordering. This migration retires what is left in the
-- database. Migrations 053/115/126/127 are not edited.
--
-- Order matters. A campaign that is still running when the product is
-- switched off has already been paid for, so before the table is dropped
-- every such campaign is settled the same way a seller-initiated cancel
-- settles it (see sponsorship.service.js#computeCancelRefund, which the
-- old departmentSponsorship cancel also used):
--   - unused PAID days are credited back to the seller's wallet, at the
--     daily rate that campaign was bought at;
--   - unused INCLUDED-CREDIT days go back to the seller's current credit
--     period (if they have one - same as a cancel, credit days with no
--     current period are simply lost, since a period's credits only ever
--     lived inside that period).
-- Paid days are refunded first, credit days second, exactly as the cancel
-- does. The wallet credit is ONE ledger row per seller (all of that
-- seller's retired campaigns summed), written as 'adjustment' because the
-- wallet_transactions.reference_type enum has no value for this and the
-- enum is deliberately not widened for a product being removed.
--
-- Single pass: this runs once (tracked in schema_migrations). The wallet
-- balance update and its ledger row are computed from the same temporary
-- table, so they cannot disagree with each other.
--
-- What is deliberately NOT touched:
--   - existing wallet_transactions rows for past campaign debits/refunds.
--     They carry no foreign key to the campaigns table, so dropping it
--     leaves the financial ledger intact.
--   - the notification rows already sent (their text was resolved when
--     they were created).
--
-- Take a database backup before applying: DROP TABLE is not reversible.

-- ---- 1. Work out what each still-running campaign is owed ------------------

DROP TEMPORARY TABLE IF EXISTS tmp_dsc_retire;

-- PRIMARY KEY declared explicitly: hosts that set sql_require_primary_key
-- reject any table without one, temporary tables included.
CREATE TEMPORARY TABLE tmp_dsc_retire (PRIMARY KEY (campaign_id)) AS
SELECT
    id AS campaign_id,
    seller_id,
    days,
    credits_used,
    daily_rate,
    LEAST(days, GREATEST(0, FLOOR(TIMESTAMPDIFF(SECOND, NOW(), ends_at) / 86400))) AS remaining_days,
    CAST(0 AS SIGNED) AS refund_days,
    CAST(0 AS DECIMAL(12, 2)) AS refund_amount,
    CAST(0 AS SIGNED) AS credit_days_return
FROM department_sponsorship_campaigns
WHERE status = 'active' AND ends_at > NOW();

UPDATE tmp_dsc_retire
SET refund_days = LEAST(remaining_days, GREATEST(0, days - credits_used));

UPDATE tmp_dsc_retire
SET refund_amount = ROUND(refund_days * daily_rate, 2),
    credit_days_return = LEAST(remaining_days - refund_days, credits_used);

-- ---- 2. Pay unused paid days back to the wallet (balance, then ledger) -----

UPDATE seller_wallets w
JOIN (
    SELECT seller_id, SUM(refund_amount) AS total
    FROM tmp_dsc_retire
    GROUP BY seller_id
    HAVING SUM(refund_amount) > 0
) r ON r.seller_id = w.seller_id
SET w.balance = w.balance + r.total;

INSERT INTO wallet_transactions
    (seller_id, type, amount, balance_after, reference_type, reference_id, description)
SELECT
    r.seller_id,
    'credit',
    r.total,
    w.balance,
    'adjustment',
    NULL,
    CONCAT('Refund for unused days of ', r.campaigns, ' department sponsorship campaign(s) retired from the platform')
FROM (
    SELECT seller_id, SUM(refund_amount) AS total, COUNT(*) AS campaigns
    FROM tmp_dsc_retire
    WHERE refund_amount > 0
    GROUP BY seller_id
) r
JOIN seller_wallets w ON w.seller_id = r.seller_id;

-- ---- 3. Hand unused included-credit days back to the current period --------
-- "Current period" is resolved the way
-- sponsorshipCredit.repository.js#findCurrentPeriodId resolves it: the
-- seller's newest credit period whose subscription is still active.

DROP TEMPORARY TABLE IF EXISTS tmp_dsc_current_period;

-- One row per seller (GROUP BY seller_id below), so seller_id is the key.
CREATE TEMPORARY TABLE tmp_dsc_current_period (PRIMARY KEY (seller_id)) AS
SELECT cp.seller_id, MAX(cp.id) AS period_id
FROM seller_sponsorship_credit_periods cp
JOIN seller_subscriptions ss ON ss.id = cp.subscription_id
JOIN (
    SELECT cp3.seller_id, MAX(cp3.period_start) AS newest_start
    FROM seller_sponsorship_credit_periods cp3
    JOIN seller_subscriptions ss3 ON ss3.id = cp3.subscription_id
    WHERE ss3.status = 'active'
        AND (ss3.current_period_end IS NULL OR ss3.current_period_end >= NOW())
    GROUP BY cp3.seller_id
) m ON m.seller_id = cp.seller_id AND m.newest_start = cp.period_start
WHERE ss.status = 'active'
    AND (ss.current_period_end IS NULL OR ss.current_period_end >= NOW())
GROUP BY cp.seller_id;

UPDATE seller_sponsorship_credit_periods cp
JOIN tmp_dsc_current_period c ON c.period_id = cp.id
JOIN (
    SELECT seller_id, SUM(credit_days_return) AS total
    FROM tmp_dsc_retire
    GROUP BY seller_id
    HAVING SUM(credit_days_return) > 0
) r ON r.seller_id = cp.seller_id
SET cp.credits_used = GREATEST(0, cp.credits_used - r.total);

DROP TEMPORARY TABLE IF EXISTS tmp_dsc_current_period;

DROP TEMPORARY TABLE IF EXISTS tmp_dsc_retire;

-- ---- 4. Retire the database objects ---------------------------------------
-- The campaigns table carries its own foreign keys (to users and
-- categories) and its unique key / generated columns from migration 126;
-- nothing references it, so dropping it removes all of that with it.

DROP TABLE IF EXISTS department_sponsorship_dedupe_log;
DROP TABLE IF EXISTS department_sponsorship_campaigns;

-- The flat daily rate setting (migration 053) has no reader left.
DELETE FROM platform_settings WHERE setting_key = 'department_sponsorship_daily_rate';
