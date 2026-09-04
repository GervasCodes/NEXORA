const db = require("../../config/db");

// Phase 2 continuation (UI/UX remediation) - product variants.
// See migration 095's comments for the schema reasoning (options_key
// for uniqueness, variant_label snapshot on order_items, etc.).

exports.findOptionsByProduct = async (productId) => {
    const [options] = await db.query(
        "SELECT id, name, display_order FROM product_variant_options WHERE product_id = ? ORDER BY display_order, id",
        [productId]
    );
    if (!options.length) return [];

    const optionIds = options.map((o) => o.id);
    const [values] = await db.query(
        `SELECT id, option_id, value, display_order
         FROM product_variant_option_values
         WHERE option_id IN (?)
         ORDER BY display_order, id`,
        [optionIds]
    );

    return options.map((option) => ({
        ...option,
        values: values.filter((v) => v.option_id === option.id).map((v) => ({ id: v.id, value: v.value }))
    }));
};

exports.findVariantsByProduct = async (productId) => {
    const [rows] = await db.query(
        `SELECT id, options, sku, price_delta, stock, image_url, is_active
         FROM product_variants
         WHERE product_id = ?
         ORDER BY id`,
        [productId]
    );
    // mysql2 returns JSON columns already parsed into JS objects.
    return rows;
};

exports.findVariantById = async (variantId) => {
    const [rows] = await db.query(
        "SELECT * FROM product_variants WHERE id = ?",
        [variantId]
    );
    return rows[0];
};

// Full replace of a product's variant configuration in one transaction -
// see productVariant.service.js#replaceVariants for why this is a
// "replace everything" operation rather than incremental CRUD.
// Existing product_variants rows are matched to the new set by
// options_key so ids (and therefore any cart_items/order_items already
// referencing them) survive a re-save that doesn't actually change that
// combination - only combinations that are genuinely removed lose their
// row (and, via the FK's ON DELETE behavior on cart_items/order_items
// handling - see service layer - are handled there, not by a DB cascade,
// since an order that already happened must keep its snapshot).
exports.replaceVariants = async (productId, options, variants) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        await connection.query("DELETE FROM product_variant_options WHERE product_id = ?", [productId]);

        for (const option of options) {
            const [optionResult] = await connection.query(
                "INSERT INTO product_variant_options (product_id, name, display_order) VALUES (?, ?, ?)",
                [productId, option.name, option.display_order ?? 0]
            );
            for (const [i, value] of option.values.entries()) {
                await connection.query(
                    "INSERT INTO product_variant_option_values (option_id, value, display_order) VALUES (?, ?, ?)",
                    [optionResult.insertId, value, i]
                );
            }
        }

        const existingKeys = new Map();
        const [existingRows] = await connection.query(
            "SELECT id, options_key FROM product_variants WHERE product_id = ?",
            [productId]
        );
        existingRows.forEach((row) => existingKeys.set(row.options_key, row.id));

        const keptKeys = new Set();

        for (const variant of variants) {
            keptKeys.add(variant.optionsKey);
            if (existingKeys.has(variant.optionsKey)) {
                await connection.query(
                    `UPDATE product_variants
                     SET options = ?, sku = ?, price_delta = ?, stock = ?, image_url = ?, is_active = 1
                     WHERE id = ?`,
                    [
                        JSON.stringify(variant.options),
                        variant.sku || null,
                        variant.price_delta || 0,
                        variant.stock || 0,
                        variant.image_url || null,
                        existingKeys.get(variant.optionsKey)
                    ]
                );
            } else {
                await connection.query(
                    `INSERT INTO product_variants (product_id, options, options_key, sku, price_delta, stock, image_url)
                     VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [
                        productId,
                        JSON.stringify(variant.options),
                        variant.optionsKey,
                        variant.sku || null,
                        variant.price_delta || 0,
                        variant.stock || 0,
                        variant.image_url || null
                    ]
                );
            }
        }

        // Combinations that existed before but weren't resubmitted are
        // deactivated (is_active = 0) rather than deleted, so any
        // cart_items/order_items already pointing at that variant_id
        // keep resolving to a real row instead of an orphaned foreign
        // key - deactivated variants are simply excluded from the
        // buyer-facing selector (see productVariant.service.js's
        // read path).
        const removedIds = existingRows
            .filter((row) => !keptKeys.has(row.options_key))
            .map((row) => row.id);
        if (removedIds.length) {
            await connection.query(
                "UPDATE product_variants SET is_active = 0 WHERE id IN (?)",
                [removedIds]
            );
        }

        await connection.query(
            "UPDATE products SET has_variants = ? WHERE id = ?",
            [variants.length > 0 ? 1 : 0, productId]
        );

        await connection.commit();
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
};

exports.decrementVariantStock = async (connection, variantId, quantity) => {
    await connection.query(
        "UPDATE product_variants SET stock = stock - ? WHERE id = ? AND stock >= ?",
        [quantity, variantId, quantity]
    );
};
