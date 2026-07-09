-- Migration 003: seller_profiles
-- Depends on: users
-- Reconstructed from seller.repository.js (create/update/updateLogo/updateBanner)
-- and admin_columns.sql (is_verified).

CREATE TABLE IF NOT EXISTS seller_profiles (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL UNIQUE,

    store_name VARCHAR(150) NOT NULL,
    store_slug VARCHAR(170) NOT NULL UNIQUE,
    store_description VARCHAR(500) NULL,

    store_logo VARCHAR(500) NULL,
    store_banner VARCHAR(500) NULL,

    business_email VARCHAR(150) NULL,
    business_phone VARCHAR(30) NULL,

    country VARCHAR(100) NULL,
    region VARCHAR(100) NULL,
    city VARCHAR(100) NULL,
    address VARCHAR(255) NULL,

    -- Only verified sellers can publish products (SRS 2.2 / 4.2)
    is_verified BOOLEAN NOT NULL DEFAULT FALSE,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_seller_profiles_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE
);
