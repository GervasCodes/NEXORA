-- Migration 035: audit_logs
-- Satisfies SRS 3.10 (Audit and Logging): "Record important system events
-- such as user logins, failed login attempts, order creation, and payment
-- processing. Maintain logs for troubleshooting and security monitoring."
--
-- user_id is nullable because failed logins with an unknown/mistyped
-- email have no user row to attach to - the event is still logged with
-- whatever identifying detail is available in metadata.
-- ON DELETE SET NULL (not CASCADE) so a user's audit trail survives
-- account deletion for later security investigation.

CREATE TABLE IF NOT EXISTS audit_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,

    user_id INT NULL,
    event_type VARCHAR(50) NOT NULL,   -- e.g. 'login_success', 'login_failed', 'user_registered', 'order_created', 'payment_processed'
    description VARCHAR(255) NULL,
    ip_address VARCHAR(45) NULL,       -- IPv4 or IPv6
    metadata JSON NULL,                -- event-specific extra detail (order id, amount, reason, etc.)

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,

    INDEX idx_audit_logs_event_type (event_type),
    INDEX idx_audit_logs_user_id (user_id),
    INDEX idx_audit_logs_created_at (created_at)
);
