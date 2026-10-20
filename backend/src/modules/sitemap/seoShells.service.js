// Round 6 Phase 2 (SEO - dynamic-route prerendering).
//
// frontend/scripts/prerender-shells.mjs already writes a real, crawler-
// readable shell (title/description/canonical/OG/noscript) for every
// STATIC route at build time, but its own header comment says dynamic,
// database-driven routes (/products/:slug, /services/:slug,
// /stores/:slug) are "not generated here" - those three route families
// are exactly what the crawl-stats audit flagged as the gap (80% of
// Googlebot hits are "page resource load", <1% "Discovery").
//
// This module is that script's data source: it returns exactly the
// fields a shell needs (title/description/image/path/updatedAt) for
// every publicly-visible product, service and store, read fresh from
// the DB on each (cached) call - the same approach sitemap.service.js
// already uses for the same reason (catalog changes constantly, a
// build-time-only snapshot of the DB would go stale between deploys).
//
// Visibility rules are intentionally duplicated from each module's own
// repository (not imported) rather than reused, matching the same
// "scope discipline" reasoning already written into sitemap.service.js:
// this stays a read-only, side-effect-free reporting query with no
// coupling to those modules' internals.
//   - products: product.repository.js#findBySlug -> p.is_active = 1
//   - services: service.repository.js (public queries) -> s.is_active = 1 AND s.status = 'published'
//   - stores:   store.repository.js#findPublicBySlug -> u.is_active = 1
// Sellers must also be active + verified, same as sitemap.service.js's
// SELLER_LISTED, so a shell is never generated for a page a buyer/
// crawler can't actually reach.
const dbRead = require("../../config/dbRead");
const cache = require("../../utils/cache");

const SELLER_LISTED = "u.is_active = 1 AND u.account_verification_status = 'approved'";

// Mirrors PageMeta's own description truncation on each detail page
// (ProductDetail.jsx/ServiceDetail.jsx slice description to 160 chars) -
// kept the same length here so the prerendered shell's meta description
// matches what react-helmet-async swaps in once the app mounts.
const DESCRIPTION_LENGTH = 160;

const truncate = (value) => (value ? String(value).slice(0, DESCRIPTION_LENGTH) : null);

const getShellProducts = async () => {
    const [rows] = await dbRead.query(
        `SELECT p.slug, p.name, p.description, p.updated_at,
                (SELECT pi.image_url FROM product_images pi
                 WHERE pi.product_id = p.id
                 ORDER BY pi.is_primary DESC, pi.display_order ASC LIMIT 1) AS image_url
         FROM products p
         JOIN users u ON u.id = p.seller_id
         WHERE p.is_active = 1 AND ${SELLER_LISTED}`
    );
    return rows.map((row) => ({
        path: `/products/${row.slug}`,
        title: row.name,
        description: truncate(row.description) || `${row.name} on NEXORA.`,
        image: row.image_url || null,
        imageAlt: row.name,
        updatedAt: row.updated_at
    }));
};

const getShellServices = async () => {
    const [rows] = await dbRead.query(
        `SELECT s.slug, s.title, s.description, s.updated_at, sp.store_name,
                (SELECT sm.media_url FROM service_media sm
                 WHERE sm.service_id = s.id AND sm.media_type = 'image'
                 ORDER BY sm.is_primary DESC, sm.display_order ASC LIMIT 1) AS image_url
         FROM services s
         JOIN users u ON u.id = s.provider_id
         JOIN seller_profiles sp ON sp.user_id = s.provider_id
         WHERE s.is_active = 1 AND s.status = 'published' AND ${SELLER_LISTED}`
    );
    return rows.map((row) => ({
        path: `/services/${row.slug}`,
        title: row.title,
        description: truncate(row.description) || `${row.title} by ${row.store_name} on NEXORA.`,
        image: row.image_url || null,
        imageAlt: row.title,
        updatedAt: row.updated_at
    }));
};

// Same "skip empty stores" rule as sitemap.service.js#getActiveStores -
// a store with no live listing is a thin page not worth a shell either.
const getShellStores = async () => {
    const [rows] = await dbRead.query(
        `SELECT sp.store_slug, sp.store_name, sp.store_banner, sp.store_logo,
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
    return rows.map((row) => ({
        path: `/stores/${row.store_slug}`,
        title: row.store_name,
        description: `${row.store_name} on NEXORA.`,
        image: row.store_banner || row.store_logo || null,
        imageAlt: row.store_name,
        updatedAt: row.updated_at
    }));
};

// Cached the same way/duration as the sitemap (5 min) - this is a
// public, crawler/build-facing endpoint hit at most once per deploy in
// normal operation, but the cache keeps a burst of retries (e.g. a
// flaky build re-running the script) cheap.
exports.getShellEntries = async () => {
    return cache.getOrSet(
        "seoShells",
        "entries",
        async () => {
            const [products, services, stores] = await Promise.all([
                getShellProducts(),
                getShellServices(),
                getShellStores()
            ]);
            return [...products, ...services, ...stores];
        },
        300
    );
};
