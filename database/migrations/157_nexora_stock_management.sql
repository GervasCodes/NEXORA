-- Migration 157: Nexora Stock Management - foundation (Phase 6).
-- Run after 156_product_media.sql.
--
--  stock_items      One row per thing a seller keeps stock of.
--                     source = 'nexora'   -> the item is a marketplace listing
--                                            (product_id, and variant_id for a
--                                            product with variants). The live
--                                            stock number stays on products /
--                                            product_variants, because checkout
--                                            reads and locks it there; stock_items
--                                            only adds the inventory metadata
--                                            (cost, barcode, unit, reorder level).
--                     source = 'external' -> sold outside Nexora. The stock number
--                                            lives on stock_items.stock.
--                   link_key ('<product_id>-<variant_id or 0>') is unique, so one
--                   listing can never have two items. legacy_product_id points at the
--                   hidden "tools-only" product row (migration 146) an external item
--                   was migrated from, so offline_sales (which references that
--                   product) stays readable and the classic POS screens keep working.
--  stock_movements  The ledger. Extends stock_adjustments (migration 144): every
--                   change to a stock number - manual, order deduct/restore, sale,
--                   return, void, correction, opening - is one row with the stock
--                   before/after, a signed quantity, a reference (ref_type/ref_id),
--                   the unit cost and who did it. payload_hash lets an idempotency
--                   key be checked against the request body, not just the key.
--  stock_adjustments.payload_hash  Same idempotency check for the classic POS path.
--
-- Every existing listing (and every tools-only hidden product) gets an item, and an
-- 'opening' movement carrying the stock it had when this migration ran, so the
-- ledger adds up to the current stock from day one. History before today stays in
-- stock_adjustments / offline_sales, which remain readable.
--
-- Low-stock threshold: one per-item reorder_level (default from the platform setting
-- stock_default_reorder_level = 5) replaces the old 3 (dashboard) vs 5 (POS) split.
--
-- Safe to re-run: tables are IF NOT EXISTS, the column is added only when missing,
-- and every backfill is guarded (INSERT IGNORE on the unique keys / NOT EXISTS).
-- The dynamic ALTER string uses single quotes only (ANSI_QUOTES safe).

CREATE TABLE IF NOT EXISTS stock_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    seller_id INT NOT NULL,
    product_id INT NULL,
    variant_id INT NULL,
    link_key VARCHAR(40) NULL,
    legacy_product_id INT NULL,
    source ENUM('nexora', 'external') NOT NULL DEFAULT 'external',
    name VARCHAR(200) NOT NULL,
    sku VARCHAR(64) NULL,
    barcode VARCHAR(64) NULL,
    unit VARCHAR(20) NOT NULL DEFAULT 'pcs',
    cost_price DECIMAL(12, 2) NULL,
    sell_price DECIMAL(12, 2) NOT NULL DEFAULT 0,
    reorder_level INT NOT NULL DEFAULT 5,
    stock INT NOT NULL DEFAULT 0,
    is_archived TINYINT(1) NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_stock_items_seller FOREIGN KEY (seller_id) REFERENCES users(id),
    CONSTRAINT fk_stock_items_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL,
    CONSTRAINT fk_stock_items_variant FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE SET NULL,
    UNIQUE KEY uq_stock_items_link (link_key),
    UNIQUE KEY uq_stock_items_legacy (legacy_product_id),
    UNIQUE KEY uq_stock_items_barcode (seller_id, barcode),
    INDEX idx_stock_items_seller (seller_id, is_archived, name),
    INDEX idx_stock_items_sku (seller_id, sku),
    INDEX idx_stock_items_product (product_id)
);

