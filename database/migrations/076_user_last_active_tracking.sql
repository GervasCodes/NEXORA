-- Migration 076: last_active_at tracking (Revenue & Product Enhancements
-- roadmap - "active users" on the admin analytics dashboard).
--
-- Design notes:
--  - The admin dashboard's business metrics (017/see admin.repository.js)
--    already answer "how much GMV, what take rate, are buyers/providers
--    coming back" purely from paid orders/bookings - but that only
--    measures transacting users, not platform activity broadly (a buyer
--    browsing, a seller checking their dashboard). Rather than stand up
--    a full sessions/events table, this adds one nullable timestamp
--    column updated opportunistically by auth.middleware.js on
--    authenticated requests - the same lightweight "just a column on
--    users" approach this schema already uses for token_version (071).
--  - Throttled server-side (see auth.middleware.js's touchLastActive
--    call) so it's an UPDATE roughly once per user per few minutes, not
--    once per request - kept cheap enough to run unconditionally on
--    every authenticated call.
--  - NULL for any user who authenticated before this column existed and
--    hasn't made an authenticated request since - getActiveUsersMetrics
--    treats NULL as "not recently active", never as an error.
ALTER TABLE users
    ADD COLUMN last_active_at TIMESTAMP NULL AFTER updated_at;

CREATE INDEX idx_users_last_active ON users (role, last_active_at);
