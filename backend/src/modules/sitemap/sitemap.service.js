// Phase 1 (SEO Critical) — backend-generated sitemap.
//
// NEXORA's catalog (products/services/stores) changes constantly, so a
// static sitemap.xml would go stale within hours of being generated.
// This builds it fresh from the DB on every call (behind a short cache,
// see below), the same way the rest of the public catalog is served.
//
// Every query here mirrors the exact "is this actually publicly
// visible" condition the corresponding public detail-page query already
// uses, so the sitemap can never list a URL that 404s or redirects for
// a real visitor/crawler:
//   - products:  product.repository.js#findBySlug  -> p.is_active = 1
//   - services:  service.repository.js (public queries) -> s.is_active = 1 AND s.status = 'published'
//   - stores:    store.repository.js#findPublicBySlug -> u.is_active = 1
//   - departments (categories): category.repository.js#findAllActive -> status = 'active'
//   - service categories: serviceCategory.repository.js -> status = 'active'
//   - guides (content articles): content.repository.js -> status = 'published'
// If any of those source queries' visibility rules change, this file's
// queries should be revisited alongside them — they're intentionally
// duplicated (not imported from each module's own repository) so this
// stays a read-only, side-effect-free reporting query with no coupling
// to those modules' internals, per the phase's own "scope discipline"
// ground rule.
const dbRead = require("../../config/dbRead");
const cache = require("../../utils/cache");

// Static/marketing pages that exist outside any DB table. Kept as a
// plain array (not scraped from the frontend router) since this is a
// backend module and has no access to frontend/src/App.jsx or
// frontend/src/data/legalDocs.js at runtime. Google ignores <changefreq>
// and <priority>, so entries only carry <loc> and, where it is real,
// <lastmod>. Static pages carry no lastmod rather than a made-up one.
const STATIC_PATHS = [
    { path: "/" },
    { path: "/products" },
    { path: "/services" },
    { path: "/guides" },
    { path: "/group-buys" },
    { path: "/live-selling" },
    { path: "/sell" },
    { path: "/how-it-works" },
    { path: "/about" },
    { path: "/contact" },
    { path: "/legal/company-information" },
    { path: "/legal/terms-of-service" },
    { path: "/legal/privacy-policy" },
    { path: "/legal/refund-policy" },
    { path: "/legal/cookie-policy" },
    { path: "/legal/vendor-agreement" },
    { path: "/legal/delivery-liability-policy" },
    { path: "/legal/insurance-policy" }
];

// A seller's pages are only listed while the seller is active AND has
// passed account verification - the same people whose catalogue a buyer
// can actually trust to be live. Mirrors users.account_verification_status
// = 'approved' used by the store badge and seller gates.
const SELLER_LISTED = "u.is_active = 1 AND u.account_verification_status = 'approved'";

// Per-URL image cap (Google allows 1000; a handful is plenty and keeps
// the file small).
const MAX_IMAGES_PER_URL = 5;

// Sitemap protocol limit is 50,000 URLs per file; stay well under it.
const MAX_URLS_PER_FILE = 40000;

// dbRead-only, read-only queries — safe against a replica per the same
// reasoning as the existing findPublicBySlug/findAllActive functions
// they mirror.
const getActiveProducts = async () => {
    const [rows] = await dbRead.query(
        `SELECT p.id, p.slug, p.updated_at
         FROM products p
         JOIN users u ON u.id = p.seller_id
         WHERE p.is_active = 1 AND ${SELLER_LISTED}`
    );
    return rows;
};

const getActiveServices = async () => {
    const [rows] = await dbRead.query(
        `SELECT s.id, s.slug, s.updated_at
         FROM services s
         JOIN users u ON u.id = s.provider_id
         WHERE s.is_active = 1 AND s.status = 'published' AND ${SELLER_LISTED}`
    );
    return rows;
};

