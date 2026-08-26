-- Return evidence uploads (audit item #23 - Returns had no file upload
-- at all, unlike disputes/KYC). Mirrors dispute_evidence's shape from
-- 034_disputes.sql exactly, just scoped to order_returns instead of
-- disputes.

CREATE TABLE IF NOT EXISTS return_evidence (
    id INT AUTO_INCREMENT PRIMARY KEY,
    return_id INT NOT NULL,
    uploaded_by INT NOT NULL,
    file_url VARCHAR(500) NOT NULL,
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_return_evidence_return
        FOREIGN KEY (return_id) REFERENCES order_returns(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_return_evidence_user
        FOREIGN KEY (uploaded_by) REFERENCES users(id),

    INDEX idx_return_evidence_return (return_id)
);
