-- Migration 081: Nexora AI foundation (Phase B1).
--
-- Design notes:
--  - ai_usage_log is one row per AI provider call (not a running counter),
--    same append-only reasoning as wallet_transactions/audit_log - lets
--    the spending guard (ai.service.js#checkSpendGuard) sum tokens over
--    any window (today, this month) with a plain SUM query, and gives
--    admins a real trail if usage needs investigating later. user_id is
--    nullable because several B1 endpoints (FAQ chat, smart search) are
--    public and personalize only if a buyer happens to be signed in
--    (same "optional buyer" shape as recommendation.controller.js) -
--    anonymous usage still counts toward the *global* cap, just not any
--    per-user one.
--  - feature is a short tag ('chat' | 'search' | 'recommend' |
--    'order_status') so usage/cost can eventually be broken down per
--    B1 feature, not just per user - not enforced anywhere yet, purely
--    for future reporting.
--  - Caps/master-switch live in the existing platform_settings EAV table
--    (017) rather than a new settings table, matching how every other
--    admin-tunable rate in this codebase is stored - see
--    settings.service.js DEFAULTS for the fallback values if this
--    migration hasn't run yet on an older environment.
CREATE TABLE IF NOT EXISTS ai_usage_log (
    id INT AUTO_INCREMENT PRIMARY KEY,

    user_id INT NULL,
    feature VARCHAR(40) NOT NULL,
    tokens_used INT NOT NULL DEFAULT 0,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_ai_usage_log_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Backs the spend guard's two query shapes: "this user, since <date>" and
-- "everyone, since <date>".
CREATE INDEX idx_ai_usage_log_user_created ON ai_usage_log (user_id, created_at);
CREATE INDEX idx_ai_usage_log_created ON ai_usage_log (created_at);

-- Master switch (independent of whether a provider is actually
-- configured via env - see ai/providers/registry.js) plus the four caps
-- the spend guard enforces. Conservative defaults: real values should be
-- tuned from AdminSettings once real usage/cost data exists.
INSERT INTO platform_settings (setting_key, setting_value) VALUES
    ('ai_enabled', 'true'),
    ('ai_daily_token_cap_per_user', '20000'),
    ('ai_monthly_token_cap_per_user', '300000'),
    ('ai_daily_token_cap_global', '2000000'),
    ('ai_monthly_token_cap_global', '30000000')
ON DUPLICATE KEY UPDATE setting_key = setting_key;
