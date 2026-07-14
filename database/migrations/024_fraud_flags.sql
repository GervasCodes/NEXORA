-- Rule-based fraud flagging (no ML/external service - just heuristics
-- evaluated against data already in the database). Each row is one
-- flagged event for admin review; entity_type/entity_id point at
-- whatever triggered it (an order or a seller), kept generic so more
-- rule types can target new entity kinds later without a schema change.
CREATE TABLE IF NOT EXISTS fraud_flags (
    id INT AUTO_INCREMENT PRIMARY KEY,
    entity_type ENUM('order', 'seller') NOT NULL,
    entity_id INT NOT NULL,
    rule_code VARCHAR(50) NOT NULL,
    reason VARCHAR(255) NOT NULL,
    severity ENUM('low', 'medium', 'high') NOT NULL DEFAULT 'medium',
    status ENUM('open', 'dismissed', 'confirmed') NOT NULL DEFAULT 'open',

    resolved_by INT NULL,
    resolved_at TIMESTAMP NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_fraud_flags_resolved_by
        FOREIGN KEY (resolved_by) REFERENCES users(id)
        ON DELETE SET NULL
);

CREATE INDEX idx_fraud_flags_status ON fraud_flags (status, created_at);
CREATE INDEX idx_fraud_flags_entity ON fraud_flags (entity_type, entity_id);
