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
// frontend/src/data/legalDocs.js at runtime — see PHASE_1_NOTES.md for
// the maintenance implication (this list and the frontend route list
// can drift and currently have no single shared source of truth).
const STATIC_PATHS = [
    { path: "/", changefreq: "daily", priority: "1.0" },
    { path: "/products", changefreq: "hourly", priority: "0.9" },
    { path: "/services", changefreq: "hourly", priority: "0.9" },
    { path: "/guides", changefreq: "daily", priority: "0.6" },
    { path: "/group-buys", changefreq: "daily", priority: "0.6" },
    { path: "/status", changefreq: "weekly", priority: "0.3" },
    { path: "/legal/terms-of-service", changefreq: "monthly", priority: "0.3" },
    { path: "/legal/privacy-policy", changefreq: "monthly", priority: "0.3" },
    { path: "/legal/vendor-agreement", changefreq: "monthly", priority: "0.2" },
    { path: "/legal/delivery-liability-policy", changefreq: "monthly", priority: "0.2" },
    { path: "/legal/insurance-policy", changefreq: "monthly", priority: "0.2" }
];

// dbRead-only, read-only queries — safe against a replica per the same
// reasoning as the existing findPublicBySlug/findAllActive functions
// they mirror.
const getActiveProducts = async () => {
    const [rows] = await dbRead.query(
        "SELECT slug, updated_at FROM products WHERE is_active = 1"
    );
    return rows;
};

const getActiveServices = async () => {
    const [rows] = await dbRead.query(
        "SELECT slug, updated_at FROM services WHERE is_active = 1 AND status = 'published'"
    );
    return rows;
};

const getActiveStores = async () => {
    const [rows] = await dbRead.query(
        `SELECT sp.store_slug, sp.updated_at
         FROM seller_profiles sp
         JOIN users u ON u.id = sp.user_id
         WHERE u.is_active = 1`
    );
    return rows;
};

const getActiveDepartments = async () => {
    const [rows] = await dbRead.query(
        "SELECT slug FROM categories WHERE status = 'active' AND slug != 'services'"
    );
    return rows;
};

const getActiveServiceCategories = async () => {
    const [rows] = await dbRead.query(
        "SELECT slug FROM service_categories WHERE status = 'active'"
    );
    return rows;
};

const getPublishedGuides = async () => {
    const [rows] = await dbRead.query(
        "SELECT slug, published_at FROM content_articles WHERE status = 'published'"
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

const urlEntry = (baseUrl, { path, lastmod, changefreq, priority }) => {
    const loc = `${baseUrl}${path}`;
    let entry = `  <url>\n    <loc>${xmlEscape(loc)}</loc>\n`;
    if (lastmod) entry += `    <lastmod>${lastmod}</lastmod>\n`;
    if (changefreq) entry += `    <changefreq>${changefreq}</changefreq>\n`;
    if (priority) entry += `    <priority>${priority}</priority>\n`;
    entry += "  </url>";
    return entry;
};

// Builds the full list of { path, lastmod, changefreq, priority }
// entries this sitemap should contain, before they're turned into XML.
// Exported separately from buildSitemapXml/getSitemapXml so unit tests
// can assert on the entry list directly (which items got included /
// excluded) without parsing XML.
exports.collectEntries = async () => {
    const [products, services, stores, departments, serviceCategories, guides] = await Promise.all([
        getActiveProducts(),
        getActiveServices(),
        getActiveStores(),
        getActiveDepartments(),
        getActiveServiceCategories(),
        getPublishedGuides()
    ]);

    const entries = [...STATIC_PATHS];

    for (const dept of departments) {
        entries.push({ path: `/departments/${dept.slug}`, changefreq: "daily", priority: "0.7" });
    }
    for (const cat of serviceCategories) {
        entries.push({ path: `/services/category/${cat.slug}`, changefreq: "daily", priority: "0.6" });
    }
    for (const product of products) {
        entries.push({
            path: `/products/${product.slug}`,
            lastmod: isoDate(product.updated_at),
            changefreq: "daily",
            priority: "0.8"
        });
    }
    for (const service of services) {
        entries.push({
            path: `/services/${service.slug}`,
            lastmod: isoDate(service.updated_at),
            changefreq: "daily",
            priority: "0.8"
        });
    }
    for (const store of stores) {
        entries.push({
            path: `/stores/${store.store_slug}`,
            lastmod: isoDate(store.updated_at),
            changefreq: "weekly",
            priority: "0.6"
        });
    }
    for (const guide of guides) {
        entries.push({
            path: `/guides/${guide.slug}`,
            lastmod: isoDate(guide.published_at),
            changefreq: "monthly",
            priority: "0.5"
        });
    }

    return entries;
};

exports.buildSitemapXml = (entries, baseUrl) => {
    const body = entries.map((entry) => urlEntry(baseUrl, entry)).join("\n");
    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
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
exports.getSitemapXml = async () => {
    const baseUrl = getBaseUrl();
    return cache.getOrSet(
        "sitemap",
        "xml",
        async () => {
            const entries = await exports.collectEntries();
            return exports.buildSitemapXml(entries, baseUrl);
        },
        300
    );
};
