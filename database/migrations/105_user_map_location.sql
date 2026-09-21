-- Migration 105: user map location (Phase 5 - "map showing users")
-- Run after 104_test_data_flag.sql.
--
-- Background: PHASE1_DECISIONS.md originally recorded this as opt-in
-- only, sellers-only. That decision was overridden during Phase 5
-- implementation - see the amended section 4 in that file for the
-- override and the reasoning that was flagged before proceeding. This
-- migration implements the overridden decision: opt-out (on by
-- default) for both buyers and sellers, precise coordinates.
--
-- Columns land on `users` directly, same "just a column on users"
-- convention already used for last_active_at (076) and the
-- notify_*/data_saver_enabled toggles (100) - a live position and a
-- single sharing toggle don't need a separate table.
--
-- location_sharing_enabled defaults to 1 (opt-out): every existing
-- buyer/seller account starts visible once they send a first location
-- ping, without needing to take any action first. Present on every
-- role (not just buyer/seller) for the same reason data_saver_enabled
-- is - simpler than a role-conditional column, and delivery_agent/admin
-- rows simply never populate location_lat/location_lng through this
-- path (agents already have their own current_lat/current_lng from
-- migration 015, used for live delivery tracking - this is deliberately
-- a separate pair of columns, not a shared one, so a delivery agent's
-- job-tracking position and their personal map-visibility position
-- can't be confused with each other).
ALTER TABLE users
    ADD COLUMN location_lat DECIMAL(10, 7) NULL AFTER last_active_at,
    ADD COLUMN location_lng DECIMAL(10, 7) NULL AFTER location_lat,
    ADD COLUMN location_updated_at TIMESTAMP NULL AFTER location_lng,
    ADD COLUMN location_sharing_enabled TINYINT(1) NOT NULL DEFAULT 1 AFTER location_updated_at;

-- The admin user-map query (admin.repository.js#findUserMapPoints) filters
-- on exactly this combination every time it runs: role IN (buyer, seller)
-- AND sharing enabled AND a coordinate actually on file. Composite index
-- covers that filter directly rather than relying on a role-only or
-- flag-only index and scanning the rest.
CREATE INDEX idx_users_map_visibility ON users (role, location_sharing_enabled, location_lat);
