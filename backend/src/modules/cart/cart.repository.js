const db = require("../../config/db");

// Find a single cart item for a user + product
exports.findByUserAndProduct = async (userId, productId) => {
    const [rows] = await db.query(
        "SELECT * FROM cart_items WHERE user_id = ? AND product_id = ?",
        [userId, productId]
    );
    return rows[0];
};

// Add a new item to the cart
exports.addItem = async (userId, productId, quantity) => {
    const [result] = await db.query(
        `INSERT INTO cart_items (user_id, product_id, quantity)
        VALUES (?, ?, ?)`,
        [userId, productId, quantity]
    );
    return result.insertId;
};

// Update quantity for an existing cart item
exports.updateQuantity = async (userId, productId, quantity) => {
    await db.query(
        `UPDATE cart_items
        SET quantity = ?
        WHERE user_id = ? AND product_id = ?`,
        [quantity, userId, productId]
    );
};

// Remove a single item from the cart
exports.removeItem = async (userId, productId) => {
    const [result] = await db.query(
        "DELETE FROM cart_items WHERE user_id = ? AND product_id = ?",
        [userId, productId]
    );
    return result.affectedRows;
};

// Remove all items from a user's cart
exports.clearCart = async (userId) => {
    await db.query("DELETE FROM cart_items WHERE user_id = ?", [userId]);
};

// Get the full cart for a user, joined with product details + primary image
exports.getCartByUser = async (userId) => {
    const [rows] = await db.query(
        `SELECT
            ci.id AS cart_item_id,
            ci.product_id,
            ci.quantity,
            p.seller_id,
            p.name,
            p.slug,
            p.price,
            p.discount_price,
            p.stock,
            (
                SELECT pi.image_url
                FROM product_images pi
                WHERE pi.product_id = p.id AND pi.is_primary = 1
                LIMIT 1
            ) AS image_url
        FROM cart_items ci
        JOIN products p ON p.id = ci.product_id
        WHERE ci.user_id = ?
        ORDER BY ci.created_at DESC`,
        [userId]
    );
    return rows;
};

// Look up a product by id (used to validate stock/existence before cart ops)
exports.findProductById = async (productId) => {
    const [rows] = await db.query(
        "SELECT id, price, discount_price, stock, is_active FROM products WHERE id = ?",
        [productId]
    );
    return rows[0];
};
