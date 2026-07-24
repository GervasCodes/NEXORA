-- Migration 044: product_videos
-- Depends on: products (004)
-- Additive only. Phase 6A - Product Videos.
--
-- Mirrors product_images (the existing photo gallery table) for a small
-- number of seller-uploaded product demo videos, but deliberately leaves
-- out is_primary: photos need a "cover" concept because one of them
-- fills the main product image slot, but videos get their own separate
-- "Product video" section on the product page (see ProductDetail.jsx),
-- so there's no single video that needs to be picked out from the rest.

CREATE TABLE IF NOT EXISTS product_videos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    product_id INT NOT NULL,

    video_url VARCHAR(500) NOT NULL,
    display_order INT NOT NULL DEFAULT 0,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_product_videos_product
        FOREIGN KEY (product_id) REFERENCES products(id)
        ON DELETE CASCADE
);
