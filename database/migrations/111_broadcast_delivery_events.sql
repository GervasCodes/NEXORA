-- Migration 111: Brevo delivery-status webhook (Phase 5, production error fixes)
--
-- The original broadcast send flow (migration 107) only records "we
-- asked Brevo/the SMS gateway/WhatsApp to send N messages" - a 200 from
-- POST /admin/broadcasts confirms the send request was accepted, not
-- that any message actually reached an inbox. This adds the receiving
-- side for Brevo's delivery webhook (delivered / hard_bounce /
-- soft_bounce / spam events) so that gap is at least visible.
--
-- Deliberately NOT joined back to a specific `broadcasts` row yet.
-- Doing that precisely requires tagging every outgoing broadcast email
-- at send time with the broadcast's id (Brevo's `tags` field, which is
-- echoed back on the webhook event) - which in turn requires creating
-- the `broadcasts` row BEFORE sending rather than after, a reordering
-- of broadcast.service.js#sendBroadcast that also touches
-- utils/sendEmail.js's call signature closely enough to break that
-- function's existing, currently-passing test
-- (backend/tests/unit/broadcast/broadcast.service.test.js asserts
-- exact call args on sendEmail() and exact final counts on
-- broadcastRepository.create()). Ground rule 5 for this phase is no
-- unrelated refactors, so that reordering is flagged in
-- PHASE_5_NOTES.md as a deliberate follow-up rather than done here.
-- This table gives real, system-wide delivered/bounced/spam visibility
-- in the meantime, which is a genuine improvement over no delivery
-- confirmation at all, even without the per-broadcast join.
CREATE TABLE IF NOT EXISTS email_delivery_events (
    id INT AUTO_INCREMENT PRIMARY KEY,

    -- Normalized from Brevo's `event` field: 'delivered' | 'hard_bounce'
    -- | 'soft_bounce' | 'spam' | 'other' (anything Brevo sends that
    -- isn't one of the above, kept rather than dropped so nothing is
    -- silently lost while the mapping is still new).
    event_type VARCHAR(30) NOT NULL,

    recipient_email VARCHAR(255) NOT NULL,

    -- Brevo's `message-id` field, when present - the closest thing to a
    -- join key back to a specific send, ahead of the tag-based
    -- broadcast attribution described above.
    brevo_message_id VARCHAR(255) NULL,

    -- Full webhook payload, kept as-is for anything this phase's
    -- event_type mapping doesn't yet surface (e.g. open/click events,
    -- if those get turned on later).
    raw_event JSON NULL,

    received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_email_delivery_events_type ON email_delivery_events(event_type);
CREATE INDEX idx_email_delivery_events_email ON email_delivery_events(recipient_email);
