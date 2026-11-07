-- Migration 128: affiliate payout requests (Phase 6, item 8).
--
-- A payout request moves money out of the affiliate's buyer wallet into a
-- 'requested' row, in the same transaction that debits the wallet. An admin
-- then either marks it 'paid' with the transfer reference, or 'rejected',
-- which credits the amount back to the wallet. Both moves are conditional
-- on the current status, so a double click cannot pay or refund twice.
--
-- Additive only. CREATE TABLE IF NOT EXISTS makes it safe to re-run.

CREATE TABLE IF NOT EXISTS affiliate_payouts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    affiliate_user_id INT NOT NULL,
    amount DECIMAL(12, 2) NOT NULL,
    payout_method ENUM('mobile_money', 'bank') NOT NULL,
    payout_destination VARCHAR(255) NOT NULL,
    status ENUM('requested', 'paid', 'rejected') NOT NULL DEFAULT 'requested',
    payout_reference VARCHAR(120) NULL,
    admin_note VARCHAR(500) NULL,
    requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP NULL,
    CONSTRAINT fk_affiliate_payouts_user
        FOREIGN KEY (affiliate_user_id) REFERENCES users(id)
        ON DELETE CASCADE,
    INDEX idx_affiliate_payouts_user_status (affiliate_user_id, status),
    INDEX idx_affiliate_payouts_status (status, requested_at)
);
