const db = require("../../config/db");
// Phase 5 (Backend N+1 Fixes & Read Replica Adoption): same reasoning as
// product.repository.js - only genuinely public-browsing, single-call-site
// reads get moved to dbRead; anything shared with a pre-write validation
// check or a post-write re-fetch stays on the primary. See the comment
// above each swapped function below.
const dbRead = require("../../config/dbRead");
const { buildOrderByClause } = require("../../utils/serviceSort");
const { buildProductSearchPlan } = require("../../utils/productSearch");
const { buildServiceLocationRatingConditions } = require("../../utils/serviceFilters");

exports.create = async (data) => {
    const {
        provider_id,
        category_id,
        title,
        slug,
        description,
        pricing_model,
        base_price,
        discount_price,
        country,
        region,
        city,
        address,
        lat,
        lng
    } = data;

    const [result] = await db.query(
        `INSERT INTO services
        (provider_id, category_id, title, slug, description, pricing_model,
         base_price, discount_price, country, region, city, address, lat, lng)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            provider_id,
            category_id,
            title,
            slug,
            description,
            pricing_model,
            base_price,
            discount_price,
            country,
            region,
            city,
            address,
            lat,
            lng
        ]
    );

    return result.insertId;
};

exports.findById = async (serviceId) => {
    const [rows] = await db.query("SELECT * FROM services WHERE id = ?", [serviceId]);
    return rows[0];
};

// Public marketplace listing: published + active services only, with
// primary media, provider store name, category name, and (Phase 4)
// rating summary. Mirrors product.repository.js#findAll's shape
// (search/category/price/region/rating/pagination) as closely as the
// two listings' schemas allow.
//
// region/minRating (Phase 4) are expected to already be parsed by
// utils/serviceFilters.js, and sort (Phase 4) by utils/serviceSort.js -
// this function just applies whatever it's given, same contract
// product.repository.js#findAll documents.
//
// Phase 5: public service browsing/search - same reasoning as
// product.repository.js#findAll.
exports.findAll = async ({ categoryId, search, minPrice, maxPrice, city, region, minRating, sort, page, limit }) => {
    const offset = (page - 1) * limit;
    const conditions = ["s.is_active = 1", "s.status = 'published'"];
    const params = [];
    const selectExtra = [];

    if (categoryId) {
        conditions.push("s.category_id = ?");
        params.push(categoryId);
    }

    if (city) {
        conditions.push("s.city = ?");
        params.push(city);
    }

    if (minPrice !== null && minPrice !== undefined) {
        conditions.push("s.base_price >= ?");
        params.push(minPrice);
    }

    if (maxPrice !== null && maxPrice !== undefined) {
        conditions.push("s.base_price <= ?");
        params.push(maxPrice);
    }

    const locationRating = buildServiceLocationRatingConditions({ region, minRating });
    conditions.push(...locationRating.conditions);
    params.push(...locationRating.params);

    // See utils/productSearch.js for why this is BOOLEAN MODE + prefix
    // wildcards rather than NATURAL LANGUAGE MODE, and why 1-2 char terms
    // still fall back to a plain LIKE scan. Reused as-is (not
    // reimplemented) since the plan it builds isn't product-specific -
    // only the column list it's matched against here differs.
    const searchPlan = buildProductSearchPlan(search);

    if (searchPlan.mode === "fulltext") {
        conditions.push(
            "(MATCH(s.title, s.description) AGAINST (? IN BOOLEAN MODE) OR sc.name LIKE ? OR sp.store_name LIKE ?)"
        );
        params.push(searchPlan.booleanQuery, `%${searchPlan.raw}%`, `%${searchPlan.raw}%`);
        selectExtra.push("MATCH(s.title, s.description) AGAINST (? IN BOOLEAN MODE) AS relevance");
    } else if (searchPlan.mode === "like") {
        conditions.push("(s.title LIKE ? OR s.description LIKE ? OR sc.name LIKE ? OR sp.store_name LIKE ?)");
        params.push(`%${searchPlan.raw}%`, `%${searchPlan.raw}%`, `%${searchPlan.raw}%`, `%${searchPlan.raw}%`);
    }

    const orderBy = buildOrderByClause(sort, selectExtra.length > 0);

    const whereClause = conditions.join(" AND ");
    const relevanceParam = selectExtra.length ? [searchPlan.booleanQuery] : [];

    const [rows] = await dbRead.query(
        `SELECT
            s.id, s.title, s.slug, s.pricing_model, s.base_price, s.discount_price,
            s.city, s.region, s.created_at,
            sp.store_name, sp.is_verified,
            sc.name AS category_name, sc.slug AS category_slug,
            ${selectExtra.length ? selectExtra.join(", ") + "," : ""}
            (
                SELECT sm.media_url FROM service_media sm
                WHERE sm.service_id = s.id AND sm.is_primary = 1
                LIMIT 1
            ) AS image_url,
            (
                SELECT AVG(r.rating) FROM reviews r
                JOIN bookings b ON b.id = r.booking_id
                WHERE b.service_id = s.id
            ) AS average_rating,
            (
                SELECT COUNT(*) FROM reviews r
                JOIN bookings b ON b.id = r.booking_id
                WHERE b.service_id = s.id
            ) AS review_count
        FROM services s
        JOIN seller_profiles sp ON sp.user_id = s.provider_id
        LEFT JOIN service_categories sc ON sc.id = s.category_id
        WHERE ${whereClause}
        ORDER BY ${orderBy}
        LIMIT ? OFFSET ?`,
        [...relevanceParam, ...params, limit, offset]
    );

    const [[{ total }]] = await dbRead.query(
        `SELECT COUNT(*) AS total
        FROM services s
        JOIN seller_profiles sp ON sp.user_id = s.provider_id
        LEFT JOIN service_categories sc ON sc.id = s.category_id
        WHERE ${whereClause}`,
        params
    );

    return { rows, total };
};

// Distinct provider regions with at least one published service, for
// the "Location" filter dropdown (Phase 4) - services counterpart of
// product.repository.js#findFilterRegions, scoped to s.region (a
// service's own location) rather than sp.region (a seller's store
// location), since a provider can list services in different regions
// from where their store profile is registered.
// Phase 5: filter-dropdown population - same reasoning as
// product.repository.js#findFilterRegions.
exports.findFilterRegions = async ({ categoryId }) => {
    const conditions = ["s.is_active = 1", "s.status = 'published'", "s.region IS NOT NULL", "s.region != ''"];
    const params = [];

    if (categoryId) {
        conditions.push("s.category_id = ?");
        params.push(categoryId);
    }

    const [rows] = await dbRead.query(
        `SELECT DISTINCT s.region
        FROM services s
        WHERE ${conditions.join(" AND ")}
        ORDER BY s.region ASC`,
        params
    );

    return rows.map((row) => row.region);
};

// Public service detail by slug: full info + provider + category.
//
// Phase 5: single call site (service.service.js#getServiceBySlug, the
// public ServiceDetail page) - confirmed via grep before moving this.
exports.findBySlug = async (slug) => {
    const [rows] = await dbRead.query(
        `SELECT
            s.*,
            sp.store_name, sp.store_slug, sp.is_verified,
            sc.name AS category_name, sc.slug AS category_slug,
            (
                SELECT AVG(r.rating) FROM reviews r
                JOIN bookings b ON b.id = r.booking_id
                WHERE b.service_id = s.id
            ) AS average_rating,
            (
                SELECT COUNT(*) FROM reviews r
                JOIN bookings b ON b.id = r.booking_id
                WHERE b.service_id = s.id
            ) AS review_count
        FROM services s
        JOIN seller_profiles sp ON sp.user_id = s.provider_id
        LEFT JOIN service_categories sc ON sc.id = s.category_id
        WHERE s.slug = ? AND s.is_active = 1 AND s.status = 'published'`,
        [slug]
    );

    return rows[0];
};

exports.addMedia = async (serviceId, mediaUrl, mediaType, isPrimary, displayOrder) => {
    await db.query(
        `INSERT INTO service_media
        (service_id, media_url, media_type, is_primary, display_order)
        VALUES (?, ?, ?, ?, ?)`,
        [serviceId, mediaUrl, mediaType, isPrimary, displayOrder]
    );
};

exports.findMediaByServiceId = async (serviceId) => {
    const [rows] = await db.query(
        `SELECT id, media_url, media_type, is_primary, display_order
        FROM service_media
        WHERE service_id = ?
        ORDER BY display_order ASC`,
        [serviceId]
    );
    return rows;
};

exports.countExistingMedia = async (serviceId) => {
    const [rows] = await db.query(
        "SELECT COUNT(*) AS count FROM service_media WHERE service_id = ?",
        [serviceId]
    );
    return rows[0].count;
};

// Provider's own listings - includes drafts/suspended, unlike the public
// listing (mirrors product.repository.js#findAllBySeller).
exports.findAllByProvider = async (providerId) => {
    const [rows] = await db.query(
        `SELECT
            s.id, s.title, s.slug, s.pricing_model, s.base_price, s.discount_price,
            s.status, s.is_active, s.created_at,
            (
                SELECT sm.media_url FROM service_media sm
                WHERE sm.service_id = s.id AND sm.is_primary = 1
                LIMIT 1
            ) AS image_url
        FROM services s
        WHERE s.provider_id = ?
        ORDER BY s.created_at DESC`,
        [providerId]
    );
    return rows;
};

exports.update = async (serviceId, data) => {
    const fields = [];
    const params = [];

    const allowed = [
        "title", "description", "category_id", "pricing_model",
        "base_price", "discount_price", "country", "region", "city",
        "address", "lat", "lng"
    ];

    for (const key of allowed) {
        if (data[key] !== undefined) {
            fields.push(`${key} = ?`);
            params.push(data[key]);
        }
    }

    if (fields.length === 0) return;

    params.push(serviceId);

    await db.query(
        `UPDATE services SET ${fields.join(", ")} WHERE id = ?`,
        params
    );
};

exports.setStatus = async (serviceId, status) => {
    await db.query("UPDATE services SET status = ? WHERE id = ?", [status, serviceId]);
};

exports.setActive = async (serviceId, isActive) => {
    await db.query("UPDATE services SET is_active = ? WHERE id = ?", [isActive, serviceId]);
};

// --- Dynamic pricing rules (Phase 5 - Growth) --------------------------

const normalizeDateColumn = (value) =>
    value instanceof Date ? value.toISOString().slice(0, 10) : value;

exports.createPricingRule = async (serviceId, rule) => {
    const [result] = await db.query(
        `INSERT INTO service_pricing_rules
            (service_id, rule_type, day_of_week, start_date, end_date, adjustment_type, adjustment_value, label)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            serviceId,
            rule.rule_type,
            rule.day_of_week ?? null,
            rule.start_date ?? null,
            rule.end_date ?? null,
            rule.adjustment_type,
            rule.adjustment_value,
            rule.label ?? null
        ]
    );
    return result.insertId;
};

