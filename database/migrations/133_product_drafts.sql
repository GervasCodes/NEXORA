-- Migration 133: product drafts (Phase 13a - photos before first save).
--
-- A seller's product row is now created on their first field so photos can
-- be uploaded before the listing is complete. Drafts are is_active = FALSE
-- (hidden from buyers and from the listing-limit count) and is_draft = TRUE
-- until they are published. Existing rows default to is_draft = FALSE.
-- Re-runnable: the column is only added when it is missing.

SET @has_is_draft := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND COLUMN_NAME = 'is_draft'
);
SET @add_is_draft := IF(
    @has_is_draft = 0,
    'ALTER TABLE products ADD COLUMN is_draft BOOLEAN NOT NULL DEFAULT FALSE AFTER is_active',
    'SELECT 1'
);
PREPARE stmt_add_is_draft FROM @add_is_draft;
EXECUTE stmt_add_is_draft;
DEALLOCATE PREPARE stmt_add_is_draft;