CREATE TABLE IF NOT EXISTS stock_movements (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    seller_id INT NOT NULL,
    stock_item_id INT NOT NULL,
    type ENUM('purchase', 'sale', 'order_deduct', 'order_restore', 'return', 'void', 'correction', 'opening') NOT NULL,
    quantity_change INT NOT NULL,
    stock_before INT NOT NULL,
    stock_after INT NOT NULL,
    unit_cost DECIMAL(12, 2) NULL,
    ref_type VARCHAR(30) NULL,
    ref_id BIGINT NULL,
    reason VARCHAR(255) NULL,
    idempotency_key VARCHAR(64) NULL,
    payload_hash CHAR(64) NULL,
    created_by INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_stock_movements_seller FOREIGN KEY (seller_id) REFERENCES users(id),
    CONSTRAINT fk_stock_movements_item FOREIGN KEY (stock_item_id) REFERENCES stock_items(id),
    UNIQUE KEY uq_stock_movements_idem (seller_id, idempotency_key),
    INDEX idx_stock_movements_item (stock_item_id, created_at),
    INDEX idx_stock_movements_seller (seller_id, created_at),
    INDEX idx_stock_movements_ref (ref_type, ref_id)
);

SET @sql = IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'stock_adjustments'
          AND COLUMN_NAME = 'payload_hash') = 0,
    'ALTER TABLE stock_adjustments ADD COLUMN payload_hash CHAR(64) NULL',
    'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

INSERT INTO platform_settings (setting_key, setting_value) VALUES
    ('stock_default_reorder_level', '5')
ON DUPLICATE KEY UPDATE setting_key = setting_key;

-- Backfill 1: tools-only hidden products become EXTERNAL items. The stock number
-- moves onto the item; the product row stays (offline_sales points at it).
INSERT IGNORE INTO stock_items
    (seller_id, product_id, variant_id, link_key, legacy_product_id, source, name, sell_price, reorder_level, stock)
SELECT p.seller_id, NULL, NULL, NULL, p.id, 'external', p.name, p.price, 5, p.stock
FROM products p
JOIN users u ON u.id = p.seller_id
WHERE u.seller_mode = 'business_tools' AND p.is_draft = 0;

-- Backfill 2: every marketplace listing without variants.
INSERT IGNORE INTO stock_items
    (seller_id, product_id, variant_id, link_key, source, name, sell_price, reorder_level, stock)
SELECT p.seller_id, p.id, NULL, CONCAT(p.id, '-0'), 'nexora', p.name, p.price, 5, 0
FROM products p
JOIN users u ON u.id = p.seller_id
WHERE p.is_draft = 0 AND p.has_variants = 0 AND u.seller_mode <> 'business_tools';

-- Backfill 3: every active variant of a listing with variants.
INSERT IGNORE INTO stock_items
    (seller_id, product_id, variant_id, link_key, source, name, sku, sell_price, reorder_level, stock)
SELECT p.seller_id, p.id, v.id, CONCAT(p.id, '-', v.id), 'nexora', p.name, LEFT(v.sku, 64),
       p.price + COALESCE(v.price_delta, 0), 5, 0
FROM products p
JOIN product_variants v ON v.product_id = p.id AND v.is_active = 1
JOIN users u ON u.id = p.seller_id
WHERE p.is_draft = 0 AND p.has_variants = 1 AND u.seller_mode <> 'business_tools';

-- Backfill 4: the opening balance, so the ledger reconciles from day one.
-- The live number is the variant's, else the product's, else the item's own.
INSERT INTO stock_movements
    (seller_id, stock_item_id, type, quantity_change, stock_before, stock_after, ref_type, reason)
SELECT si.seller_id, si.id, 'opening', COALESCE(v.stock, p.stock, si.stock), 0,
       COALESCE(v.stock, p.stock, si.stock), 'migration',
       'Opening balance when Nexora Stock Management started'
FROM stock_items si
LEFT JOIN products p ON p.id = si.product_id
LEFT JOIN product_variants v ON v.id = si.variant_id
WHERE COALESCE(v.stock, p.stock, si.stock) > 0
  AND NOT EXISTS (SELECT 1 FROM stock_movements m WHERE m.stock_item_id = si.id);
