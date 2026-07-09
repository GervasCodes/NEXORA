-- Reviews Table
-- Run this in phpMyAdmin (SQL tab) on your NEXORA database.
-- Run after orders.sql (depends on `users`, `products`, `order_items`).

CREATE TABLE IF NOT EXISTS reviews (
    id INT AUTO_INCREMENT PRIMARY KEY,
    product_id INT NOT NULL,
    buyer_id INT NOT NULL,

    rating TINYINT NOT NULL,
    comment VARCHAR(1000) NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    -- One review per buyer per product (can be edited, not duplicated)
    UNIQUE KEY unique_buyer_product (buyer_id, product_id),

    CONSTRAINT chk_reviews_rating CHECK (rating BETWEEN 1 AND 5),

    CONSTRAINT fk_reviews_product
        FOREIGN KEY (product_id) REFERENCES products(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_reviews_buyer
        FOREIGN KEY (buyer_id) REFERENCES users(id)
);
