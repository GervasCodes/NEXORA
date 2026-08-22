-- Migration 087: Phase Q5 - Logistics
-- Run after 086_efd_einvoicing.sql.
--
-- Agent/kiosk pickup points: an admin-managed network of physical
-- locations a buyer can choose as their delivery destination instead of
-- their home address. Mechanically this changes almost nothing about
-- the existing delivery flow (an agent still picks up from the seller
-- and marks assigned -> picked_up -> in_transit -> delivered, see
-- delivery.service.js) - only WHERE "delivered" means physically ends
-- up changes, from the buyer's home to the pickup point's address. The
-- buyer's own final collection is confirmed through the existing
-- buyer-confirms-receipt flow (payment.controller.js's confirmReceipt),
-- reused rather than duplicated.

CREATE TABLE IF NOT EXISTS pickup_points (
    id INT AUTO_INCREMENT PRIMARY KEY,

    name VARCHAR(150) NOT NULL,
    address VARCHAR(255) NOT NULL,
    city VARCHAR(100) NOT NULL,
    region VARCHAR(100) NOT NULL,
    latitude DECIMAL(10, 7) NULL,
    longitude DECIMAL(10, 7) NULL,

    contact_phone VARCHAR(30) NULL,
    operating_hours VARCHAR(150) NULL,

    is_active TINYINT(1) NOT NULL DEFAULT 1,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    INDEX idx_pickup_points_region (region, city),
    INDEX idx_pickup_points_active (is_active)
);

ALTER TABLE orders
    ADD COLUMN pickup_point_id INT NULL AFTER shipping_phone,
    ADD CONSTRAINT fk_orders_pickup_point
        FOREIGN KEY (pickup_point_id) REFERENCES pickup_points(id);
