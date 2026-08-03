-- Migration 074: status_incidents table backing the public status page
-- (SLA & Status Page item on the Revenue & Product Enhancements roadmap).
--
-- Design notes:
--  - This is deliberately a manually-curated incident log, not an
--    automated one. Phase 1's uptime-check GitHub Actions workflow
--    (docs/UPTIME_MONITORING.md) already opens/closes a GitHub issue
--    automatically when /health fails - that stays the source of truth
--    for detection. This table is what an admin posts to communicate an
--    incident to buyers/sellers ("Payments delayed for 20 minutes"),
--    the same way any public status page (Statuspage.io-style) separates
--    "we detected a problem" from "here's what we're telling customers".
--  - component lets one incident be scoped to a specific area (payments,
--    delivery, bookings, ...) rather than implying the whole platform is
--    down - the status page groups by component.
--  - status is the incident's own lifecycle (investigating -> resolved),
--    independent of severity - a resolved incident stays in the log for
--    history instead of being deleted, same append-only reasoning used
--    throughout this codebase (wallet_transactions, audit_log, etc).
CREATE TABLE IF NOT EXISTS status_incidents (
    id INT AUTO_INCREMENT PRIMARY KEY,

    title VARCHAR(150) NOT NULL,
    component ENUM('platform', 'payments', 'orders', 'bookings', 'delivery', 'notifications') NOT NULL DEFAULT 'platform',
    severity ENUM('minor', 'major', 'critical') NOT NULL DEFAULT 'minor',
    status ENUM('investigating', 'identified', 'monitoring', 'resolved') NOT NULL DEFAULT 'investigating',

    message TEXT NOT NULL,

    started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP NULL,

    created_by INT NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_status_incidents_admin
        FOREIGN KEY (created_by) REFERENCES users(id)
        ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX idx_status_incidents_status ON status_incidents (status, started_at);
