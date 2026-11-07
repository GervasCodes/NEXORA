-- Migration 117: Per-account login lockout / backoff.
-- Run after 116_refresh_subscription_plan_features.sql.
--
-- The IP-wide authLimiter (rateLimit.middleware.js) caps requests per
-- source address, so a distributed attacker spreading guesses across many
-- IPs can still hammer ONE account. These columns let login.service.js
-- count consecutive failures per account (password mismatches and wrong
-- login OTP codes alike) and temporarily lock the account with an
-- escalating backoff - see loginLockout.service.js for the policy.
--
-- Stored on users (same "just columns on users" approach as
-- token_version in 071) rather than a side table: login already reads
-- the users row, so checking the lock costs no extra query, and a
-- successful login only writes when there is something to clear.
--
--   failed_login_attempts  Consecutive failures since the last full
--                          successful login or password reset. Decays to
--                          zero if the last failure was over 24h ago.
--   last_failed_login_at   When the most recent counted failure happened.
--   login_locked_until     NULL, or the moment the current lock lifts.
--
-- All three are NULL/0 for every existing user, i.e. nobody starts locked.

ALTER TABLE users
    ADD COLUMN failed_login_attempts INT UNSIGNED NOT NULL DEFAULT 0 AFTER token_version,
    ADD COLUMN last_failed_login_at DATETIME NULL AFTER failed_login_attempts,
    ADD COLUMN login_locked_until DATETIME NULL AFTER last_failed_login_at;
