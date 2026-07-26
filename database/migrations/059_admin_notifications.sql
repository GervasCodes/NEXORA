-- Migration 059: admin_notifications (Phase 2 - Admin Notification Center)
--
-- Deliberately a separate table from `notifications` (migration/schema
-- notifications.sql), not a reuse of it. `notifications` is scoped to a
-- single `user_id` and is fully consumed by that one person (see
-- notification.repository.js/notification.service.js) - fanning an
-- admin-facing event out into one row per admin there would mean N
-- inserts per event, N read-states to keep in sync, and rows tied to
-- users(id) with ON DELETE CASCADE (so removing an admin account would
-- silently delete that admin's copy of shared history).
--
-- admin_notifications is a single shared feed instead: one row per
-- event, visible to every admin, with one shared read/unread state
-- (`is_read` + who first acknowledged it in `read_by`/`read_at`) rather
-- than a per-admin read flag. That matches how the admin panel already
-- treats other shared queues (fraud_flags, disputes, audit_logs) -
-- something one admin has looked at doesn't need re-surfacing to every
-- other admin as if it were still new.
--
-- `related_user_id` is nullable + ON DELETE SET NULL (same pattern as
-- fraud_flags.resolved_by / disputes.resolved_by / users.suspended_by)
-- so the notification's history survives the referenced account later
-- being permanently deleted - see admin.repository.js#deleteNotifications
-- and permanentlyDeleteUser, which erase that *user's own* copies of
-- `notifications` but have no reason to touch this table.
--
-- `read_by` is similarly nullable + ON DELETE SET NULL so an admin who
-- acknowledged an item and later has their own admin access removed
-- (removeAdmin) doesn't take the acknowledgement history down with them.

CREATE TABLE IF NOT EXISTS admin_notifications (
    id INT AUTO_INCREMENT PRIMARY KEY,

    -- Fine-grained event, e.g. 'user_registered', 'account_suspended'.
    -- See adminNotification.service.js for the full set this is drawn from.
    type VARCHAR(50) NOT NULL,

    -- Coarse grouping the admin UI filters/badges by - keeps the type
    -- list free to grow without the UI needing to know every value.
    category ENUM('account', 'moderation', 'security') NOT NULL,

    severity ENUM('info', 'warning', 'critical') NOT NULL DEFAULT 'info',

    title VARCHAR(150) NOT NULL,
    message VARCHAR(500) NOT NULL,

    -- Event-specific extra detail (target user id/role, reason, dispute
    -- number, rule code, etc.) - same purpose as audit_logs.metadata.
    metadata JSON NULL,

    -- The user the event is about, when there is one (a registration, a
    -- suspension, a report). NULL for platform-wide events with no
    -- single subject.
    related_user_id INT NULL,

    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    read_by INT NULL,
    read_at TIMESTAMP NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (related_user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (read_by) REFERENCES users(id) ON DELETE SET NULL,

    INDEX idx_admin_notifications_type (type),
    INDEX idx_admin_notifications_category (category),
    INDEX idx_admin_notifications_is_read (is_read),
    INDEX idx_admin_notifications_created_at (created_at)
);
