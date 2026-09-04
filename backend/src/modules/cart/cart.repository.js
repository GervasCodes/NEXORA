const db = require("../../config/db");

// Phase 2 continuation (UI/UX remediation) - variant_id threaded through
// every function below. It uses a 0 sentinel (not NULL) for "no variant
// selected" - see migration 095's comment on cart_items for why: it lets
// (user_id, product_id, variant_id) stay a clean unique key without
// MySQL's NULL-is-never-equal-to-NULL unique-index behavior allowing
// duplicate rows for the many products that have no variants at all.
// Every call site passes `variantId || 0` at the boundary so the rest of
// the app can keep thinking in terms of "no variant = null/undefined".

// Find a single cart item for a user + product (+ variant)
exports.findByUserAndProduct = async (userId, productId, variantId = 0) => {
    const [rows] = await db.query(
        "SELECT * FROM cart_items WHERE user_id = ? AND product_id = ? AND variant_id = ?",
        [userId, productId, variantId || 0]
    );
    return rows[0];
};

// Add a new item to the cart
exports.addItem = async (userId, productId, quantity, variantId = 0) => {
    const [result] = await db.query(
        `INSERT INTO cart_items (user_id, product_id, variant_id, quantity)
        VALUES (?, ?, ?, ?)`,
        [userId, productId, variantId || 0, quantity]
    );
    return result.insertId;
};

// Update quantity for an existing cart item
exports.updateQuantity = async (userId, productId, quantity, variantId = 0) => {
    await db.query(
        `UPDATE cart_items
        SET quantity = ?
        WHERE user_id = ? AND product_id = ? AND variant_id = ?`,
        [quantity, userId, productId, variantId || 0]
    );
};

// Remove a single item from the cart
exports.removeItem = async (userId, productId, variantId = 0) => {
    const [result] = await db.query(
        "DELETE FROM cart_items WHERE user_id = ? AND product_id = ? AND variant_id = ?",
        [userId, productId, variantId || 0]
    );
    return result.affectedRows;
};

// Remove all items from a user's cart
exports.clearCart = async (userId) => {
    await db.query("DELETE FROM cart_items WHERE user_id = ?", [userId]);
};

// Get the full cart for a user, joined with product details + primary
// image, and (when a line item has one) its variant's own stock/price
// delta/image - a variant's stock/price overrides the parent product's
// for that line item, same relationship order.service.js#checkout
// applies at checkout time (see its variant handling).
exports.getCartByUser = async (userId) => {
    const [rows] = await db.query(
        `SELECT
            ci.id AS cart_item_id,
            ci.product_id,
            ci.variant_id,
            ci.quantity,
            p.seller_id,
            p.name,
            p.slug,
            p.price,
            p.discount_price,
            p.stock AS product_stock,
            sp.store_name,
            pv.options AS variant_options,
            pv.price_delta AS variant_price_delta,
            pv.stock AS variant_stock,
            pv.image_url AS variant_image_url,
            (
                SELECT pi.image_url
                FROM product_images pi
                WHERE pi.product_id = p.id AND pi.is_primary = 1
                LIMIT 1
            ) AS image_url
        FROM cart_items ci
        JOIN products p ON p.id = ci.product_id
        JOIN seller_profiles sp ON sp.user_id = p.seller_id
        LEFT JOIN product_variants pv ON pv.id = ci.variant_id AND ci.variant_id != 0
        WHERE ci.user_id = ?
        ORDER BY ci.created_at DESC`,
        [userId]
    );
    return rows;
};

// Look up a product by id (used to validate stock/existence before cart ops)
exports.findProductById = async (productId) => {
    const [rows] = await db.query(
        "SELECT id, price, discount_price, stock, is_active, has_variants FROM products WHERE id = ?",
        [productId]
    );
    return rows[0];
};

// Batched counterpart of findProductById - fetches every product a cart
// references in one query instead of one round trip per line item.
// Used by order.service.js#checkout, which previously called
// findProductById once per cart item (a real N+1 on the highest-frequency
// write path in the app - see Phase RF5 audit / RF3 remediation).
exports.findProductsByIds = async (productIds) => {
    if (!productIds.length) {
        return [];
    }

    const [rows] = await db.query(
        "SELECT id, price, discount_price, stock, is_active, has_variants FROM products WHERE id IN (?)",
        [productIds]
    );
    return rows;
};

// Variant lookup by id, used wherever a cart/order operation needs a
// specific variant's own stock/price_delta rather than the parent
// product's.
exports.findVariantById = async (variantId) => {
    const [rows] = await db.query(
        "SELECT * FROM product_variants WHERE id = ? AND is_active = 1",
        [variantId]
    );
    return rows[0];
};

exports.findVariantsByIds = async (variantIds) => {
    if (!variantIds.length) return [];
    const [rows] = await db.query(
        "SELECT * FROM product_variants WHERE id IN (?) AND is_active = 1",
        [variantIds]
    );
    return rows;
};
