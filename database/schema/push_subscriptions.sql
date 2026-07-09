-- Migration 016: push subscriptions
-- Stores browser Web Push subscriptions so we can wake a delivery agent
-- whose app/tab is closed when they're offered a nearby order.
-- Run after 015_delivery_tracking.sql.

CREATE TABLE IF NOT EXISTS push_subscriptions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,

    endpoint VARCHAR(500) NOT NULL,
    p256dh VARCHAR(255) NOT NULL,
    auth VARCHAR(255) NOT NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- One row per device/browser subscription. Same endpoint re-subscribing
    -- (e.g. permission re-granted) just updates keys instead of duplicating.
    UNIQUE KEY unique_endpoint (endpoint(255)),

    CONSTRAINT fk_push_subscriptions_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE
);
