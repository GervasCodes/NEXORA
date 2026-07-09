-- Migration 001: users
-- Base table. Everything else (seller_profiles, products, orders, etc.)
-- has a foreign key back to this table, so it must run first.
-- Reconstructed from column usage in auth.repository.js, auth.service.js,
-- login.service.js, and admin_columns.sql (is_active added here directly
-- instead of as a later ALTER, since this is a fresh migration).

CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,

    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    phone VARCHAR(30) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,

    role ENUM('buyer', 'seller', 'admin', 'delivery_agent')
        NOT NULL DEFAULT 'buyer',

    -- Lets admins deactivate an account without deleting order history
    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
