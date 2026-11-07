-- Migration 158: Nexora Stock Management - sales, purchases, customers (Phase 7).
-- Run after 157_nexora_stock_management.sql.
--
--  stock_counters       Per-seller running numbers (receipt numbers). One row per
--                       (seller, kind); the service bumps it with
--                       LAST_INSERT_ID(counter_value + 1) inside the sale transaction,
--                       so two tills never get the same receipt number.
--  stock_customers      A seller's own customers. Never shared between sellers.
--  stock_suppliers      A seller's own suppliers (wasambazaji).
--  sales / sale_lines   One receipt = one sale with one or more lines. Lines snapshot
--                       name, price and COST at the time of sale, so reports stay true
--                       when prices change later. Amounts:
--                         total_amount    = subtotal - discount_amount
--                         returned_amount = value of goods taken back (net of discount)
--                         paid_amount     = money kept (reduced when a return is refunded)
--                         balance owed    = total - returned - paid   (never stored)
--                       voided_at marks a cancelled sale; its stock is put back by 'void'
--                       ledger rows and it drops out of every total and debt.
--                       source = 'legacy' rows were copied from offline_sales (below).
--  sale_returns(+lines) Goods taken back from a sale (partly or fully), with the stock
--                       restored by 'return' ledger rows.
--  stock_payments       Every money movement the stock screens make: money in from a
--                       sale or a customer paying a debt, money out for a refund or a
--                       supplier payment. Phase 8 reports (daily close, cash) read it.
--  suppliers/purchases  A purchase (manunuzi) records what was bought, from whom, at what
--  purchase_lines       unit cost, and how much is paid. Receiving it adds stock and moves
--                       the item's cost price (moving weighted average, see
--                       docs/DATABASE.md).
--
-- Legacy backfill: every row of offline_sales (the old sales screen) becomes a 'legacy'
-- sale with one line and one cash-in payment, so history shows in one list. offline_sales
-- itself is left untouched and stays readable.
--
-- Safe to re-run: tables are IF NOT EXISTS; the setting uses ON DUPLICATE KEY; every
-- backfill is guarded by a unique key or NOT EXISTS. No ALTER statements are needed.

CREATE TABLE IF NOT EXISTS stock_counters (
    seller_id INT NOT NULL,
    kind VARCHAR(20) NOT NULL,
    counter_value INT NOT NULL DEFAULT 0,
    PRIMARY KEY (seller_id, kind),
    CONSTRAINT fk_stock_counters_seller FOREIGN KEY (seller_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS stock_customers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    seller_id INT NOT NULL,
    name VARCHAR(120) NOT NULL,
    phone VARCHAR(30) NULL,
    note VARCHAR(255) NULL,
    is_archived TINYINT(1) NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_stock_customers_seller FOREIGN KEY (seller_id) REFERENCES users(id),
    UNIQUE KEY uq_stock_customers_phone (seller_id, phone),
    INDEX idx_stock_customers_seller (seller_id, is_archived, name)
);

CREATE TABLE IF NOT EXISTS stock_suppliers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    seller_id INT NOT NULL,
    name VARCHAR(120) NOT NULL,
    phone VARCHAR(30) NULL,
    note VARCHAR(255) NULL,
    is_archived TINYINT(1) NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_stock_suppliers_seller FOREIGN KEY (seller_id) REFERENCES users(id),
    UNIQUE KEY uq_stock_suppliers_phone (seller_id, phone),
    INDEX idx_stock_suppliers_seller (seller_id, is_archived, name)
);

CREATE TABLE IF NOT EXISTS sales (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    seller_id INT NOT NULL,
    receipt_no VARCHAR(20) NOT NULL,
    source ENUM('pos', 'legacy') NOT NULL DEFAULT 'pos',
    customer_id INT NULL,
    customer_name VARCHAR(120) NULL,
    currency CHAR(3) NOT NULL DEFAULT 'TZS',
    subtotal DECIMAL(14, 2) NOT NULL,
    discount_amount DECIMAL(14, 2) NOT NULL DEFAULT 0,
    total_amount DECIMAL(14, 2) NOT NULL,
    paid_amount DECIMAL(14, 2) NOT NULL DEFAULT 0,
    returned_amount DECIMAL(14, 2) NOT NULL DEFAULT 0,
    payment_method ENUM('cash', 'mobile_money', 'card', 'bank_transfer', 'credit', 'other') NOT NULL DEFAULT 'cash',
    note VARCHAR(255) NULL,
    sold_at DATETIME NOT NULL,
    is_backdated TINYINT(1) NOT NULL DEFAULT 0,
    voided_at DATETIME NULL,
    voided_by INT NULL,
    void_reason VARCHAR(255) NULL,
    legacy_offline_sale_id INT NULL,
    idempotency_key VARCHAR(64) NULL,
    payload_hash CHAR(64) NULL,
    created_by INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_sales_seller FOREIGN KEY (seller_id) REFERENCES users(id),
    CONSTRAINT fk_sales_customer FOREIGN KEY (customer_id) REFERENCES stock_customers(id) ON DELETE SET NULL,
    UNIQUE KEY uq_sales_receipt (seller_id, receipt_no),
    UNIQUE KEY uq_sales_idem (seller_id, idempotency_key),
    UNIQUE KEY uq_sales_legacy (legacy_offline_sale_id),
    INDEX idx_sales_seller_sold (seller_id, sold_at),
    INDEX idx_sales_customer (seller_id, customer_id, voided_at)
);

