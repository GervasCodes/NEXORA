-- Migration 004: products, product_images
-- Depends on: users (seller_id), categories, seller_profiles
-- Reconstructed from product.repository.js and admin_columns.sql (is_active).
-- category_id is a real foreign key here (categories is created before this
-- migration runs, unlike in the old loose schema/categories.sql note).

CREATE TABLE IF NOT EXISTS products (
    id INT AUTO_INCREMENT PRIMARY KEY,
    seller_id INT NOT NULL,
    category_id INT NULL,

    name VARCHAR(200) NOT NULL,
    slug VARCHAR(220) NOT NULL UNIQUE,
    description VARCHAR(2000) NULL,

    price DECIMAL(12, 2) NOT NULL,
    discount_price DECIMAL(12, 2) NULL,
    stock INT NOT NULL DEFAULT 0,

    brand VARCHAR(100) NULL,
    product_condition ENUM('new', 'used') NOT NULL DEFAULT 'new',

    -- Lets admins/sellers remove a product from the catalog without
    -- hard-deleting it (would orphan order_items/reviews)
    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_products_seller
        FOREIGN KEY (seller_id) REFERENCES users(id),

    CONSTRAINT fk_products_category
        FOREIGN KEY (category_id) REFERENCES categories(id)
        ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS product_images (
    id INT AUTO_INCREMENT PRIMARY KEY,
    product_id INT NOT NULL,

    image_url VARCHAR(500) NOT NULL,
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    display_order INT NOT NULL DEFAULT 0,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_product_images_product
        FOREIGN KEY (product_id) REFERENCES products(id)
        ON DELETE CASCADE
);
