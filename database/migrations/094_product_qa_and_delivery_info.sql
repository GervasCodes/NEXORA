-- Migration 094: Phase 2 (UI/UX remediation) - Product detail page
-- Run after 093_buyer_addresses_and_coupons.sql.

-- Product Q&A - previously buyers could only reach a seller through
-- "Message seller", which is heavier-weight than a public question
-- other buyers could also benefit from seeing answered. Mirrors
-- migration 047's seller_reply design exactly: one editable answer per
-- question, no threaded replies, no separate answers table - see that
-- migration's comment for why a single nullable column is enough
-- ("No Social Features").
CREATE TABLE IF NOT EXISTS product_questions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    product_id INT NOT NULL,
    user_id INT NOT NULL,
    question TEXT NOT NULL,

    seller_answer TEXT NULL,
    seller_answer_at TIMESTAMP NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_product_questions_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    CONSTRAINT fk_product_questions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_product_questions_product (product_id, created_at)
);

-- Delivery estimate / return policy summary shown on the product page
-- itself (Phase 2, UI/UX remediation) - previously this only appeared
-- at checkout, after the buyer had already committed to buying.
-- Nullable and product-level (not store-level) since sellers may
-- reasonably want different shipping/return terms for different
-- products in the same store (e.g. made-to-order vs. in-stock items).
-- product.repository.js#findBySlug already selects `p.*`, so no
-- repository change is needed for these to reach the frontend - a
-- NULL value there means "seller hasn't set one", which the frontend
-- falls back to a generic platform default for rather than hiding the
-- line entirely.
ALTER TABLE products
    ADD COLUMN ships_within_days INT NULL AFTER stock,
    ADD COLUMN return_window_days INT NULL AFTER ships_within_days;