// Newest-first, so utils/dynamicPricing.js's "first match wins" among
// same-priority rules picks the most recently created one.
exports.findPricingRulesByService = async (serviceId) => {
    const [rows] = await db.query(
        `SELECT * FROM service_pricing_rules
        WHERE service_id = ?
        ORDER BY created_at DESC`,
        [serviceId]
    );
    return rows.map((row) => ({
        ...row,
        start_date: normalizeDateColumn(row.start_date),
        end_date: normalizeDateColumn(row.end_date)
    }));
};

// Active-only sibling of findPricingRulesByService, for the booking-time
// / calendar-preview price computation - inactive rules shouldn't affect
// what a customer is charged, only the provider's own management view
// needs to see them.
exports.findActivePricingRulesByService = async (serviceId) => {
    const rules = await exports.findPricingRulesByService(serviceId);
    return rules.filter((rule) => rule.is_active);
};

exports.findPricingRuleById = async (ruleId) => {
    const [rows] = await db.query(
        "SELECT * FROM service_pricing_rules WHERE id = ?",
        [ruleId]
    );
    if (!rows[0]) return undefined;
    return {
        ...rows[0],
        start_date: normalizeDateColumn(rows[0].start_date),
        end_date: normalizeDateColumn(rows[0].end_date)
    };
};

exports.setPricingRuleActive = async (ruleId, isActive) => {
    await db.query(
        "UPDATE service_pricing_rules SET is_active = ? WHERE id = ?",
        [isActive, ruleId]
    );
};

exports.deletePricingRule = async (ruleId) => {
    await db.query("DELETE FROM service_pricing_rules WHERE id = ?", [ruleId]);
};
