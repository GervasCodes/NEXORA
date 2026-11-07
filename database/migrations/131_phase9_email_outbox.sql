-- Migration 131: email retry queue (Phase 9, R3 §2).
--
-- Best-effort notification emails that fail to send are parked here and
-- retried by emailRetry.job.js with backoff, instead of being lost. Rows that
-- exhaust their attempts stay as status 'failed' and feed the admin dashboard
-- counter. Additive and safe to re-run; no existing data needs backfilling.

CREATE TABLE IF NOT EXISTS email_outbox (
    id INT AUTO_INCREMENT PRIMARY KEY,
    to_email VARCHAR(255) NOT NULL,
    subject VARCHAR(255) NOT NULL,
    text_body MEDIUMTEXT NOT NULL,
    html_body MEDIUMTEXT NULL,
    status ENUM('pending', 'sent', 'failed') NOT NULL DEFAULT 'pending',
    attempts INT NOT NULL DEFAULT 0,
    last_error VARCHAR(500) NULL,
    next_attempt_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    sent_at TIMESTAMP NULL,
    INDEX idx_email_outbox_due (status, next_attempt_at)
);
