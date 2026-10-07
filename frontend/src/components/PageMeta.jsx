import { Helmet } from "react-helmet-async";
import { SITE_NAME, SITE_URL, DEFAULT_DESCRIPTION, normalizePath, toAbsoluteUrl, toOgLocale } from "../utils/seo";
import { useLanguage } from "../context/LanguageContext";

// (Branding): dedicated 1200x630 Open Graph banner.
const DEFAULT_IMAGE = "/og-banner.png";

// Canonical URL: always the configured public origin + the normalized
// path (no trailing slash, no query string). Query strings on this site
// are either campaign/referral tags (utm_*, ref) or listing filters and
// search terms (?search=, ?min_price=, ?sort=) - none of which produce a
// different page worth indexing on its own, so by default they are all
// dropped. A page that genuinely needs a query param to identify its
// content can opt in with `keepParams={["name"]}`.
// Optional Search Console meta-tag verification, set per environment as
// VITE_GSC_VERIFICATION. (The HTML-file method already in /public works
// without it.)
const GSC_VERIFICATION = import.meta.env.VITE_GSC_VERIFICATION || "";

const buildCanonicalUrl = (pathname, search, keepParams = []) => {
    const path = normalizePath(pathname);
    if (!search || keepParams.length === 0) return `${SITE_URL}${path}`;

    const incoming = new URLSearchParams(search);
    const kept = new URLSearchParams();
    for (const name of keepParams) {
        if (incoming.has(name)) kept.set(name, incoming.get(name));
    }
    const query = kept.toString();
    return query ? `${SITE_URL}${path}?${query}` : `${SITE_URL}${path}`;
};

/**
 * Page-level <title> + canonical + Open Graph / Twitter Card meta tags,
 * plus optional JSON-LD structured data.
 *
 * Usage: drop <PageMeta title="..." description="..." /> near the top of
 * any page component. `title` is automatically suffixed with "· NEXORA"
 * (skip the suffix with `titleOverride`, used by the homepage).
 *
 * `noIndex`: private/utility pages - emits "noindex, nofollow".
 * `noIndexFollow`: pages that should stay out of the index but whose
 * links are still worth following (e.g. internal search results).
 *
 * `imageAlt`: alt text for the share image (og:image:alt / twitter:image:alt).
 *
 * `jsonLd`: optional structured-data object (or array of objects) per
 * https://schema.org. Rendered as one <script type="application/ld+json">
 * per object.
 *
 * All URLs (canonical, og:url, og:image) are resolved against SITE_URL
 * (see utils/seo.js) because OG/Twitter crawlers don't resolve relative
 * URLs, and so a non-production host never leaks into the canonical.
 */
export default function PageMeta({
    title,
    titleOverride,
    description,
    image,
    type = "website",
    noIndex = false,
    noIndexFollow = false,
    keepParams = [],
    imageAlt,
    jsonLd
}) {
    // useLanguage() is null outside the provider (isolated tests) - fall back to English.
    const language = useLanguage()?.language || "en";
    const pathname = typeof window !== "undefined" ? window.location.pathname : "/";
    const search = typeof window !== "undefined" ? window.location.search : "";
    const resolvedTitle = titleOverride || (title ? `${title} · ${SITE_NAME}` : `${SITE_NAME} — Marketplace`);
    // `description` can arrive as null/"" from a CMS-backed record - fall
    // back to the site default rather than emitting an empty meta tag.
    const resolvedDescription = description || DEFAULT_DESCRIPTION;
    const resolvedImage = toAbsoluteUrl(image || DEFAULT_IMAGE);
    const canonicalUrl = buildCanonicalUrl(pathname, search, keepParams);
    const jsonLdBlocks = jsonLd ? (Array.isArray(jsonLd) ? jsonLd : [jsonLd]) : [];
    const robots = noIndex ? "noindex, nofollow" : noIndexFollow ? "noindex, follow" : null;

    return (
        <Helmet>
            <title>{resolvedTitle}</title>
            <meta name="description" content={resolvedDescription} />
            {robots && <meta name="robots" content={robots} />}
            <link rel="canonical" href={canonicalUrl} />
            {GSC_VERIFICATION && normalizePath(pathname) === "/" && (
                <meta name="google-site-verification" content={GSC_VERIFICATION} />
            )}

            {/* Open Graph - read by WhatsApp, Facebook, Telegram, LinkedIn link previews */}
            <meta property="og:site_name" content={SITE_NAME} />
            <meta property="og:locale" content={toOgLocale(language)} />
            <meta property="og:type" content={type} />
            <meta property="og:title" content={resolvedTitle} />
            <meta property="og:description" content={resolvedDescription} />
            <meta property="og:image" content={resolvedImage} />
            {!image && (
                <>
                    <meta property="og:image:width" content="1200" />
                    <meta property="og:image:height" content="630" />
                </>
            )}
            {imageAlt && <meta property="og:image:alt" content={imageAlt} />}
            <meta property="og:url" content={canonicalUrl} />

            {/* Twitter Card */}
            <meta name="twitter:card" content="summary_large_image" />
            <meta name="twitter:title" content={resolvedTitle} />
            <meta name="twitter:description" content={resolvedDescription} />
            <meta name="twitter:image" content={resolvedImage} />
            {imageAlt && <meta name="twitter:image:alt" content={imageAlt} />}

            {/* JSON-LD structured data */}
            {jsonLdBlocks.map((block, index) => (
                <script key={index} type="application/ld+json">
                    {JSON.stringify(block)}
                </script>
            ))}
        </Helmet>
    );
}
