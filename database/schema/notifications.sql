-- Notifications Table
-- Run this in phpMyAdmin (SQL tab) on your NEXORA database.

CREATE TABLE IF NOT EXISTS notifications (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,

    type VARCHAR(50) NOT NULL,
    title VARCHAR(150) NOT NULL,
    message TEXT NOT NULL, -- see migrations/139_widen_notification_message.sql

    related_order_id INT NULL,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_notifications_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_notifications_order
        FOREIGN KEY (related_order_id) REFERENCES orders(id)
        ON DELETE SET NULL
);
