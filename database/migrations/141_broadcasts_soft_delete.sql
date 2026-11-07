-- Migration 141: soft-delete for broadcast history (Admin broadcast management)
--
-- broadcasts is documented as a history/audit record (see migration
-- 107), so "delete" from the admin UI hides a row from
-- GET /admin/broadcasts rather than destroying it - the same
-- append-only spirit as audit_logs, which has no delete path at all.
-- deleted_at is NULL for every broadcast still shown in the admin list;
-- a non-NULL value just means an admin dismissed it, not that the
-- record is gone.
ALTER TABLE broadcasts ADD COLUMN deleted_at TIMESTAMP NULL DEFAULT NULL;

CREATE INDEX idx_broadcasts_deleted_at ON broadcasts(deleted_at);
