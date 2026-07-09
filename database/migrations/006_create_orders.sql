-- Orders + Order Items Tables
-- Run this in phpMyAdmin (SQL tab) on your NEXORA database.
-- Assumes existing `users` and `products` tables with `id` primary keys.
-- Run this AFTER cart_items.sql (not a dependency, just keeping schema files in build order).

CREATE TABLE IF NOT EXISTS orders (
    id INT AUTO_INCREMENT PRIMARY KEY,
    order_number VARCHAR(30) NOT NULL UNIQUE,
    buyer_id INT NOT NULL,

    status ENUM('pending', 'processing', 'shipped', 'delivered', 'cancelled')
        NOT NULL DEFAULT 'pending',

    payment_status ENUM('unpaid', 'paid') NOT NULL DEFAULT 'unpaid',
    payment_method ENUM('mobile_money', 'cash_on_delivery') NOT NULL,

    shipping_address VARCHAR(255) NOT NULL,
    shipping_city VARCHAR(100) NOT NULL,
    shipping_region VARCHAR(100) NOT NULL,
    shipping_phone VARCHAR(30) NOT NULL,

    total_amount DECIMAL(12, 2) NOT NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_orders_buyer
        FOREIGN KEY (buyer_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS order_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    order_id INT NOT NULL,
    product_id INT NOT NULL,
    seller_id INT NOT NULL,

    quantity INT NOT NULL,
    unit_price DECIMAL(12, 2) NOT NULL,
    subtotal DECIMAL(12, 2) NOT NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_order_items_order
        FOREIGN KEY (order_id) REFERENCES orders(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_order_items_product
        FOREIGN KEY (product_id) REFERENCES products(id),

    CONSTRAINT fk_order_items_seller
        FOREIGN KEY (seller_id) REFERENCES users(id)
);
