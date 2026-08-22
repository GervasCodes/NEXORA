-- Migration 085: Phase Q3 - Communication Channels
-- Run after 084_wallet_topup_seller_loans.sql.
--
-- Two features:
--   1. WhatsApp Business API integration - order updates (opt-in flag +
--      notification.service.js's existing fan-out gains a WhatsApp leg,
--      same shape as its `withEmail` leg) and a menu-driven catalog/
--      order-tracking bot over WhatsApp's webhook (whatsapp_sessions
--      holds just enough state to know what a bare "2" or "3" reply
--      means in context).
--   2. In-app support/helpdesk widget - support_tickets/support_messages,
--      deliberately separate from `conversations`/`messages` (chat
--      module), which is buyer<->seller/delivery only and has no admin
--      participant column at all.

-- ---- 1. WhatsApp -----------------------------------------------------

ALTER TABLE users
    ADD COLUMN whatsapp_order_updates TINYINT(1) NOT NULL DEFAULT 0 AFTER phone;

CREATE TABLE IF NOT EXISTS whatsapp_sessions (
    phone VARCHAR(30) PRIMARY KEY,
    state VARCHAR(50) NOT NULL DEFAULT 'idle',
    -- Small bits of "what was I just shown" context (e.g. the numbered
    -- category list a bare "3" reply refers back to) - never anything
    -- that needs its own relational shape, so JSON is fine here.
    context JSON NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ---- 2. Support / helpdesk ---------------------------------------------

CREATE TABLE IF NOT EXISTS support_tickets (
    id INT AUTO_INCREMENT PRIMARY KEY,

    -- Nullable: a WhatsApp-originated ticket from a phone number that
    -- doesn't match any registered account still needs somewhere to
    -- live (see whatsapp.service.js) - contact_phone carries identity
    -- for those. An in-app ticket always has user_id set instead.
    user_id INT NULL,
    contact_phone VARCHAR(30) NULL,

    subject VARCHAR(200) NOT NULL,
    category ENUM('order', 'payment', 'account', 'product', 'other') NOT NULL DEFAULT 'other',
    status ENUM('open', 'pending', 'resolved', 'closed') NOT NULL DEFAULT 'open',

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_support_tickets_user
        FOREIGN KEY (user_id) REFERENCES users(id),

    INDEX idx_support_tickets_user (user_id),
    INDEX idx_support_tickets_status (status)
);

CREATE TABLE IF NOT EXISTS support_messages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    ticket_id INT NOT NULL,

    -- NULL sender_id + sender_role='user' covers a WhatsApp guest reply
    -- (see contact_phone above) the same way the ticket itself allows a
    -- NULL user_id.
    sender_id INT NULL,
    sender_role ENUM('user', 'admin') NOT NULL,

    body TEXT NOT NULL,
    attachment_url VARCHAR(500) NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_support_messages_ticket
        FOREIGN KEY (ticket_id) REFERENCES support_tickets(id)
        ON DELETE CASCADE,
    CONSTRAINT fk_support_messages_sender
        FOREIGN KEY (sender_id) REFERENCES users(id),

    INDEX idx_support_messages_ticket (ticket_id)
);
