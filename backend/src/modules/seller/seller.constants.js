// Phase 7A (Store Themes) - the fixed set of accent-color presets a
// seller can choose for their public store page. Kept as a plain JS
// array (not a DB lookup table like store_types) because this list is
// small, code-defined, and not admin-editable - see the comment in
// migration 048_seller_store_theme.sql for why that's the right call
// here. seller.validator.js's isIn(...) is the enforcement point; this
// module exists so the validator and anything else that needs the list
// (e.g. a future "list available themes" endpoint) share one source of
// truth instead of two hardcoded copies drifting apart.
exports.STORE_THEMES = ["default", "teal", "coral", "mango", "azure"];
