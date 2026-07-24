-- Migration 050: seller_collections + seller_collection_products
-- Depends on: users (001), products (004)
-- Additive only. Phase 7C - Seller Collections.
--
-- Lets a seller group their own products into named shelves (e.g. "New
-- Arrivals", "Bestsellers") that render as their own horizontal row on
-- the store page, above the full catalog grid Phase 5C already built.
-- Two tables, same join-table shape `seller_delivery_agents` (013) already
-- uses for a seller's many-to-many relationship to something else they
-- own:
--
--   seller_collections         - the named shelf itself. `seller_id`
--                                 references `users(id)` directly (same
--                                 as `products.seller_id` and
--                                 `seller_delivery_agents.seller_id` -
--                                 there's no separate seller_profiles.id,
--                                 the user id doubles as the seller id
--                                 throughout this codebase).
--                                 `display_order` controls which shelf
--                                 shows first on the store page; a plain
--                                 integer set at creation time (append to
--                                 the end) rather than a full drag-and-
--                                 drop reorder UI, which this phase's
--                                 title doesn't ask for.
--
--   seller_collection_products - which products sit in which collection.
--                                 A product can appear in more than one
--                                 collection (e.g. a product that's both
--                                 "New Arrivals" and "Bestsellers"), and
--                                 the same product/collection pair can't
--                                 be added twice (unique key). Its own
--                                 `display_order` controls product order
--                                 within one shelf, same append-only
--                                 reasoning as above.
--
-- Deliberately NOT a `collection_id` column on `products` itself: that
-- would only allow one collection per product, which doesn't match how
-- sellers actually use shelves like this (the same item often belongs to
-- more than one).

CREATE TABLE IF NOT EXISTS seller_collections (
    id INT AUTO_INCREMENT PRIMARY KEY,
    seller_id INT NOT NULL,

    name VARCHAR(80) NOT NULL,
    display_order INT NOT NULL DEFAULT 0,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_seller_collections_seller
        FOREIGN KEY (seller_id) REFERENCES users(id)
        ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS seller_collection_products (
    id INT AUTO_INCREMENT PRIMARY KEY,
    collection_id INT NOT NULL,
    product_id INT NOT NULL,

    display_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    UNIQUE KEY unique_collection_product (collection_id, product_id),

    CONSTRAINT fk_seller_collection_products_collection
        FOREIGN KEY (collection_id) REFERENCES seller_collections(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_seller_collection_products_product
        FOREIGN KEY (product_id) REFERENCES products(id)
        ON DELETE CASCADE
);
