-- Migration 095: Phase 2 continuation (UI/UX remediation) - product variants
-- Run after 094_product_qa_and_delivery_info.sql.
--
-- Additive by design: every existing product keeps working exactly as
-- today (single implicit SKU, products.stock/price as the source of
-- truth) when it has no rows in product_variants. A product only
-- "has variants" once a seller explicitly adds some, flagged by
-- products.has_variants so listing/PDP logic can branch on a cheap
-- boolean instead of a join/EXISTS check on every page load.

ALTER TABLE products
    ADD COLUMN has_variants TINYINT(1) NOT NULL DEFAULT 0 AFTER return_window_days;

-- The "axes" a product varies along (e.g. "Size", "Color"). Ordering is
-- seller-controlled (display_order) so the PDP selector shows Size
-- before Color if that's how the seller set it up, not alphabetically.
CREATE TABLE IF NOT EXISTS product_variant_options (
    id INT AUTO_INCREMENT PRIMARY KEY,
    product_id INT NOT NULL,
    name VARCHAR(60) NOT NULL,
    display_order INT NOT NULL DEFAULT 0,

    CONSTRAINT fk_pvo_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    INDEX idx_pvo_product (product_id)
);

-- The selectable values for one axis (e.g. Size -> "S", "M", "L").
CREATE TABLE IF NOT EXISTS product_variant_option_values (
    id INT AUTO_INCREMENT PRIMARY KEY,
    option_id INT NOT NULL,
    value VARCHAR(60) NOT NULL,
    display_order INT NOT NULL DEFAULT 0,

    CONSTRAINT fk_pvov_option FOREIGN KEY (option_id) REFERENCES product_variant_options(id) ON DELETE CASCADE,
    INDEX idx_pvov_option (option_id)
);

-- One row per actual purchasable combination (e.g. Size=M + Color=Red),
-- each with its own stock and an optional price adjustment relative to
-- the parent product's base price. `options` is a JSON snapshot of the
-- combination for display (e.g. {"Size":"M","Color":"Red"}) - the
-- option/value tables above exist to drive the seller's builder UI and
-- the buyer's selector, not to be joined against on every cart/order
-- read; `options_key` is a deterministic, sorted string form of the
-- same combination ("Color:Red|Size:M", computed in
-- product.service.js, not by MySQL) used only to enforce "no duplicate
-- combination per product" via the unique key below - MySQL has no
-- native unique constraint on JSON content.
CREATE TABLE IF NOT EXISTS product_variants (
    id INT AUTO_INCREMENT PRIMARY KEY,
    product_id INT NOT NULL,

    options JSON NOT NULL,
    options_key VARCHAR(255) NOT NULL,

    sku VARCHAR(60) NULL,
    price_delta DECIMAL(12, 2) NOT NULL DEFAULT 0,
    stock INT NOT NULL DEFAULT 0,
    image_url VARCHAR(500) NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_pv_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    CONSTRAINT uq_pv_product_combo UNIQUE (product_id, options_key)
);

-- cart_items/order_items: variant_id uses a 0 sentinel rather than NULL
-- for "no variant selected" (matching the plain-SKU behavior every
-- existing product keeps having), specifically so the existing
-- (user_id, product_id) uniqueness on cart_items can safely become
-- (user_id, product_id, variant_id) without MySQL's "NULL is never
-- equal to NULL" unique-index behavior silently allowing duplicate
-- cart rows for ordinary (non-variant) products.
ALTER TABLE cart_items
    ADD COLUMN variant_id INT NOT NULL DEFAULT 0 AFTER product_id,
    DROP INDEX unique_user_product,
    ADD UNIQUE KEY unique_user_product_variant (user_id, product_id, variant_id);

ALTER TABLE order_items
    ADD COLUMN variant_id INT NOT NULL DEFAULT 0 AFTER product_id,
    -- Snapshot of the purchased combination (e.g. "Size: M, Color: Red")
    -- so an order stays readable even if the seller later edits or
    -- deletes that variant - order_items intentionally has no FK to
    -- product_variants for the same reason orders already keep their
    -- own shipping_address snapshot instead of joining out to a mutable
    -- source of truth.
    ADD COLUMN variant_label VARCHAR(255) NULL AFTER variant_id;
