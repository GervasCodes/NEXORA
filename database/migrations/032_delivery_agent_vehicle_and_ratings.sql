-- Migration 032: delivery agent vehicle details + post-delivery ratings
-- Run after 031_order_splitting.sql.
--
-- Part 1: vehicle_type / vehicle_plate_number on users. Delivery agents
-- are just users with role = 'delivery_agent' (see deliveries.sql), so
-- these live on the same `users` table as current_lat/current_lng/
-- is_online (migration 015) rather than a separate agent-profile table.
-- NULL for every non-agent role, and NULL for agents registered before
-- this migration until they update their profile.
--
-- Part 2: delivery_ratings. One rating per delivered order, left by the
-- buyer for the agent who delivered it - same one-rating-per-subject
-- shape as `reviews` (migration 009) uses for products, just keyed by
-- order instead of (buyer, product).

ALTER TABLE users
    ADD COLUMN vehicle_type ENUM('bicycle', 'motorcycle', 'tuktuk', 'car', 'van', 'truck') NULL,
    ADD COLUMN vehicle_plate_number VARCHAR(20) NULL;

CREATE TABLE IF NOT EXISTS delivery_ratings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    order_id INT NOT NULL UNIQUE,
    agent_id INT NOT NULL,
    buyer_id INT NOT NULL,

    rating TINYINT NOT NULL,
    comment VARCHAR(500) NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT chk_delivery_ratings_rating CHECK (rating BETWEEN 1 AND 5),

    CONSTRAINT fk_delivery_ratings_order
        FOREIGN KEY (order_id) REFERENCES orders(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_delivery_ratings_agent
        FOREIGN KEY (agent_id) REFERENCES users(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_delivery_ratings_buyer
        FOREIGN KEY (buyer_id) REFERENCES users(id)
);

CREATE INDEX idx_delivery_ratings_agent ON delivery_ratings(agent_id);
