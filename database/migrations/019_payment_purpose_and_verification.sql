-- Extends `payments` so it can represent seller verification fee payments,
-- not just order payments. Verification fees have no order_id, so order_id
-- becomes nullable and a `purpose` + `seller_id` pair identifies what the
-- payment is actually for. This lets the mobile money webhook route a
-- confirmation to the right place (order vs seller verification fee)
-- instead of the old code marking the fee "paid" the instant initiate()
-- returned, before the buyer/seller ever confirmed on their phone.

ALTER TABLE payments
    MODIFY order_id INT NULL,
    ADD COLUMN purpose ENUM('order_payment', 'seller_verification_fee') NOT NULL DEFAULT 'order_payment' AFTER order_id,
    ADD COLUMN seller_id INT NULL AFTER purpose;

ALTER TABLE payments
    ADD CONSTRAINT fk_payments_seller
        FOREIGN KEY (seller_id) REFERENCES users(id)
        ON DELETE CASCADE;

-- Only one pending/completed verification-fee payment per seller.
CREATE INDEX idx_payments_seller_purpose ON payments (seller_id, purpose, status);