// Empty stores are left out: a store page with no live product or
// service is a thin page. lastmod is the newest of the store's own
// update and its newest listing, so it moves when the store's content does.
const getActiveStores = async () => {
    const [rows] = await dbRead.query(
        `SELECT sp.store_slug,
                GREATEST(
                    sp.updated_at,
                    COALESCE((SELECT MAX(p.updated_at) FROM products p WHERE p.seller_id = sp.user_id AND p.is_active = 1), sp.updated_at),
                    COALESCE((SELECT MAX(s.updated_at) FROM services s WHERE s.provider_id = sp.user_id AND s.is_active = 1 AND s.status = 'published'), sp.updated_at)
                ) AS updated_at
         FROM seller_profiles sp
         JOIN users u ON u.id = sp.user_id
         WHERE ${SELLER_LISTED}
           AND sp.store_slug IS NOT NULL AND sp.store_slug != ''
           AND (
                EXISTS (SELECT 1 FROM products p WHERE p.seller_id = sp.user_id AND p.is_active = 1)
                OR EXISTS (SELECT 1 FROM services s WHERE s.provider_id = sp.user_id AND s.is_active = 1 AND s.status = 'published')
           )`
    );
    return rows;
};

const getActiveDepartments = async () => {
    const [rows] = await dbRead.query(
        "SELECT slug, updated_at FROM categories WHERE status = 'active' AND slug != 'services'"
    );
    return rows;
};

const getActiveServiceCategories = async () => {
    const [rows] = await dbRead.query(
        "SELECT slug, updated_at FROM service_categories WHERE status = 'active'"
    );
    return rows;
};

const getPublishedGuides = async () => {
    const [rows] = await dbRead.query(
        "SELECT slug, published_at, updated_at FROM content_articles WHERE status = 'published'"
    );
    return rows;
};

// Image-sitemap source: product photos (absolute Cloudinary URLs).
// Only images of products that are themselves listed are used (joined
// the same way as getActiveProducts).
const getProductImages = async () => {
    const [rows] = await dbRead.query(
        `SELECT pi.product_id, pi.image_url
         FROM product_images pi
         JOIN products p ON p.id = pi.product_id
         JOIN users u ON u.id = p.seller_id
         WHERE p.is_active = 1 AND ${SELLER_LISTED}
         ORDER BY pi.product_id, pi.is_primary DESC, pi.display_order ASC`
    );
    return rows;
};

const getServiceImages = async () => {
    const [rows] = await dbRead.query(
        `SELECT sm.service_id, sm.media_url AS image_url
         FROM service_media sm
         JOIN services s ON s.id = sm.service_id
         JOIN users u ON u.id = s.provider_id
         WHERE sm.media_type = 'image' AND s.is_active = 1 AND s.status = 'published' AND ${SELLER_LISTED}
         ORDER BY sm.service_id, sm.is_primary DESC, sm.display_order ASC`
    );
    return rows;
};

const isoDate = (value) => {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
};

const xmlEscape = (value) =>
    String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");

const isHttpUrl = (value) => typeof value === "string" && /^https?:\/\//i.test(value);

const urlEntry = (baseUrl, { path, lastmod, images }) => {
    const loc = `${baseUrl}${path}`;
    let entry = `  <url>\n    <loc>${xmlEscape(loc)}</loc>\n`;
    if (lastmod) entry += `    <lastmod>${lastmod}</lastmod>\n`;
    for (const imageUrl of images || []) {
        entry += `    <image:image><image:loc>${xmlEscape(imageUrl)}</image:loc></image:image>\n`;
    }
    entry += "  </url>";
    return entry;
};

const groupImages = (rows, idKey) => {
    const map = new Map();
    for (const row of rows) {
        if (!isHttpUrl(row.image_url)) continue;
        const list = map.get(row[idKey]) || [];
        if (list.length < MAX_IMAGES_PER_URL) list.push(row.image_url);
        map.set(row[idKey], list);
    }
    return map;
};

