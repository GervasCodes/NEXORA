-- Migration 096: Phase 5 (UI/UX remediation) - wishlist/service parity
-- Run after 095_product_variants.sql.
--
-- Extends the existing wishlist_items table to also hold saved services,
-- rather than a second parallel service_wishlist_items table - a saved
-- item is a saved item regardless of type, and Saved.jsx already needs
-- to merge both into one page, which is far simpler against one table
-- with a nullable type-specific column than two tables unioned together.
-- product_id becomes nullable (was NOT NULL); exactly one of
-- product_id/service_id must be set, enforced by the CHECK constraint
-- below and, for defense in depth against MySQL configurations where
-- CHECK enforcement is inconsistent, at the wishlist.service.js layer
-- too (mirrors how buyer_addresses' "one default" rule is primarily an
-- app-level guarantee, not a DB one - see migration 093's comment).

ALTER TABLE wishlist_items
    MODIFY COLUMN product_id INT NULL,
    ADD COLUMN service_id INT NULL AFTER product_id;

ALTER TABLE wishlist_items
    ADD CONSTRAINT fk_wishlist_service FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE,
    ADD CONSTRAINT uq_wishlist_user_service UNIQUE (user_id, service_id),
    ADD CONSTRAINT chk_wishlist_one_target CHECK (
        (product_id IS NOT NULL AND service_id IS NULL) OR
        (product_id IS NULL AND service_id IS NOT NULL)
    );

-- Back-in-stock / price-drop alerts (Phase 5, UI/UX remediation) -
-- previously a product's PDP would tell a buyer "out of stock" or show
-- the current price with no way to be told later if either changed.
-- One row per (user, product, alert type) they've opted into; type is
-- a string rather than two boolean columns so a third alert type could
-- be added later without another migration. price_baseline is only
-- meaningful for a 'price_drop' row (the price at the moment they
-- opted in - notified once it drops below that) and stays NULL for
-- 'back_in_stock' rows.
CREATE TABLE IF NOT EXISTS product_alerts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    product_id INT NOT NULL,
    alert_type ENUM('back_in_stock', 'price_drop') NOT NULL,
    price_baseline DECIMAL(12, 2) NULL,

    -- Set once the alert has actually fired (notification sent) so the
    -- stock/price-update hooks that check this table can skip rows
    -- that already fired, instead of re-notifying on every subsequent
    -- stock/price change. Left in place (not deleted) after firing so
    -- "you already got notified about this" stays visible/debuggable -
    -- cleanup of long-fired rows is a housekeeping concern, not a
    -- correctness one, and is deliberately out of scope here.
    notified_at TIMESTAMP NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_product_alerts_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_product_alerts_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    CONSTRAINT uq_product_alerts_user_product_type UNIQUE (user_id, product_id, alert_type),
    INDEX idx_product_alerts_product_type (product_id, alert_type, notified_at)
);
