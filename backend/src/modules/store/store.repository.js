const db = require("../../config/db");

// Public store profile - Phase 5A (basics) + Phase 5B (trust info).
//
// Deliberately a narrower column list than seller.repository.js's
// findByUserId (the seller's own authenticated view): no
// business_email/business_phone (contact info a seller entered for their
// own account, not something this phase decided to publish), no
// verification_fee_* columns, and no address/pickup_lat/pickup_lng
// (precise location - region/city/country is the public-safe level of
// detail, same granularity already exposed via product listings' `region`
// field since Phase 4B).
//
// `is_verified` (the paid "Verified Seller" badge, same one ProductCard
// already renders per-product) and `created_at` (store creation date,
// shown as "Member since") were left out of Phase 5A on purpose so this
// phase - the one named "Trust Info" - would have its own fields to add
// rather than finding them already there.
//
// `sp.user_id` (Phase 5C) is the one column here that isn't itself a
// display field - it's what the store page passes to GET /products as
// `seller_id` to load this store's catalog, the same id
// findFilterSellers already exposes publicly today for the product
// listing's own "Store" filter dropdown, so this isn't new exposure.
//
// `has_pickup_pin` (Phase 5D) answers "does this store's delivery fee
// get calculated by distance" for the store page's Delivery section,
// without exposing sp.pickup_lat/pickup_lng themselves - those stay out
// for the same precise-location reason address/pickup_lat/pickup_lng
// are excluded above. A boolean derived from whether they're set
// carries none of that precision.
//
// `u.is_active = 1` keeps a deactivated seller's store page returning
// "not found" instead of a dead page - same reasoning as products'
// `p.is_active = 1` in product.repository.js, applied to the seller
// account level since this query has no per-product `is_active` to check.
//
// `sp.store_theme` (Phase 7A) is a plain display field like store_logo/
// store_banner above - the seller's chosen accent-color preset for this
// page, from the fixed list in seller.constants.js. No join needed since
// it's not a lookup-table id (see migration 048's comment for why).
//
// `sp.store_tagline`/`sp.social_instagram`/`sp.social_facebook`/
// `sp.social_whatsapp` (Phase 7B) are the same kind of plain, seller-
// controlled display field - see migration 049's comment for why they're
// free text rather than validated URLs/handles. Unlike business_email/
// business_phone (excluded above as private contact info the seller
// entered for account purposes), these four exist specifically to be
// published - a seller who fills them in wants buyers to see them.
//
// `identity_verified` (Phase 7D) surfaces `u.account_verification_status`
// as a plain boolean - NEXORA-reviewed identity documents at registration
// (migration 026), completely separate from `sp.is_verified` above (the
// optional *paid* "Verified Seller" badge). Migration 026's own comment
// already noted this account-level gate "isn't surfaced publicly
// anywhere today" when Phase 5B chose not to add it alongside the paid
// badge - this phase is what finally does. Only the boolean is exposed,
// never the raw `account_verification_status` enum itself: `pending`/
// `rejected` and any rejection reason are private review-in-progress
// details for the seller and admins, not something a shopper should see
// on a public page (mirrors `has_pickup_pin` above - a derived boolean
// exposes exactly what a buyer needs without exposing the underlying
// private detail it's derived from).
exports.findPublicBySlug = async (slug) => {
    const [rows] = await db.query(
        `SELECT
            sp.user_id, sp.store_name, sp.store_slug, sp.store_description,
            sp.store_tagline,
            sp.store_logo, sp.store_banner, sp.store_theme,
            sp.social_instagram, sp.social_facebook, sp.social_whatsapp,
            sp.country, sp.region, sp.city,
            sp.is_verified, sp.created_at,
            (sp.pickup_lat IS NOT NULL AND sp.pickup_lng IS NOT NULL) AS has_pickup_pin,
            (u.account_verification_status = 'approved') AS identity_verified,
            st.name AS store_type_name,
            (
                SELECT AVG(r.rating) FROM reviews r
                JOIN products p ON p.id = r.product_id
                WHERE p.seller_id = sp.user_id
            ) AS average_rating,
            (
                SELECT COUNT(*) FROM reviews r
                JOIN products p ON p.id = r.product_id
                WHERE p.seller_id = sp.user_id
            ) AS review_count
        FROM seller_profiles sp
        JOIN users u ON u.id = sp.user_id
        LEFT JOIN store_types st ON st.id = sp.store_type_id
        WHERE sp.store_slug = ? AND u.is_active = 1`,
        [slug]
    );

    return rows[0];
};

// Public store collections - Phase 7C (Seller Collections). A seller can
// group their own products into named shelves (e.g. "New Arrivals")
// shown on the store page above the full catalog grid Phase 5C already
// wired up. One query, flat rows grouped in JS below - same shape/fields
// (id, name, slug, price, discount_price, stock, store_name, is_verified,
// region, image_url, average_rating, review_count) as product.repository's
// own `findAll`, so the frontend can hand these straight to the existing
// ProductCard/ProductRow components without a translation layer.
//
// The INNER JOIN on `p.is_active = 1` does double duty: it excludes any
// product the seller has since deactivated from a shelf it's still
// assigned to (matching the public catalog's own active-only rule), and
// - since a collection with zero surviving active products then has no
// rows at all - it naturally drops empty collections from the result
// without a separate "does this collection have anything to show" check.
exports.findCollectionsBySlug = async (slug) => {
    const [rows] = await db.query(
        `SELECT
            sc.id AS collection_id, sc.name AS collection_name,
            p.id, p.name, p.slug, p.price, p.discount_price, p.stock,
            sp.store_name, sp.is_verified, sp.region,
            (
                SELECT pi.image_url FROM product_images pi
                WHERE pi.product_id = p.id AND pi.is_primary = 1
                LIMIT 1
            ) AS image_url,
            (SELECT AVG(r.rating) FROM reviews r WHERE r.product_id = p.id) AS average_rating,
            (SELECT COUNT(*) FROM reviews r WHERE r.product_id = p.id) AS review_count
        FROM seller_collections sc
        JOIN seller_collection_products scp ON scp.collection_id = sc.id
        JOIN products p ON p.id = scp.product_id AND p.is_active = 1
        JOIN seller_profiles sp ON sp.user_id = sc.seller_id
        WHERE sp.store_slug = ?
        ORDER BY sc.display_order ASC, sc.id ASC, scp.display_order ASC, scp.id ASC`,
        [slug]
    );

    const collections = [];
    const byId = new Map();

    for (const row of rows) {
        let collection = byId.get(row.collection_id);

        if (!collection) {
            collection = { id: row.collection_id, name: row.collection_name, products: [] };
            byId.set(row.collection_id, collection);
            collections.push(collection);
        }

        collection.products.push({
            id: row.id,
            name: row.name,
            slug: row.slug,
            price: row.price,
            discount_price: row.discount_price,
            stock: row.stock,
            store_name: row.store_name,
            is_verified: row.is_verified,
            region: row.region,
            image_url: row.image_url,
            average_rating: row.average_rating,
            review_count: row.review_count
        });
    }

    return collections;
};