// Builds the full list of { path, lastmod, changefreq, priority }
// entries this sitemap should contain, before they're turned into XML.
// Exported separately from buildSitemapXml/getSitemapXml so unit tests
// can assert on the entry list directly (which items got included /
// excluded) without parsing XML.
exports.collectEntries = async () => {
    const [products, services, stores, departments, serviceCategories, guides, productImages, serviceImages] = await Promise.all([
        getActiveProducts(),
        getActiveServices(),
        getActiveStores(),
        getActiveDepartments(),
        getActiveServiceCategories(),
        getPublishedGuides(),
        getProductImages(),
        getServiceImages()
    ]);

    const imagesByProduct = groupImages(productImages, "product_id");
    const imagesByService = groupImages(serviceImages, "service_id");

    const entries = [...STATIC_PATHS];

    for (const dept of departments) {
        entries.push({ path: `/departments/${dept.slug}`, lastmod: isoDate(dept.updated_at) });
    }
    for (const cat of serviceCategories) {
        entries.push({ path: `/services/category/${cat.slug}`, lastmod: isoDate(cat.updated_at) });
    }
    for (const product of products) {
        entries.push({
            path: `/products/${product.slug}`,
            lastmod: isoDate(product.updated_at),
            images: imagesByProduct.get(product.id)
        });
    }
    for (const service of services) {
        entries.push({
            path: `/services/${service.slug}`,
            lastmod: isoDate(service.updated_at),
            images: imagesByService.get(service.id)
        });
    }
    for (const store of stores) {
        entries.push({ path: `/stores/${store.store_slug}`, lastmod: isoDate(store.updated_at) });
    }
    for (const guide of guides) {
        entries.push({
            path: `/guides/${guide.slug}`,
            lastmod: isoDate(guide.updated_at || guide.published_at)
        });
    }

    return entries;
};

const URLSET_OPEN =
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">';

exports.buildSitemapXml = (entries, baseUrl) => {
    const body = entries.map((entry) => urlEntry(baseUrl, entry)).join("\n");
    return `<?xml version="1.0" encoding="UTF-8"?>\n${URLSET_OPEN}\n${body}\n</urlset>\n`;
};

// Sitemap index pointing at numbered child files, used automatically
// once a single file would pass MAX_URLS_PER_FILE.
exports.buildSitemapIndexXml = (partCount, baseUrl, lastmod) => {
    const items = Array.from({ length: partCount }, (_, i) => {
        const loc = xmlEscape(`${baseUrl}/sitemap-${i + 1}.xml`);
        return `  <sitemap>\n    <loc>${loc}</loc>${lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : ""}\n  </sitemap>`;
    }).join("\n");
    return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${items}\n</sitemapindex>\n`;
};

exports.splitEntries = (entries, size = MAX_URLS_PER_FILE) => {
    const parts = [];
    for (let i = 0; i < entries.length; i += size) parts.push(entries.slice(i, i + size));
    return parts;
};

// baseUrl: the frontend's own origin (NOT this API's origin) — every
// <loc> must be a URL a buyer/crawler would actually land on, and the
// frontend is a separately-deployed app (see app.js's CORS comment).
// Sourced from FRONTEND_URL (falls back to a clearly-invalid placeholder
// so a missing env var is loud/obvious in the generated XML rather than
// silently producing broken links).
const getBaseUrl = () => (process.env.FRONTEND_URL || "https://FRONTEND_URL-NOT-CONFIGURED.example").replace(/\/$/, "");

// Cached for a short period — this is a public, crawler-hit endpoint
// that would otherwise run six full-table-ish queries per request; a
// few minutes of staleness on a sitemap is immaterial (Search Console
// crawls it on its own schedule, not live per pageview) but meaningfully
// cuts DB load. Same read-through pattern as category/product listings
// (see utils/cache.js) — falls back to an uncached direct read if Redis
// is unavailable, so this endpoint never breaks because of caching.
// Returns the body for /sitemap.xml, or for /sitemap-<part>.xml when
// `part` (1-based) is given. Under MAX_URLS_PER_FILE URLs, /sitemap.xml
// is a plain urlset exactly as before; above it, /sitemap.xml becomes a
// sitemap index and the URLs move to /sitemap-1.xml, /sitemap-2.xml, ...
// Returns null for a part number that does not exist.
exports.getSitemapXml = async (part = null) => {
    const baseUrl = getBaseUrl();
    return cache.getOrSet(
        "sitemap",
        part ? `xml-${part}` : "xml",
        async () => {
            const entries = await exports.collectEntries();
            const parts = exports.splitEntries(entries);
            if (part) {
                if (parts.length <= 1 || !parts[part - 1]) return null;
                return exports.buildSitemapXml(parts[part - 1], baseUrl);
            }
            if (parts.length > 1) {
                return exports.buildSitemapIndexXml(parts.length, baseUrl, isoDate(new Date()));
            }
            return exports.buildSitemapXml(entries, baseUrl);
        },
        300
    );
};
