-- Migration 079: Monetization Master Switch.
--
-- Seeds the four monetization on/off flags into the existing
-- platform_settings key/value table (017_wallet_commission_earnings.sql)
-- - no schema change needed there, it's already EAV. This INSERT just
-- makes the default OFF state visible in the row set from day one
-- instead of relying purely on settings.service.js's in-code DEFAULTS
-- fallback (which still applies if this migration hasn't run yet on an
-- older environment).
--
-- Enforcement points (see settings.service.js#isXMonetizationEnabled):
--   monetization_subscriptions_enabled  -> subscription.controller.js subscribe* actions
--   monetization_commission_enabled     -> subscription.service.js#getEffectiveCommissionRate
--   monetization_sponsorship_enabled    -> sponsorship / featuredStore / departmentSponsorship .service.js#createCampaign
--   monetization_verification_fee_enabled -> seller.service.js#payVerificationFee,
--     middleware/requireVerificationFeePaid.middleware.js
--
-- Safe to re-run: ON DUPLICATE KEY UPDATE is a no-op if the rows already
-- exist (matches migration 017's own seeding style).
INSERT INTO platform_settings (setting_key, setting_value) VALUES
    ('monetization_subscriptions_enabled', 'false'),
    ('monetization_commission_enabled', 'false'),
    ('monetization_sponsorship_enabled', 'false'),
    ('monetization_verification_fee_enabled', 'false')
ON DUPLICATE KEY UPDATE setting_key = setting_key;

-- Lets an admin schedule a flag flip for a future date/time (e.g. "enable
-- subscriptions on 1 January 2027 at 00:00") instead of only flipping it
-- live - see jobs/monetizationSchedule.job.js, which applies due rows the
-- same way jobs/departmentMaintenanceSchedule.job.js (migration 069)
-- already applies due department maintenance windows.
--
-- One row per scheduled change rather than columns on platform_settings
-- (unlike migration 069's approach on `categories`) because
-- platform_settings is itself an EAV table with no per-flag row to add
-- columns to, and because more than one flag can have a schedule pending
-- at once.
CREATE TABLE IF NOT EXISTS monetization_schedule (
    id INT AUTO_INCREMENT PRIMARY KEY,

    setting_key VARCHAR(64) NOT NULL,      -- one of the four monetization_* keys above
    scheduled_value TINYINT(1) NOT NULL,   -- the value to apply: 1 = enable, 0 = disable
    scheduled_at DATETIME NOT NULL,        -- when to apply it (server time)

    applied_at DATETIME NULL,              -- set by the cron job once applied; NULL = still pending
    cancelled_at DATETIME NULL,            -- set if an admin cancels it before it applies

    created_by INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,

    -- Backs the every-minute cron job's "find due, still-pending rows"
    -- scan with a plain index lookup instead of a full table scan.
    INDEX idx_monetization_schedule_pending (scheduled_at, applied_at, cancelled_at)
);
