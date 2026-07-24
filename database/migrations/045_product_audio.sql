-- Migration 045: product_audio
-- Depends on: products (004)
-- Additive only. Phase 6B - Product Audio.
--
-- Same shape and reasoning as product_videos (044): a small,
-- seller-uploaded set of audio clips per product (e.g. a spoken
-- description, an instrument demo, a sound sample), listed in their own
-- section on the product page rather than having one picked out as a
-- "cover" - so no is_primary here either.

CREATE TABLE IF NOT EXISTS product_audio (
    id INT AUTO_INCREMENT PRIMARY KEY,
    product_id INT NOT NULL,

    audio_url VARCHAR(500) NOT NULL,
    display_order INT NOT NULL DEFAULT 0,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_product_audio_product
        FOREIGN KEY (product_id) REFERENCES products(id)
        ON DELETE CASCADE
);
