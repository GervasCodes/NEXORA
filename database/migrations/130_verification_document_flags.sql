-- Migration 130: failing-document tagging for the account verification
-- review screen (Phase 8).
--
-- An admin can mark an individual submitted document as failing (blurry,
-- expired, mismatched name, etc.) with a short reason. One flag per
-- document: flagging again replaces the reason, un-flagging deletes the row.
-- Additive and safe to re-run.

CREATE TABLE IF NOT EXISTS account_verification_document_flags (
    document_id INT NOT NULL PRIMARY KEY,
    reason VARCHAR(255) NOT NULL,
    flagged_by INT NULL,
    flagged_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_avdf_document
        FOREIGN KEY (document_id) REFERENCES account_verification_documents(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_avdf_admin
        FOREIGN KEY (flagged_by) REFERENCES users(id)
        ON DELETE SET NULL
);
