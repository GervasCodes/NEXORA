-- Migration 088: Phase Q6 - Performance & UX
-- Run after 087_pickup_points.sql.
--
-- Data-saver / low-bandwidth mode: a persisted per-account preference
-- (also mirrored to localStorage for a logged-out browsing session -
-- see frontend/src/context/DataSaverContext.jsx) that trims image
-- payload weight across the highest-traffic image surfaces (product and
-- service cards). Everything else about the UI/UX polishing pass this
-- phase also covers (onboarding walkthrough, empty/error states,
-- checkout layout) is frontend-only and needs no schema change.

ALTER TABLE users
    ADD COLUMN data_saver_enabled TINYINT(1) NOT NULL DEFAULT 0 AFTER whatsapp_order_updates;
