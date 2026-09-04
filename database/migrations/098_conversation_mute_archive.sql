-- Migration 098: Phase 8 (UI/UX remediation) - mute/archive conversations
-- Run after 097_store_follows.sql.
--
-- Same per-user-column shape as migration 021's *_cleared_at columns
-- (buyer/seller/agent, since a conversation can have up to three
-- participants - see chat.repository.js's clearedColumnFor/
-- deletedColumnFor for the established pattern this mirrors exactly):
--   *_muted_at    - stops push/notification-bell dispatch for that
--                    participant (the conversation still appears in
--                    their Messages list, with a muted indicator - see
--                    chat.service.js#sendMessage's notify loop, which
--                    checks this before calling notificationService).
--   *_archived_at - moves the conversation out of that participant's
--                    default Messages list into an "Archived" filter,
--                    without affecting the other participant's view at
--                    all (same isolation clearedColumnFor's columns
--                    already have).
-- Both are nullable timestamps (not booleans) so "when" is preserved for
-- free, the same reasoning *_cleared_at already established here.

ALTER TABLE conversations
    ADD COLUMN buyer_muted_at TIMESTAMP NULL,
    ADD COLUMN seller_muted_at TIMESTAMP NULL,
    ADD COLUMN agent_muted_at TIMESTAMP NULL,
    ADD COLUMN buyer_archived_at TIMESTAMP NULL,
    ADD COLUMN seller_archived_at TIMESTAMP NULL,
    ADD COLUMN agent_archived_at TIMESTAMP NULL;
