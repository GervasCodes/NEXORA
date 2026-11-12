-- Migration 162: two-person approval for large payouts.
-- Run after 161_gateways_azampay_selcom_pawapay.sql.
--
-- A withdrawal at or above PAYOUT_DUAL_APPROVAL_THRESHOLD (TZS, default
-- 1,000,000; 0 turns the rule off) needs two different admins: the first
-- approval is recorded here and the request stays "pending"; a second,
-- different admin's approval moves it to "approved". Smaller payouts and
-- rejections still need one admin. Both columns are NULL until a first
-- approval happens, so existing rows are unaffected.
ALTER TABLE withdrawal_requests
    ADD COLUMN first_approved_by INT NULL AFTER admin_note,
    ADD COLUMN first_approved_at TIMESTAMP NULL AFTER first_approved_by;
