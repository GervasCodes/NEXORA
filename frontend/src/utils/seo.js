// Single source of truth for the site's public identity, used by
// PageMeta.jsx and any page that builds its own structured data.
//
// SITE_URL is the canonical public origin. Canonical <link>s, og:url and
// og:image are all built from it rather than window.location.origin, so
// a visit through a preview deploy, a www/non-www variant or an IP never
// produces a canonical that points at the wrong host. Override with
// VITE_SITE_URL at build time if the production domain ever changes.
export const SITE_NAME = "NEXORA";

export const SITE_URL = (import.meta.env?.VITE_SITE_URL || "https://nexoramarketplace.online").replace(/\/+$/, "");

export const DEFAULT_DESCRIPTION =
    "NEXORA  a regional multi-vendor marketplace connecting buyers, sellers, and delivery partners.";

// Official NEXORA profiles (same accounts linked from Footer.jsx, with
// share/tracking query strings removed). Facebook is intentionally left
// out: the footer only has a facebook.com/share/... link, which is a
// redirect rather than the profile's own URL.
export const ORGANIZATION_SAME_AS = [
    "https://www.instagram.com/nexora.marketplace",
    "https://www.tiktok.com/@nexoramarketplace4",
    "https://www.youtube.com/@Nexoramarketplace"
];

// "/products/" and "/products" are the same page; the canonical (and the
// sitemap) use the form without a trailing slash, except for the root.
export const normalizePath = (pathname = "/") => {
    if (!pathname) return "/";
    const trimmed = pathname.replace(/\/+$/, "");
    return trimmed === "" ? "/" : trimmed;
};

export const toAbsoluteUrl = (value) => {
    if (!value) return "";
    if (/^https?:\/\//i.test(value)) return value;
    return `${SITE_URL}${value.startsWith("/") ? value : `/${value}`}`;
};

// items: [{ label, href? }] - same shape the Breadcrumbs component takes.
// The last item is the current page; its URL is the page's own canonical,
// so it is passed in rather than guessed.
export const buildBreadcrumbJsonLd = (items = [], currentPath) => ({
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => {
        const isLast = index === items.length - 1;
        const href = item.href || (isLast ? currentPath : undefined);
        return {
            "@type": "ListItem",
            position: index + 1,
            name: item.label,
            ...(href ? { item: toAbsoluteUrl(href) } : {})
        };
    })
});

// og:locale values for the two languages the app ships.
export const OG_LOCALES = { en: "en_US", sw: "sw_TZ" };
export const toOgLocale = (language) => OG_LOCALES[language] || OG_LOCALES.en;

// Trims text to a meta-description length without cutting a word in half.
export const clipDescription = (text, max = 160) => {
    const clean = String(text || "").replace(/\s+/g, " ").trim();
    if (clean.length <= max) return clean;
    const cut = clean.slice(0, max - 1);
    const lastSpace = cut.lastIndexOf(" ");
    return `${(lastSpace > 80 ? cut.slice(0, lastSpace) : cut).replace(/[,;:.\-\s]+$/, "")}…`;
};

// Pages the shopper can reach with ?page=N. Page 1 is the clean URL.
export const readPageParam = (searchParams) => {
    const value = parseInt(searchParams.get("page"), 10);
    return Number.isFinite(value) && value > 1 ? value : 1;
};

// CollectionPage + ItemList for a department / service category listing.
// items: [{ name, path }] (path is the item's own page, resolved to absolute).
export const buildCollectionJsonLd = ({ name, description, path, items = [] }) => ({
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name,
    ...(description ? { description } : {}),
    url: toAbsoluteUrl(path),
    isPartOf: { "@id": `${SITE_URL}/#website` },
    ...(items.length
        ? {
            mainEntity: {
                "@type": "ItemList",
                numberOfItems: items.length,
                itemListElement: items.map((item, index) => ({
                    "@type": "ListItem",
                    position: index + 1,
                    url: toAbsoluteUrl(item.path),
                    name: item.name
                }))
            }
        }
        : {})
});

// Reading time at a typical 200 words per minute, never less than a minute.
export const estimateReadingMinutes = (text) => {
    const words = String(text || "").trim().split(/\s+/).filter(Boolean).length;
    return Math.max(1, Math.round(words / 200));
};

export const toIsoDate = (value) => {
    if (!value) return undefined;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
};
