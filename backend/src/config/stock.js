// Nexora Stock Management constants (Phase 6). The reorder level fallback
// mirrors the platform setting `stock_default_reorder_level` (migration 157);
// the setting wins when present (settings.service#getStockDefaultReorderLevel).
exports.DEFAULT_REORDER_LEVEL = 5;
exports.MAX_STOCK = 1000000;

exports.MOVEMENT_TYPES = [
    "purchase", "sale", "order_deduct", "order_restore", "return", "void", "correction", "opening"
];

// Types a seller can post by hand in Phase 6. sale/return/void are written by
// the sales screens (Phase 7); order_* only by checkout/cancellation.
exports.MANUAL_MOVEMENT_TYPES = ["purchase", "correction", "opening"];

exports.ITEM_SOURCES = ["nexora", "external"];
