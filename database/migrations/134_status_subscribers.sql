-- Migration 134: status page email subscribers (Phase 14).
--
-- People can subscribe to incident updates from the public status page.
-- Each row carries a random unsubscribe token used in every email's link.
-- Additive and safe to re-run.

CREATE TABLE IF NOT EXISTS status_subscribers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    unsubscribe_token CHAR(48) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_status_subscribers_email (email),
    UNIQUE KEY uq_status_subscribers_token (unsubscribe_token)
);
