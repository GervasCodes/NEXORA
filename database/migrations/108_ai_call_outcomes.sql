-- Migration 108: Nexora AI call-outcome tracking (Phase 13 audit).
--
-- ai_usage_log (081) only ever gets a row on a *successful* provider
-- call (see ai.service.js#callProvider - recordUsage is called after a
-- successful provider.complete()). That means there was no way to see
-- how often any given feature was actually falling back to its non-AI
-- template - a bad/expired API key, a provider outage, or (for the
-- two JSON-based features) a model reply that fails to parse would all
-- be completely invisible in the Admin Settings usage panel, exactly
-- the kind of silent-failure risk already flagged for the worker/Sentry
-- setup in Phase 0. Migration 081's own comment even flagged this:
-- "feature is a short tag ... so usage/cost can eventually be broken
-- down per feature - not enforced anywhere yet, purely for future
-- reporting." This table is that reporting, plus real success/fallback
-- outcomes rather than just token cost.
--
-- Deliberately a separate table from ai_usage_log rather than adding a
-- column to it, since a fallback call never reaches recordUsage at all
-- (no tokens were spent) - this needs its own insert point at every
-- callProvider() return path, success or fallback alike.
--
-- Best-effort/fire-and-forget (see ai.repository.js#recordOutcome) -
-- same reasoning as audit.service.js#log: a lost outcome row must never
-- delay or fail the actual AI/fallback response it's describing, since
-- this table only feeds an admin reporting panel, never the spend guard
-- itself (ai_usage_log remains the only source of truth for that).
CREATE TABLE IF NOT EXISTS ai_call_outcomes (
    id INT AUTO_INCREMENT PRIMARY KEY,

    feature VARCHAR(40) NOT NULL,
    -- 'success' | 'fallback_no_provider' | 'fallback_ai_disabled' |
    -- 'fallback_global_daily_cap' | 'fallback_global_monthly_cap' |
    -- 'fallback_user_daily_cap' | 'fallback_user_monthly_cap' |
    -- 'fallback_guard_check_failed' | 'fallback_provider_error' |
    -- 'fallback_invalid_output'
    outcome VARCHAR(30) NOT NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Backs the quality panel's "per feature, last N days" grouped query.
CREATE INDEX idx_ai_call_outcomes_feature_created ON ai_call_outcomes (feature, created_at);
