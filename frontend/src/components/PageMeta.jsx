import { Helmet } from "react-helmet-async";

const SITE_NAME = "NEXORA";
const DEFAULT_DESCRIPTION =
    "NEXORA — a regional multi-vendor marketplace connecting buyers, sellers, and delivery partners.";
// Phase 6 (Branding): dedicated 1200x630 Open Graph banner - replaces the
// icon-512.png fallback used while no banner existed.
const DEFAULT_IMAGE = "/og-banner.png";

/**
 * Page-level <title> + Open Graph / Twitter Card meta tags -
 * Phase 2 Metadata & Error Polish.
 *
 * Usage: drop <PageMeta title="..." description="..." /> near the top of
 * any page component. `title` is automatically suffixed with "· NEXORA"
 * (skip the suffix with `titleOverride` for the homepage, which should
 * just be "NEXORA — Marketplace"). All URLs (canonical + og:url,
 * og:image) are resolved to absolute using window.location.origin, since
 * OG/Twitter crawlers don't resolve relative URLs against the page they
 * fetched.
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
    noIndex = false
}) {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const resolvedTitle = titleOverride || (title ? `${title} · ${SITE_NAME}` : `${SITE_NAME} — Marketplace`);
    const resolvedImage = image
        ? (image.startsWith("http") ? image : `${origin}${image}`)
        : `${origin}${DEFAULT_IMAGE}`;
    const url = typeof window !== "undefined" ? window.location.href : "";

    return (
        <Helmet>
            <title>{resolvedTitle}</title>
            <meta name="description" content={description} />
            {noIndex && <meta name="robots" content="noindex, nofollow" />}

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
            <meta property="og:url" content={url} />

            {/* Twitter Card */}
            <meta name="twitter:card" content="summary_large_image" />
            <meta name="twitter:title" content={resolvedTitle} />
            <meta name="twitter:description" content={description} />
            <meta name="twitter:image" content={resolvedImage} />
        </Helmet>
    );
}
