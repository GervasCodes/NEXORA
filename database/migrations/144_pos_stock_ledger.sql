-- Migration 144: Seller POS foundation - stock-adjustment ledger and
-- off-platform (manual) sales.
-- Run after 143_retire_department_sponsorship.sql.
--
-- stock_adjustments is an append-only ledger of every MANUAL stock
-- movement a seller makes (restock, stock-count correction, off-platform
-- sale). It is deliberately separate from products.is_active: "is this
-- listing live" and "how many units are on the shelf" are different
-- questions. Stock deductions caused by Nexora orders are NOT copied
-- here - they stay derivable from orders/order_items, so the ledger never
-- has a second, divergent copy of platform stock movements.
--
-- stock_before/stock_after are snapshots taken under the row lock that
-- applied the change, so the ledger is self-checking. quantity_change is
-- signed (negative for sales). variant_id is set only for products with
-- variants (stock then lives on product_variants, not products).
--
-- idempotency_key makes a retried/double-submitted request a no-op: the
-- unique (seller_id, idempotency_key) pair means the second insert fails
-- and the service returns the first result instead of moving stock twice.
-- NULL keys are allowed and never collide (MySQL treats NULLs as distinct).
CREATE TABLE IF NOT EXISTS offline_sales (
    id INT AUTO_INCREMENT PRIMARY KEY,
    seller_id INT NOT NULL,
    product_id INT NOT NULL,
    variant_id INT NULL,

    -- Snapshots so the record stays readable if the product is renamed.
    product_name VARCHAR(200) NOT NULL,
    variant_label VARCHAR(255) NULL,

    quantity INT NOT NULL,
    unit_price DECIMAL(12, 2) NOT NULL,
    total_amount DECIMAL(12, 2) NOT NULL,
    payment_method ENUM('cash', 'mobile_money', 'card', 'bank_transfer', 'other') NOT NULL DEFAULT 'cash',
    customer_name VARCHAR(120) NULL,
    note VARCHAR(255) NULL,
    sold_at DATETIME NOT NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_offline_sales_seller FOREIGN KEY (seller_id) REFERENCES users(id),
    CONSTRAINT fk_offline_sales_product FOREIGN KEY (product_id) REFERENCES products(id),
    CONSTRAINT fk_offline_sales_variant FOREIGN KEY (variant_id) REFERENCES product_variants(id),
    CONSTRAINT chk_offline_sales_quantity CHECK (quantity > 0),
    INDEX idx_offline_sales_seller_sold (seller_id, sold_at),
    INDEX idx_offline_sales_product (product_id)
);

CREATE TABLE IF NOT EXISTS stock_adjustments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    seller_id INT NOT NULL,
    product_id INT NOT NULL,
    variant_id INT NULL,

    type ENUM('restock', 'correction', 'offline_sale') NOT NULL,
    quantity_change INT NOT NULL,
    stock_before INT NOT NULL,
    stock_after INT NOT NULL,
    reason VARCHAR(255) NULL,

    offline_sale_id INT NULL,
    idempotency_key VARCHAR(64) NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_stock_adjustments_seller FOREIGN KEY (seller_id) REFERENCES users(id),
    CONSTRAINT fk_stock_adjustments_product FOREIGN KEY (product_id) REFERENCES products(id),
    CONSTRAINT fk_stock_adjustments_variant FOREIGN KEY (variant_id) REFERENCES product_variants(id),
    CONSTRAINT fk_stock_adjustments_sale FOREIGN KEY (offline_sale_id) REFERENCES offline_sales(id),
    CONSTRAINT chk_stock_adjustments_after CHECK (stock_after >= 0),
    UNIQUE KEY uq_stock_adjustments_idem (seller_id, idempotency_key),
    INDEX idx_stock_adjustments_seller_created (seller_id, created_at),
    INDEX idx_stock_adjustments_product (product_id, created_at)
);
