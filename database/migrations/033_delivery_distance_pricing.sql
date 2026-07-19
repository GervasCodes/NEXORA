-- Migration 033: Tanzania distance-based delivery pricing
-- Run after 032_delivery_agent_vehicle_and_ratings.sql.
--
-- Part 1: seller pickup pin. Distance-based pricing needs two points -
-- the buyer's delivery pin (orders.delivery_lat/delivery_lng, already
-- exists since migration in delivery_tracking.sql) and where the agent
-- picks up from. Sellers had no coordinates at all until now (just
-- free-text country/region/city/address) - same optional-pin pattern
-- checkout already uses for the buyer side. NULL for every seller until
-- they set one in Store settings; pricing falls back to the flat
-- rider_delivery_fee whenever either pin is missing (see
-- deliveryPricing.service.js).
ALTER TABLE seller_profiles
    ADD COLUMN pickup_lat DECIMAL(10, 7) NULL AFTER address,
    ADD COLUMN pickup_lng DECIMAL(10, 7) NULL AFTER pickup_lat;

-- Part 2: widen platform_settings.setting_value from VARCHAR(255) to TEXT.
-- The new delivery_distance_bands value below is a small JSON blob that
-- comfortably fits in 255 chars today, but an admin adding more bands
-- later shouldn't be able to silently truncate it - TEXT removes that
-- ceiling for this and any future JSON-shaped setting. Existing plain
-- string values (commission_rate, etc.) are unaffected.
ALTER TABLE platform_settings
    MODIFY setting_value TEXT NOT NULL;

-- Part 3: default distance-band pricing config, in the same
-- key/value row shape every other platform_settings entry uses (see
-- migration 017). Read by settingsService.getDeliveryDistanceBands(),
-- edited by admins via PUT /admin/settings. Bolt-style tiers: a flat fee
-- for "up to X km", then a per-km rate beyond the last band.
INSERT INTO platform_settings (setting_key, setting_value) VALUES
    ('delivery_distance_bands', '{"bands":[{"up_to_km":3,"fee":2000},{"up_to_km":7,"fee":4000},{"up_to_km":12,"fee":6000},{"up_to_km":20,"fee":9000}],"per_km_beyond":600}')
ON DUPLICATE KEY UPDATE setting_key = setting_key;

-- Part 4: record what a delivery's fee was actually calculated from, for
-- transparency to the agent/admin ("why is this delivery TZS 5,400?").
-- NULL when the flat fallback fee was used instead (see
-- deliveryPricing.service.js - "flat" vs "distance" method).
ALTER TABLE deliveries
    ADD COLUMN distance_km DECIMAL(6, 2) NULL AFTER delivery_fee;
