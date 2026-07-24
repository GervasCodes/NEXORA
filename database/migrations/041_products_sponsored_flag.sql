-- Migration 041: sponsored product flag
-- Additive only. Admin-toggled placement flag for the Phase 2C
-- "Sponsored products" department section. This is deliberately just the
-- display flag - the actual campaign/budget/payment system described in
-- Phase 8A ("Sponsored Products") is a separate, later piece of work.

ALTER TABLE products
    ADD COLUMN is_sponsored BOOLEAN NOT NULL DEFAULT FALSE AFTER is_active;
