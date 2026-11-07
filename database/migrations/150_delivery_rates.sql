-- Migration 150: Tanzanian transport-rate delivery pay and ETA.
-- Run after 149_broadcast_template_type.sql.
--
-- Rider pay is now computed from effective-dated per-vehicle rate cards
-- (min fee + per-km rate) multiplied by a fuel factor derived from the
-- EWURA monthly cap price. The old distance bands stay in
-- platform_settings.delivery_distance_bands and are used only when no rate
-- card exists. Nothing here changes what buyers are charged.
--
-- Safe to re-run: tables use IF NOT EXISTS, seeds are insert-if-missing,
-- columns are added only when absent. No existing data is dropped or rewritten.

-- Part 1: rate cards. A new price for a vehicle is a NEW row with a later
-- effective_from; the card in force is the newest row whose effective_from
-- has passed. Old rows are kept as history.
CREATE TABLE IF NOT EXISTS delivery_rate_cards (
    id INT AUTO_INCREMENT PRIMARY KEY,
    vehicle_type VARCHAR(20) NOT NULL,
    fuel_product ENUM('petrol', 'diesel') NOT NULL DEFAULT 'petrol',
    min_fee DECIMAL(10, 2) NOT NULL,
    per_km_rate DECIMAL(10, 2) NOT NULL,
    effective_from DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by INT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_rate_cards_vehicle_effective (vehicle_type, effective_from),
    CONSTRAINT fk_rate_cards_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Part 2: EWURA monthly retail cap prices (TZS per litre) per region and
-- product. Entered manually by an admin each month.
CREATE TABLE IF NOT EXISTS fuel_reference (
    id INT AUTO_INCREMENT PRIMARY KEY,
    region VARCHAR(60) NOT NULL,
    product ENUM('petrol', 'diesel') NOT NULL,
    cap_price DECIMAL(10, 2) NOT NULL,
    effective_from DATETIME NOT NULL,
    entered_by INT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_fuel_reference_lookup (region, product, effective_from),
    CONSTRAINT fk_fuel_reference_entered_by FOREIGN KEY (entered_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Part 3: time-of-day ETA adjustments. The hour window is [start_hour,
-- end_hour) in Africa/Dar_es_Salaam time; a window with end_hour < start_hour
-- wraps past midnight.
CREATE TABLE IF NOT EXISTS delivery_eta_adjustments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    region VARCHAR(60) NOT NULL,
    label VARCHAR(60) NULL,
    start_hour TINYINT UNSIGNED NOT NULL,
    end_hour TINYINT UNSIGNED NOT NULL,
    multiplier DECIMAL(4, 2) NOT NULL DEFAULT 1.00,
    buffer_minutes SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_eta_adjustments_region (region, is_active)
);

-- Part 4: the rider-pay quote taken when the order is placed. Dispatch,
-- offer cards and earnings read this snapshot, so a later rate or fuel
-- change never rewrites the pay of an order that already exists. NULL on
-- orders placed before this migration (those are priced live, as before).
SET @sql = IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders'
          AND COLUMN_NAME = 'rider_fee_quote') = 0,
    'ALTER TABLE orders ADD COLUMN rider_fee_quote DECIMAL(10, 2) NULL, ADD COLUMN rider_fee_quote_details JSON NULL, ADD COLUMN rider_fee_quoted_at DATETIME NULL',
    'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Part 5: settings. fuel_baseline_cap is the litre price at which the rate
-- cards are "correct" (fuel factor 1.0). It is set to the October 2026
-- Dar es Salaam petrol cap, so the factor starts neutral.
INSERT INTO platform_settings (setting_key, setting_value) VALUES
    ('fuel_passthrough_pct', '30'),
    ('fuel_baseline_cap', '4057'),
    ('fuel_max_monthly_change_pct', '15'),
    ('default_delivery_vehicle', 'boda'),
    ('delivery_handling_buffer_minutes', '10'),
    ('delivery_default_region', 'Dar es Salaam')
ON DUPLICATE KEY UPDATE setting_key = setting_key;

-- Part 6: seeds (only when the tables are empty).
-- Boda mirrors the existing bands (first band fee as the minimum,
-- per_km_beyond as the per-km rate); bajaj and car are scaled up.
INSERT INTO delivery_rate_cards (vehicle_type, fuel_product, min_fee, per_km_rate, effective_from)
SELECT v.vehicle_type, 'petrol', v.min_fee, v.per_km_rate, '2026-01-01 00:00:00'
FROM (
    SELECT 'boda' AS vehicle_type, 2000 AS min_fee, 600 AS per_km_rate
    UNION ALL SELECT 'bajaj', 3000, 800
    UNION ALL SELECT 'car', 4000, 1000
) v
WHERE NOT EXISTS (SELECT 1 FROM delivery_rate_cards);

INSERT INTO fuel_reference (region, product, cap_price, effective_from)
SELECT f.region, f.product, f.cap_price, '2026-10-07 00:01:00'
FROM (
    SELECT 'Dar es Salaam' AS region, 'petrol' AS product, 4057 AS cap_price
    UNION ALL SELECT 'Dar es Salaam', 'diesel', 4086
) f
WHERE NOT EXISTS (SELECT 1 FROM fuel_reference);

-- Dar es Salaam traffic: morning and evening peaks. Starting values -
-- admin-editable on the Delivery rates page.
INSERT INTO delivery_eta_adjustments (region, label, start_hour, end_hour, multiplier, buffer_minutes)
SELECT a.region, a.label, a.start_hour, a.end_hour, a.multiplier, a.buffer_minutes
FROM (
    SELECT 'Dar es Salaam' AS region, 'Morning peak' AS label, 7 AS start_hour, 10 AS end_hour, 1.40 AS multiplier, 5 AS buffer_minutes
    UNION ALL SELECT 'Dar es Salaam', 'Evening peak', 16, 20, 1.50, 5
) a
WHERE NOT EXISTS (SELECT 1 FROM delivery_eta_adjustments);
