-- Migration 101: Phase 11 (UI/UX remediation) - seller saved filter views
-- Run after 100_notification_preferences.sql.
--
-- One row per named filter combination a seller has saved, scoped by
-- page_key (e.g. "seller_products", "seller_orders") so the same
-- seller can have differently-named presets on different list pages
-- without them colliding. `filters` is a JSON blob of whatever that
-- page's own filter state shape is (search/category/status for
-- products, status/date-range for orders, etc.) - deliberately generic
-- rather than a column per possible filter field, since each page's
-- filter shape is different and this table has no reason to know what
-- those shapes are.
CREATE TABLE IF NOT EXISTS seller_saved_filters (
    id INT AUTO_INCREMENT PRIMARY KEY,
    seller_id INT NOT NULL,
    page_key VARCHAR(50) NOT NULL,
    name VARCHAR(60) NOT NULL,
    filters JSON NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_seller_saved_filters_seller FOREIGN KEY (seller_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_seller_saved_filters_seller_page (seller_id, page_key)
);
