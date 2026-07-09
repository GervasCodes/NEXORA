-- Lets a seller choose between the platform's open delivery pool and their
-- own hired delivery staff (who must still hold a delivery_agent account).
-- Run this in phpMyAdmin (SQL tab), after 011_create_chat.sql.

ALTER TABLE orders
    ADD COLUMN delivery_mode ENUM('platform', 'own') NOT NULL DEFAULT 'platform' AFTER status;

CREATE TABLE IF NOT EXISTS seller_delivery_agents (
    id INT AUTO_INCREMENT PRIMARY KEY,
    seller_id INT NOT NULL,
    agent_id INT NOT NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    UNIQUE KEY unique_seller_agent (seller_id, agent_id),

    CONSTRAINT fk_seller_delivery_agents_seller
        FOREIGN KEY (seller_id) REFERENCES users(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_seller_delivery_agents_agent
        FOREIGN KEY (agent_id) REFERENCES users(id)
        ON DELETE CASCADE
);
