-- Payments Table
-- Run this in phpMyAdmin (SQL tab) on your NEXORA database.
-- Run after orders.sql (depends on the `orders` table).

CREATE TABLE IF NOT EXISTS payments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    order_id INT NOT NULL,

    method ENUM('mobile_money', 'cash_on_delivery') NOT NULL,
    status ENUM('pending', 'completed', 'failed') NOT NULL DEFAULT 'pending',

    amount DECIMAL(12, 2) NOT NULL,

    -- Reference returned by the mobile money provider (null for COD)
    transaction_reference VARCHAR(100) NULL,

    -- Our own human-readable receipt number, generated on completion
    receipt_number VARCHAR(30) NULL UNIQUE,

    paid_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_payments_order
        FOREIGN KEY (order_id) REFERENCES orders(id)
        ON DELETE CASCADE
);
