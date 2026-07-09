-- Deliveries Table
-- Run this in phpMyAdmin (SQL tab) on your NEXORA database.
-- Run after orders.sql (depends on the `orders` and `users` tables).
-- Delivery agents are just users with role = 'delivery_agent', so agent_id
-- references the same `users` table rather than a separate agents table.
--
-- Design: a delivery row is only created the moment an agent claims a
-- shipped order (see delivery.repository.js), so there is no "pending"
-- state here — a row existing means it's already assigned to an agent.

CREATE TABLE IF NOT EXISTS deliveries (
    id INT AUTO_INCREMENT PRIMARY KEY,
    order_id INT NOT NULL UNIQUE,
    agent_id INT NOT NULL,

    status ENUM('assigned', 'picked_up', 'in_transit', 'delivered', 'failed')
        NOT NULL DEFAULT 'assigned',

    notes VARCHAR(255) NULL,

    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    delivered_at TIMESTAMP NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_deliveries_order
        FOREIGN KEY (order_id) REFERENCES orders(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_deliveries_agent
        FOREIGN KEY (agent_id) REFERENCES users(id)
);