CREATE TABLE IF NOT EXISTS sale_lines (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    sale_id BIGINT NOT NULL,
    seller_id INT NOT NULL,
    stock_item_id INT NULL,
    item_name VARCHAR(200) NOT NULL,
    variant_label VARCHAR(255) NULL,
    item_source ENUM('nexora', 'external') NOT NULL DEFAULT 'external',
    quantity INT NOT NULL,
    returned_quantity INT NOT NULL DEFAULT 0,
    unit_price DECIMAL(12, 2) NOT NULL,
    unit_cost DECIMAL(12, 2) NULL,
    line_total DECIMAL(14, 2) NOT NULL,
    CONSTRAINT fk_sale_lines_sale FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE,
    CONSTRAINT fk_sale_lines_item FOREIGN KEY (stock_item_id) REFERENCES stock_items(id) ON DELETE SET NULL,
    CONSTRAINT chk_sale_lines_quantity CHECK (quantity > 0),
    INDEX idx_sale_lines_sale (sale_id),
    INDEX idx_sale_lines_item (stock_item_id),
    INDEX idx_sale_lines_seller (seller_id)
);

CREATE TABLE IF NOT EXISTS sale_returns (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    seller_id INT NOT NULL,
    sale_id BIGINT NOT NULL,
    return_amount DECIMAL(14, 2) NOT NULL,
    refund_amount DECIMAL(14, 2) NOT NULL DEFAULT 0,
    credit_amount DECIMAL(14, 2) NOT NULL DEFAULT 0,
    reason VARCHAR(255) NULL,
    idempotency_key VARCHAR(64) NULL,
    payload_hash CHAR(64) NULL,
    created_by INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_sale_returns_seller FOREIGN KEY (seller_id) REFERENCES users(id),
    CONSTRAINT fk_sale_returns_sale FOREIGN KEY (sale_id) REFERENCES sales(id),
    UNIQUE KEY uq_sale_returns_idem (seller_id, idempotency_key),
    INDEX idx_sale_returns_sale (sale_id)
);

CREATE TABLE IF NOT EXISTS sale_return_lines (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    return_id BIGINT NOT NULL,
    sale_line_id BIGINT NOT NULL,
    quantity INT NOT NULL,
    amount DECIMAL(14, 2) NOT NULL,
    CONSTRAINT fk_sale_return_lines_return FOREIGN KEY (return_id) REFERENCES sale_returns(id) ON DELETE CASCADE,
    CONSTRAINT fk_sale_return_lines_line FOREIGN KEY (sale_line_id) REFERENCES sale_lines(id),
    CONSTRAINT chk_sale_return_lines_quantity CHECK (quantity > 0),
    INDEX idx_sale_return_lines_return (return_id)
);

CREATE TABLE IF NOT EXISTS purchases (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    seller_id INT NOT NULL,
    purchase_no VARCHAR(20) NOT NULL,
    supplier_id INT NULL,
    supplier_name VARCHAR(120) NULL,
    invoice_no VARCHAR(60) NULL,
    currency CHAR(3) NOT NULL DEFAULT 'TZS',
    total_amount DECIMAL(14, 2) NOT NULL,
    paid_amount DECIMAL(14, 2) NOT NULL DEFAULT 0,
    note VARCHAR(255) NULL,
    purchased_at DATETIME NOT NULL,
    is_backdated TINYINT(1) NOT NULL DEFAULT 0,
    idempotency_key VARCHAR(64) NULL,
    payload_hash CHAR(64) NULL,
    created_by INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_purchases_seller FOREIGN KEY (seller_id) REFERENCES users(id),
    CONSTRAINT fk_purchases_supplier FOREIGN KEY (supplier_id) REFERENCES stock_suppliers(id) ON DELETE SET NULL,
    UNIQUE KEY uq_purchases_no (seller_id, purchase_no),
    UNIQUE KEY uq_purchases_idem (seller_id, idempotency_key),
    INDEX idx_purchases_seller_date (seller_id, purchased_at),
    INDEX idx_purchases_supplier (seller_id, supplier_id)
);

