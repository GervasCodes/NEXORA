-- Store types classify the STORE itself (e.g. "Phone Store", "Supermarket"),
-- separate from product categories. Admin-managed, same pattern as categories.
-- Run after 003_create_seller_profiles.sql.

CREATE TABLE IF NOT EXISTS store_types (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(120) NOT NULL UNIQUE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO store_types (name, slug) VALUES
    ('Phone Store', 'phone-store'),
    ('Supermarket', 'supermarket'),
    ('Fashion & Clothing', 'fashion-clothing'),
    ('Electronics', 'electronics'),
    ('Grocery', 'grocery'),
    ('Pharmacy', 'pharmacy'),
    ('Hardware', 'hardware'),
    ('Beauty & Cosmetics', 'beauty-cosmetics'),
    ('Home & Furniture', 'home-furniture'),
    ('Other', 'other')
ON DUPLICATE KEY UPDATE name = VALUES(name);

ALTER TABLE seller_profiles
    ADD COLUMN store_type_id INT NULL AFTER store_description,
    ADD CONSTRAINT fk_seller_profiles_store_type
        FOREIGN KEY (store_type_id) REFERENCES store_types(id);
