-- Migration 066: Nexora Services — Phase 5 (Growth)
-- Depends on: services (062), service_categories (062)
--
-- Covers two of the four items CHANGES.md's own roadmap lists under
-- Phase 5 ("Dynamic Pricing", "Additional Service Categories"); the other
-- two ("Analytics", "Advanced Reporting") are read-only aggregate
-- queries over existing tables and need no schema change (same as how
-- migration 065's Notifications item needed none).

-- 1. Dynamic pricing rules --------------------------------------------
--
-- A provider can already override the price for one specific date
-- one-by-one (service_availability.price, migration 062/063's
-- "Phase 2" date-pricing). What's missing is a way to say "weekends are
-- 20% more" or "peak season (Dec 15 - Jan 5) is +30,000 TZS" once,
-- instead of manually setting every single date. This table is that
-- rule layer, sitting BETWEEN service_availability.price (most
-- specific, always wins - a provider's explicit per-date override
-- should never be silently outbid by a rule) and
-- services.base_price/discount_price (the fallback when nothing more
-- specific applies).
--
-- Two rule shapes rather than a single generic one, because they answer
-- genuinely different questions ("which day of the week is this?" vs.
-- "is this date inside a named window?") and a single nullable-column
-- table would need CHECK constraints doing the same disambiguation
-- anyway:
--  - day_of_week: 0 (Sunday) - 6 (Saturday), MySQL's own DAYOFWEEK()-1
--    convention, applied by utils/dynamicPricing.js.
--  - date_range: start_date/end_date, inclusive, for seasonal pricing.
--
-- adjustment_type/adjustment_value are a plain "percentage or fixed
-- amount" pair - no existing discount-shaped column elsewhere in this
-- codebase to reuse, so this is the first one and future discount-style
-- features (coupons, promotions) should follow this same shape rather
-- than inventing another.
CREATE TABLE IF NOT EXISTS service_pricing_rules (
    id INT AUTO_INCREMENT PRIMARY KEY,
    service_id INT NOT NULL,

    rule_type ENUM('day_of_week', 'date_range') NOT NULL,
    day_of_week TINYINT NULL,
    start_date DATE NULL,
    end_date DATE NULL,

    adjustment_type ENUM('percentage', 'fixed') NOT NULL,
    adjustment_value DECIMAL(10, 2) NOT NULL,

    label VARCHAR(100) NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT chk_pricing_rule_day_of_week CHECK (
        (rule_type = 'day_of_week' AND day_of_week BETWEEN 0 AND 6 AND start_date IS NULL AND end_date IS NULL)
        OR (rule_type = 'date_range' AND day_of_week IS NULL AND start_date IS NOT NULL AND end_date IS NOT NULL AND end_date >= start_date)
    ),

    CONSTRAINT fk_pricing_rules_service
        FOREIGN KEY (service_id) REFERENCES services(id)
        ON DELETE CASCADE
);

CREATE INDEX idx_pricing_rules_service ON service_pricing_rules (service_id, is_active);

-- 2. Additional service categories -------------------------------------
--
-- migration 062 seeded the first 4 of CHANGES.md's own long-term-vision
-- category list (Accommodation, Transportation, Tourism, plus
-- "Business Spaces" standing in for office/event space). These are the
-- rest of that list.
INSERT INTO service_categories (name, slug, description, display_order) VALUES
    ('Events', 'events', 'Event planning, catering, decor and entertainment booking', 5),
    ('Healthcare', 'healthcare', 'Clinic, dental and wellness appointment booking', 6),
    ('Professional Services', 'professional-services', 'Consulting, legal, accounting and other scheduled expert services', 7),
    ('Rentals', 'rentals', 'Equipment, gear and venue rentals booked by date', 8)
ON DUPLICATE KEY UPDATE name = name;
