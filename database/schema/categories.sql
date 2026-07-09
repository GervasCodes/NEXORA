-- Categories Table
-- Run this in phpMyAdmin (SQL tab) on your NEXORA database.
-- Products already reference category_id, but this table never existed yet.
-- Run this BEFORE adding a foreign key from products to categories (see note below).

CREATE TABLE IF NOT EXISTS categories (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    slug VARCHAR(120) NOT NULL UNIQUE,
    description VARCHAR(255) NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Optional but recommended: add a real foreign key now that categories exists.
-- Only run this if your existing `products.category_id` values are already
-- valid category ids (or the table is still empty) - otherwise it will fail.
-- ALTER TABLE products
--     ADD CONSTRAINT fk_products_category
--     FOREIGN KEY (category_id) REFERENCES categories(id);
