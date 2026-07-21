-- Migration 037: delivery timeline timestamps
-- Run after 036_terms_acceptance.sql.
--
-- Phase 1 (live order tracking) adds a dedicated full-screen tracking
-- page with a step-by-step delivery timeline (assigned -> picked up ->
-- in transit -> delivered), each step showing when it actually happened.
-- `deliveries` already had assigned_at and delivered_at (migration 008),
-- but the two middle transitions were never timestamped individually -
-- only inferable from `updated_at`, which gets overwritten by every
-- subsequent status change. Adding explicit columns, set the moment
-- delivery.service.updateDeliveryStatus moves into that status, so the
-- timeline can render real times instead of guessing.
--
-- Both NULL for any delivery that hasn't reached that stage yet, and
-- NULL forever for existing in-flight/completed deliveries created
-- before this migration (backfilling from `updated_at` would be a guess,
-- not a fact - left blank rather than showing a misleading time).
ALTER TABLE deliveries
    ADD COLUMN picked_up_at TIMESTAMP NULL AFTER assigned_at,
    ADD COLUMN in_transit_at TIMESTAMP NULL AFTER picked_up_at;
