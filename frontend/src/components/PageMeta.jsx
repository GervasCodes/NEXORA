import { Helmet } from "react-helmet-async";

const SITE_NAME = "NEXORA";
const DEFAULT_DESCRIPTION =
    "NEXORA — a regional multi-vendor marketplace connecting buyers, sellers, and delivery partners.";
// (Branding): dedicated 1200x630 Open Graph banner - replaces the
// icon-512.png fallback used while no banner existed.
const DEFAULT_IMAGE = "/og-banner.png";

// Phase 1 (SEO Critical). Query params that identify how a visitor
// arrived (referral codes, campaign UTMs) rather than what content is
// on the page - two URLs that differ only in these are the same page as
// far as search engines should be concerned, so they're stripped before
// building the canonical URL. Keeps anything else (e.g. a real filter
// param a page might one day rely on) untouched.
const TRACKING_PARAM_PREFIXES = ["utm_"];
const TRACKING_PARAM_NAMES = ["ref"];

const buildCanonicalUrl = (origin, pathname, search) => {
    if (!search) return `${origin}${pathname}`;

    const params = new URLSearchParams(search);
    for (const key of [...params.keys()]) {
        const lowerKey = key.toLowerCase();
        if (TRACKING_PARAM_NAMES.includes(lowerKey) || TRACKING_PARAM_PREFIXES.some((prefix) => lowerKey.startsWith(prefix))) {
            params.delete(key);
        }
    }

    const remaining = params.toString();
    return remaining ? `${origin}${pathname}?${remaining}` : `${origin}${pathname}`;
};

/**
 * Page-level <title> + Open Graph / Twitter Card meta tags -
 * Phase 2 Metadata & Error Polish. Canonical <link> + optional JSON-LD
 * structured data added in Phase 1 (SEO Critical).
 *
 * Usage: drop <PageMeta title="..." description="..." /> near the top of
 * any page component. `title` is automatically suffixed with "· NEXORA"
 * (skip the suffix with `titleOverride` for the homepage, which should
 * just be "NEXORA — Marketplace"). All URLs (canonical + og:url,
 * og:image) are resolved to absolute using window.location.origin, since
 * OG/Twitter crawlers don't resolve relative URLs against the page they
 * fetched.
 *
 * `jsonLd`: optional structured-data object (or array of objects) per
 * https://schema.org, e.g. `jsonLd={{ "@context": "https://schema.org",
 * "@type": "Product", ... }}`. Rendered as one <script
 * type="application/ld+json"> per object. Left out entirely (no prop)
 * on pages with nothing meaningful to mark up.
 *
 * WhatsApp link previews (the dominant sharing channel in this market)
 * read Open Graph tags specifically, not Twitter Card tags - og:title/
 * og:description/og:image/og:image:width/og:image:height are the ones
 * that matter most here. Twitter Card tags are included too since
 * they're cheap and some cross-posted links do end up on Twitter/X.
 */
export default function PageMeta({
    title,
    titleOverride,
    description = DEFAULT_DESCRIPTION,
    image,
    type = "website",
    noIndex = false,
    jsonLd
}) {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const pathname = typeof window !== "undefined" ? window.location.pathname : "";
    const search = typeof window !== "undefined" ? window.location.search : "";
    const resolvedTitle = titleOverride || (title ? `${title} · ${SITE_NAME}` : `${SITE_NAME} — Marketplace`);
    const resolvedImage = image
        ? (image.startsWith("http") ? image : `${origin}${image}`)
        : `${origin}${DEFAULT_IMAGE}`;
    const url = typeof window !== "undefined" ? window.location.href : "";
    const canonicalUrl = buildCanonicalUrl(origin, pathname, search);
    const jsonLdBlocks = jsonLd ? (Array.isArray(jsonLd) ? jsonLd : [jsonLd]) : [];

    return (
        <Helmet>
            <title>{resolvedTitle}</title>
            <meta name="description" content={description} />
            {noIndex && <meta name="robots" content="noindex, nofollow" />}
            <link rel="canonical" href={canonicalUrl} />

            {/* Open Graph - read by WhatsApp, Facebook, Telegram, LinkedIn link previews */}
            <meta property="og:site_name" content={SITE_NAME} />
            <meta property="og:type" content={type} />
            <meta property="og:title" content={resolvedTitle} />
            <meta property="og:description" content={description} />
            <meta property="og:image" content={resolvedImage} />
            {!image && (
                <>
                    <meta property="og:image:width" content="1200" />
                    <meta property="og:image:height" content="630" />
                </>
            )}
            <meta property="og:url" content={canonicalUrl} />

            {/* Twitter Card */}
            <meta name="twitter:card" content="summary_large_image" />
            <meta name="twitter:title" content={resolvedTitle} />
            <meta name="twitter:description" content={description} />
            <meta name="twitter:image" content={resolvedImage} />

            {/* JSON-LD structured data (Phase 1, SEO Critical) */}
            {jsonLdBlocks.map((block, index) => (
                <script key={index} type="application/ld+json">
                    {JSON.stringify(block)}
                </script>
            ))}
        </Helmet>
    );
}