CREATE TABLE IF NOT EXISTS purchase_lines (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    purchase_id BIGINT NOT NULL,
    seller_id INT NOT NULL,
    stock_item_id INT NOT NULL,
    item_name VARCHAR(200) NOT NULL,
    quantity INT NOT NULL,
    unit_cost DECIMAL(12, 2) NOT NULL,
    line_total DECIMAL(14, 2) NOT NULL,
    CONSTRAINT fk_purchase_lines_purchase FOREIGN KEY (purchase_id) REFERENCES purchases(id) ON DELETE CASCADE,
    CONSTRAINT fk_purchase_lines_item FOREIGN KEY (stock_item_id) REFERENCES stock_items(id),
    CONSTRAINT chk_purchase_lines_quantity CHECK (quantity > 0),
    INDEX idx_purchase_lines_purchase (purchase_id),
    INDEX idx_purchase_lines_item (stock_item_id)
);

CREATE TABLE IF NOT EXISTS stock_payments (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    seller_id INT NOT NULL,
    direction ENUM('in', 'out') NOT NULL,
    amount DECIMAL(14, 2) NOT NULL,
    method ENUM('cash', 'mobile_money', 'card', 'bank_transfer', 'other') NOT NULL DEFAULT 'cash',
    sale_id BIGINT NULL,
    customer_id INT NULL,
    purchase_id BIGINT NULL,
    supplier_id INT NULL,
    kind ENUM('sale', 'debt_payment', 'refund', 'void_refund', 'purchase_payment') NOT NULL,
    note VARCHAR(255) NULL,
    batch_key VARCHAR(64) NULL,
    payload_hash CHAR(64) NULL,
    paid_at DATETIME NOT NULL,
    created_by INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_stock_payments_seller FOREIGN KEY (seller_id) REFERENCES users(id),
    CONSTRAINT chk_stock_payments_amount CHECK (amount > 0),
    INDEX idx_stock_payments_seller_date (seller_id, paid_at),
    INDEX idx_stock_payments_sale (sale_id),
    INDEX idx_stock_payments_purchase (purchase_id),
    INDEX idx_stock_payments_customer (seller_id, customer_id),
    INDEX idx_stock_payments_batch (seller_id, batch_key)
);

INSERT INTO platform_settings (setting_key, setting_value) VALUES
    ('stock_backdate_max_days', '7')
ON DUPLICATE KEY UPDATE setting_key = setting_key;

-- Backfill 1: offline_sales -> sales (source 'legacy'). Receipt number L + id so it can
-- never collide with a numbered POS receipt. The old rows were always recorded as paid.
INSERT IGNORE INTO sales
    (seller_id, receipt_no, source, customer_id, customer_name, currency, subtotal, discount_amount,
     total_amount, paid_amount, returned_amount, payment_method, note, sold_at, legacy_offline_sale_id, created_by)
SELECT os.seller_id, CONCAT('L', LPAD(os.id, 6, '0')), 'legacy', NULL, os.customer_name, 'TZS',
       os.total_amount, 0, os.total_amount, os.total_amount, 0, os.payment_method, os.note, os.sold_at, os.id, os.seller_id
FROM offline_sales os;

-- Backfill 2: one line per legacy sale. The item is the external item a tools-only
-- product was migrated to, else the listing item; NULL if neither exists.
INSERT INTO sale_lines
    (sale_id, seller_id, stock_item_id, item_name, variant_label, item_source, quantity, unit_price, unit_cost, line_total)
SELECT s.id, os.seller_id,
       COALESCE(sl.id, sk.id),
       os.product_name, os.variant_label,
       CASE WHEN sl.id IS NOT NULL THEN 'external' ELSE 'nexora' END,
       os.quantity, os.unit_price, NULL, os.total_amount
FROM offline_sales os
JOIN sales s ON s.legacy_offline_sale_id = os.id
LEFT JOIN stock_items sl ON sl.legacy_product_id = os.product_id AND sl.seller_id = os.seller_id
LEFT JOIN stock_items sk ON sk.link_key = CONCAT(os.product_id, '-', COALESCE(os.variant_id, 0))
WHERE NOT EXISTS (SELECT 1 FROM sale_lines x WHERE x.sale_id = s.id);

-- Backfill 3: the matching money-in row, so payment-based reports include history.
INSERT INTO stock_payments
    (seller_id, direction, amount, method, sale_id, kind, note, paid_at, created_by)
SELECT s.seller_id, 'in', s.total_amount, IF(s.payment_method = 'credit', 'other', s.payment_method),
       s.id, 'sale', 'Copied from the old sales screen', s.sold_at, s.seller_id
FROM sales s
WHERE s.source = 'legacy' AND s.total_amount > 0
  AND NOT EXISTS (SELECT 1 FROM stock_payments p WHERE p.sale_id = s.id);
