-- Migration 086: Phase Q4 - Tax Compliance
-- Run after 085_whatsapp_and_support.sql.
--
-- EFD (Electronic Fiscal Device) e-invoicing: TRA requires registered
-- taxpayers to issue fiscal receipts (verification code + QR) through
-- an EFD/VFD for every sale. A seller registers their TIN (and VRN if
-- VAT-registered) with NEXORA; once an admin verifies that, every paid
-- order attributed to that seller gets a fiscal receipt submitted on
-- their behalf. A seller who hasn't registered/been verified simply
-- keeps getting NEXORA's existing (non-fiscal) receipt - see
-- efd.service.js's header comment for why this is opt-in per seller
-- rather than platform-wide.

ALTER TABLE seller_profiles
    ADD COLUMN tin VARCHAR(20) NULL AFTER address,
    ADD COLUMN vrn VARCHAR(20) NULL AFTER tin,
    ADD COLUMN efd_registered TINYINT(1) NOT NULL DEFAULT 0 AFTER vrn,
    ADD COLUMN efd_verified_at TIMESTAMP NULL AFTER efd_registered;

CREATE TABLE IF NOT EXISTS efd_receipts (
    id INT AUTO_INCREMENT PRIMARY KEY,

    order_id INT NOT NULL UNIQUE,
    seller_id INT NOT NULL,

    status ENUM('pending', 'issued', 'failed', 'not_applicable') NOT NULL DEFAULT 'pending',

    fiscal_receipt_number VARCHAR(50) NULL,
    verification_code VARCHAR(100) NULL,

    raw_response JSON NULL,
    error_message VARCHAR(500) NULL,

    submitted_at TIMESTAMP NULL,
    issued_at TIMESTAMP NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_efd_receipts_order
        FOREIGN KEY (order_id) REFERENCES orders(id)
        ON DELETE CASCADE,
    CONSTRAINT fk_efd_receipts_seller
        FOREIGN KEY (seller_id) REFERENCES users(id),

    INDEX idx_efd_receipts_seller (seller_id),
    INDEX idx_efd_receipts_status (status)
);
