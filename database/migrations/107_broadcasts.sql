-- Migration 107: Admin broadcast (Phase 9)
--
-- One row per broadcast an admin sends. This is a history/audit record,
-- not a per-recipient delivery log (which would be a much bigger table
-- for very little benefit at this stage - the segment + counts already
-- answer "who did we message and roughly how many got it", and every
-- individual send already goes through the existing
-- sendEmail/smsProvider/whatsappProvider best-effort paths, which log
-- their own failures - see broadcast.service.js).
--
-- No new email provider table here - config/brevo.js (used by
-- utils/sendEmail.js) already exists and is reused as-is; this phase
-- only adds the segment-targeting + composition layer on top of it and
-- the existing SMS/WhatsApp provider routers.
CREATE TABLE IF NOT EXISTS broadcasts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    admin_id INT NOT NULL,

    -- 'all_sellers' | 'all_buyers' | 'all_delivery_agents' | 'everyone'
    -- (everyone = every non-admin role) - see
    -- backend/src/constants/broadcast.js#BROADCAST_SEGMENTS.
    segment VARCHAR(30) NOT NULL,

    -- Comma-separated subset of 'email','sms','whatsapp' - kept as a
    -- plain string rather than a JSON column since it's only ever
    -- read back for display (broadcast history), never queried by
    -- individual channel.
    channels VARCHAR(60) NOT NULL,

    subject VARCHAR(150) NULL, -- email only; NULL when channels excludes email
    message TEXT NOT NULL,

    recipient_count INT NOT NULL DEFAULT 0,
    email_sent_count INT NOT NULL DEFAULT 0,
    sms_sent_count INT NOT NULL DEFAULT 0,
    whatsapp_sent_count INT NOT NULL DEFAULT 0,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (admin_id) REFERENCES users(id)
);

CREATE INDEX idx_broadcasts_created_at ON broadcasts(created_at);
