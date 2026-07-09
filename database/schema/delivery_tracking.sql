-- Migration 015: live delivery tracking
-- Adds the columns and table needed for Bolt-style nearest-agent matching.
-- Run after 013_seller_delivery_agents.sql.

-- Agents broadcast their position while on shift. NULL lat/lng or
-- is_online = FALSE means "not eligible for matching".
ALTER TABLE users
    ADD COLUMN current_lat DECIMAL(10, 7) NULL AFTER role,
    ADD COLUMN current_lng DECIMAL(10, 7) NULL AFTER current_lat,
    ADD COLUMN location_updated_at TIMESTAMP NULL AFTER current_lng,
    ADD COLUMN is_online BOOLEAN NOT NULL DEFAULT FALSE AFTER location_updated_at;

-- Destination point for an order. Populated at checkout (map pin or
-- geocoded from the address). NULL means this order can't be
-- auto-matched yet and falls back to the manual pickup pool.
ALTER TABLE orders
    ADD COLUMN delivery_lat DECIMAL(10, 7) NULL AFTER shipping_phone,
    ADD COLUMN delivery_lng DECIMAL(10, 7) NULL AFTER delivery_lat;

-- One row per agent an order was offered to, in nearest-first order.
-- This is what lets us do "offer to nearest, wait, fall through to next"
-- instead of the old open free-for-all claim pool.
CREATE TABLE IF NOT EXISTS delivery_offers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    order_id INT NOT NULL,
    agent_id INT NOT NULL,

    status ENUM('offered', 'accepted', 'declined', 'expired')
        NOT NULL DEFAULT 'offered',

    distance_km DECIMAL(6, 2) NOT NULL,

    offered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    responded_at TIMESTAMP NULL,
    expires_at TIMESTAMP NOT NULL,

    UNIQUE KEY unique_order_agent (order_id, agent_id),

    CONSTRAINT fk_delivery_offers_order
        FOREIGN KEY (order_id) REFERENCES orders(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_delivery_offers_agent
        FOREIGN KEY (agent_id) REFERENCES users(id)
        ON DELETE CASCADE
);
