-- Migration 159: Nexora Stock Management - expenses, reports, alerts, offline, plan entitlements (Phase 8).
-- Run after 158_stock_sales_purchases.sql. Additive and re-runnable: every ALTER is guarded
-- by an information_schema check, every INSERT/UPDATE is idempotent.
--
--  subscription_plans.entitlements  Machine-readable feature flags and soft limits per plan
--                       (the existing `features` column is display copy only). Read by the
--                       stock access gate (requireFeature). NULL = "use the defaults for the
--                       plan's audience", so an admin can edit a tier without a deploy.
--                         { "stock_pos": true, "stock_import_export": true,
--                           "stock_reports": true, "stock_cost_reports": false,
--                           "stock_staff_users": false, "stock_low_alerts": true,
--                           "stock_max_items": 2000 }       -- soft limit, a warning, never a block
--  stock_expenses       Money the business spent that is not stock: rent, transport, wages...
--                       amount is TZS; expense_date is the Dar es Salaam calendar day the
--                       seller picked (a DATE, no time zone ambiguity). voided_at keeps a
--                       cancelled expense on record but out of every total.
--  stock_low_alert_state One row per item that is currently "low". Written when an alert is
--                       sent, deleted when stock climbs back above the reorder level, so a
--                       seller is told once per dip, not once per sale.
--  sales.is_offline / stock_flagged / client_created_at
--                       A sale that was rung up while the device was offline and synced later.
--                       stock_flagged = 1 when applying it took an item below zero (the sale
--                       had already happened; stock is the thing that was wrong).
--  settings             stock_export_grace_days, stock_low_alert_channels,
--                       stock_offline_max_age_days.

CREATE TABLE IF NOT EXISTS stock_expenses (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    seller_id INT NOT NULL,
    category VARCHAR(30) NOT NULL,
    amount DECIMAL(12, 2) NOT NULL,
    expense_date DATE NOT NULL,
    note VARCHAR(255) NULL,
    receipt_url VARCHAR(500) NULL,
    receipt_public_id VARCHAR(255) NULL,
    idempotency_key VARCHAR(64) NULL,
    payload_hash CHAR(64) NULL,
    voided_at TIMESTAMP NULL,
    void_reason VARCHAR(255) NULL,
    created_by INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_stock_expenses_seller FOREIGN KEY (seller_id) REFERENCES users(id),
    UNIQUE KEY uq_stock_expenses_idem (seller_id, idempotency_key),
    INDEX idx_stock_expenses_date (seller_id, expense_date),
    INDEX idx_stock_expenses_category (seller_id, category, expense_date)
);

CREATE TABLE IF NOT EXISTS stock_low_alert_state (
    stock_item_id INT PRIMARY KEY,
    seller_id INT NOT NULL,
    stock_at_alert INT NOT NULL,
    alerted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_stock_low_alert_item FOREIGN KEY (stock_item_id) REFERENCES stock_items(id) ON DELETE CASCADE,
    INDEX idx_stock_low_alert_seller (seller_id)
);

-- subscription_plans.entitlements
SET @sql = IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'subscription_plans'
          AND COLUMN_NAME = 'entitlements') = 0,
    'ALTER TABLE subscription_plans ADD COLUMN entitlements JSON NULL',
    'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- sales.is_offline
SET @sql = IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sales' AND COLUMN_NAME = 'is_offline') = 0,
    'ALTER TABLE sales ADD COLUMN is_offline TINYINT(1) NOT NULL DEFAULT 0',
    'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- sales.stock_flagged
SET @sql = IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sales' AND COLUMN_NAME = 'stock_flagged') = 0,
    'ALTER TABLE sales ADD COLUMN stock_flagged TINYINT(1) NOT NULL DEFAULT 0',
    'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- sales.client_created_at (the till's own clock, kept for the record; sold_at is what reports use)
SET @sql = IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sales' AND COLUMN_NAME = 'client_created_at') = 0,
    'ALTER TABLE sales ADD COLUMN client_created_at TIMESTAMP NULL',
    'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Report queries filter on (seller_id, voided_at, sold_at); the existing index may not cover voided_at.
SET @sql = IF(
    (SELECT COUNT(*) FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sales' AND INDEX_NAME = 'idx_sales_report') = 0,
    'CREATE INDEX idx_sales_report ON sales (seller_id, sold_at, voided_at)',
    'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Default tiers. Only fills plans that have no entitlements yet, so an admin's edits survive a re-run.
--   business_tools  Stock Management with basic reports, import/export and low-stock alerts.
--   starter         the same.
--   growth          adds cost / profit reports.
--   pro             adds staff users.
--   free            no Stock Management (the 7-day trial still unlocks everything).
UPDATE subscription_plans SET entitlements = JSON_OBJECT(
    'stock_pos', TRUE, 'stock_import_export', TRUE, 'stock_reports', TRUE, 'stock_cost_reports', FALSE,
    'stock_staff_users', FALSE, 'stock_low_alerts', TRUE, 'stock_max_items', 1000)
WHERE code IN ('business_tools', 'starter') AND entitlements IS NULL;

UPDATE subscription_plans SET entitlements = JSON_OBJECT(
    'stock_pos', TRUE, 'stock_import_export', TRUE, 'stock_reports', TRUE, 'stock_cost_reports', TRUE,
    'stock_staff_users', FALSE, 'stock_low_alerts', TRUE, 'stock_max_items', 5000)
WHERE code = 'growth' AND entitlements IS NULL;

UPDATE subscription_plans SET entitlements = JSON_OBJECT(
    'stock_pos', TRUE, 'stock_import_export', TRUE, 'stock_reports', TRUE, 'stock_cost_reports', TRUE,
    'stock_staff_users', TRUE, 'stock_low_alerts', TRUE, 'stock_max_items', NULL)
WHERE code = 'pro' AND entitlements IS NULL;

UPDATE subscription_plans SET entitlements = JSON_OBJECT(
    'stock_pos', FALSE, 'stock_import_export', FALSE, 'stock_reports', FALSE, 'stock_cost_reports', FALSE,
    'stock_staff_users', FALSE, 'stock_low_alerts', FALSE, 'stock_max_items', 0)
WHERE code = 'free' AND entitlements IS NULL;

-- Pricing copy: say that Stock Management is included (display text only; appended once).
UPDATE subscription_plans
SET features = JSON_ARRAY_APPEND(COALESCE(features, JSON_ARRAY()), '$', 'Stock Management: stock, sales, purchases and reports')
WHERE code IN ('business_tools', 'starter', 'growth', 'pro')
  AND JSON_SEARCH(COALESCE(features, JSON_ARRAY()), 'one', 'Stock Management%') IS NULL;

UPDATE subscription_plans
SET features = JSON_ARRAY_APPEND(features, '$', 'Profit and cost reports')
WHERE code IN ('growth', 'pro') AND features IS NOT NULL
  AND JSON_SEARCH(features, 'one', 'Profit and cost reports') IS NULL;

UPDATE subscription_plans
SET features = JSON_ARRAY_APPEND(features, '$', 'Staff users for your till')
WHERE code = 'pro' AND features IS NOT NULL
  AND JSON_SEARCH(features, 'one', 'Staff users for your till') IS NULL;

INSERT INTO platform_settings (setting_key, setting_value) VALUES
    ('stock_export_grace_days', '30'),
    ('stock_low_alert_channels', 'push'),
    ('stock_offline_max_age_days', '30')
ON DUPLICATE KEY UPDATE setting_key = setting_key;
