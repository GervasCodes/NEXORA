const db = require("../../config/db");

exports.create = async (data) => {
    const {
        seller_id,
        category_id,
        name,
        slug,
        description,
        price,
        discount_price,
        stock,
        brand,
        product_condition
    } = data;

    const [result] = await db.query(
        `INSERT INTO products 
        (seller_id, category_id, name, slug, description, price, discount_price, stock, brand, product_condition)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            seller_id,
            category_id,
            name,
            slug,
            description,
            price,
            discount_price,
            stock,
            brand,
            product_condition
        ]
    );

    return result.insertId;
};
exports.addProductImage = async (
    productId,
    imageUrl,
    isPrimary,
    displayOrder
) => {

    await db.query(
        `INSERT INTO product_images
        (product_id, image_url, is_primary, display_order)
        VALUES (?, ?, ?, ?)`,
        [
            productId,
            imageUrl,
            isPrimary,
            displayOrder
        ]
    );
};

exports.findById = async (productId) => {
    const [rows] = await db.query("SELECT * FROM products WHERE id = ?", [productId]);
    return rows[0];
};

// Public catalog listing: active products only, with primary image,
// store name, and rating summary. Supports basic search/category/pagination.
// Search matches product name/brand/description AND the category name, so
// typing "phones" surfaces every phone-category product across all stores,
// even if the word "phones" never appears in an individual product's name.
exports.findAll = async ({ categoryId, search, page, limit }) => {
    const offset = (page - 1) * limit;
    const conditions = ["p.is_active = 1"];
    const params = [];

    if (categoryId) {
        conditions.push("p.category_id = ?");
        params.push(categoryId);
    }

    if (search) {
        conditions.push("(p.name LIKE ? OR p.brand LIKE ? OR p.description LIKE ? OR c.name LIKE ?)");
        params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }

    const whereClause = conditions.join(" AND ");

    const [rows] = await db.query(
        `SELECT
            p.id, p.name, p.slug, p.price, p.discount_price, p.stock, p.brand,
            sp.store_name,
            (
                SELECT pi.image_url FROM product_images pi
                WHERE pi.product_id = p.id AND pi.is_primary = 1
                LIMIT 1
            ) AS image_url,
            (SELECT AVG(r.rating) FROM reviews r WHERE r.product_id = p.id) AS average_rating,
            (SELECT COUNT(*) FROM reviews r WHERE r.product_id = p.id) AS review_count
        FROM products p
        JOIN seller_profiles sp ON sp.user_id = p.seller_id
        LEFT JOIN categories c ON c.id = p.category_id
        WHERE ${whereClause}
        ORDER BY p.created_at DESC
        LIMIT ? OFFSET ?`,
        [...params, limit, offset]
    );

    const [[{ total }]] = await db.query(
        `SELECT COUNT(*) AS total
        FROM products p
        LEFT JOIN categories c ON c.id = p.category_id
        WHERE ${whereClause}`,
        params
    );

    return { rows, total };
};

// Public product detail by slug: full info + all images + store + ratings
exports.findBySlug = async (slug) => {
    const [rows] = await db.query(
        `SELECT
            p.*,
            sp.store_name, sp.store_slug, sp.is_verified,
            c.name AS category_name,
            (SELECT AVG(r.rating) FROM reviews r WHERE r.product_id = p.id) AS average_rating,
            (SELECT COUNT(*) FROM reviews r WHERE r.product_id = p.id) AS review_count
        FROM products p
        JOIN seller_profiles sp ON sp.user_id = p.seller_id
        LEFT JOIN categories c ON c.id = p.category_id
        WHERE p.slug = ? AND p.is_active = 1`,
        [slug]
    );

    return rows[0];
};

exports.findImagesByProductId = async (productId) => {
    const [rows] = await db.query(
        `SELECT id, image_url, is_primary, display_order
        FROM product_images
        WHERE product_id = ?
        ORDER BY display_order ASC`,
        [productId]
    );
    return rows;
};

exports.countExistingImages = async (productId) => {
    const [rows] = await db.query(
        "SELECT COUNT(*) AS count FROM product_images WHERE product_id = ?",
        [productId]
    );
    return rows[0].count;
};

// Seller's own catalog - includes inactive products, unlike the public listing
exports.findAllBySeller = async (sellerId) => {
    const [rows] = await db.query(
        `SELECT
            p.id, p.name, p.slug, p.price, p.discount_price, p.stock,
            p.is_active, p.created_at,
            (
                SELECT pi.image_url FROM product_images pi
                WHERE pi.product_id = p.id AND pi.is_primary = 1
                LIMIT 1
            ) AS image_url
        FROM products p
        WHERE p.seller_id = ?
        ORDER BY p.created_at DESC`,
        [sellerId]
    );
    return rows;
};

exports.update = async (productId, data) => {
    const fields = [];
    const params = [];

    const allowed = [
        "name", "description", "price", "discount_price",
        "stock", "brand", "product_condition", "category_id"
    ];

    for (const key of allowed) {
        if (data[key] !== undefined) {
            fields.push(`${key} = ?`);
            params.push(data[key]);
        }
    }

    if (fields.length === 0) return;

    params.push(productId);

    await db.query(
        `UPDATE products SET ${fields.join(", ")} WHERE id = ?`,
        params
    );
};

exports.setActive = async (productId, isActive) => {
    await db.query("UPDATE products SET is_active = ? WHERE id = ?", [isActive, productId]);
};