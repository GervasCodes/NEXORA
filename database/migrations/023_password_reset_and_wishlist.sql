-- Adds a third OTP purpose for "forgot password" (distinct from
-- "password_change", which requires already being logged in - this one
-- doesn't). Same otp_codes table/mechanism, just a new purpose value.
ALTER TABLE otp_codes
    MODIFY purpose ENUM('login', 'password_change', 'password_reset') NOT NULL;

-- "Save for later" / wishlist. One row per (buyer, product); re-saving an
-- already-saved product is a no-op via the UNIQUE constraint rather than
-- an error, so the frontend heart-toggle can fire-and-forget.
CREATE TABLE IF NOT EXISTS wishlist_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    product_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_wishlist_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_wishlist_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    CONSTRAINT uq_wishlist_user_product UNIQUE (user_id, product_id)
);

-- seller_profiles.is_verified is now surfaced on the public product
-- listing (for the "Verified Seller" badge on product cards) - it
-- already has an index via being joined constantly, no new index needed
-- here, just noting the new read path for context.
