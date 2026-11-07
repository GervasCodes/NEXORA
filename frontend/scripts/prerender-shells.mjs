// Post-build step: writes a route-specific copy of dist/index.html for each
// static public route (e.g. dist/products/index.html).
//
// Why: NEXORA is a client-rendered SPA, so every URL used to be served the
// same generic shell. Crawlers and link-preview bots that read the raw HTML
// (no JS) therefore saw the homepage's title/description/canonical on every
// page. Each shell below carries that route's own title, description,
// canonical, Open Graph/Twitter tags and a small <noscript> block with a
// heading and plain links.
//
// What it does NOT do: render React. The app still mounts into #root exactly
// as before, so look, behavior and styling are untouched. react-helmet-async
// replaces these head tags (they carry data-rh) with the same values from
// PageMeta once the app runs. Values here mirror each page's <PageMeta>.
//
// Hosting: Render (static site) serves a real file at a path before
// applying the /* -> /index.html rewrite rule, so /products resolves to
// dist/products/index.html rather than falling through to the SPA shell.
//
// Dynamic pages (/products/:slug, /services/:slug, /stores/:slug) ARE
// also generated here as of Round 6 Phase 2 - see the dynamic-shells
// section near the bottom of this file. They're fetched fresh from the
// backend (GET /seo/prerender-shells.json, same visibility rules as
// /sitemap.xml) rather than listed statically like ROUTES below, since
// the catalog changes constantly. A build only ever sees the catalog as
// of whenever this script runs, so freshness depends on how often the
// site gets rebuilt - see backend/src/jobs/renderDeployHook.job.js for
// the scheduled-rebuild side of that.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const SITE_URL = (process.env.VITE_SITE_URL || "https://nexoramarketplace.online").replace(/\/+$/, "");
const SITE_NAME = "NEXORA";

if (!existsSync(join(dist, "index.html"))) {
    console.error("prerender-shells: dist/index.html not found - run after `vite build`.");
    process.exit(1);
}
const template = readFileSync(join(dist, "index.html"), "utf8");

const esc = (v) => String(v).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const NAV = [
    ["/products", "Shop all products"],
    ["/services", "Book services"],
    ["/guides", "Buying guides"],
    ["/group-buys", "Group buys"],
    ["/live-selling", "Live selling"],
    ["/about", "About NEXORA"]
];

// Mirrors the <PageMeta> of each page (title is suffixed like PageMeta does).
const ROUTES = [
    { path: "/products", title: "All Products", description: "Browse every product on NEXORA, an online marketplace in Tanzania, across every department.", h1: "All products" },
    { path: "/services", title: "Book services", description: "Book trusted local services in Tanzania on NEXORA - browse every service category and compare providers.", h1: "Book services" },
    { path: "/sell", title: "Sell on NEXORA", description: "Open a store on NEXORA, list products or services, and reach buyers across Tanzania with tracked delivery and protected payments.", h1: "Sell on NEXORA" },
    { path: "/how-it-works", title: "How NEXORA works", description: "How buying and booking on NEXORA works in Tanzania: find a product or service, pay securely with mobile money, and track your order to your door.", h1: "How NEXORA works" },
    { path: "/about", title: "About NEXORA", description: "NEXORA is an online marketplace in Tanzania where sellers and service providers reach buyers with protected payments and tracked delivery.", h1: "About NEXORA" },
    { path: "/contact", title: "Contact NEXORA", description: "Contact NEXORA support by email or phone for help with an order, an account or selling on the marketplace.", h1: "Contact us" },
    { path: "/guides", title: "Buying guides", description: "Guides and tips to help you shop smarter on NEXORA.", h1: "Buying guides" },
    { path: "/group-buys", title: "Group buys", description: "Join a group buy to unlock a lower price together.", h1: "Group buys" },
    { path: "/live-selling", title: "Live selling", description: "Upcoming live selling sessions from NEXORA sellers.", h1: "Live selling" },
    { path: "/terms", title: "Terms & Conditions", description: "NEXORA Terms & Conditions: terms of service, privacy, refunds, cookies, vendor agreement, delivery liability, insurance and company information in one place.", h1: "Terms & Conditions" }
];

const setTag = (html, pattern, replacement, label) => {
    if (!pattern.test(html)) throw new Error(`prerender-shells: could not find ${label} in dist/index.html`);
    return html.replace(pattern, replacement);
};

// Real page content written INTO #root (React's createRoot replaces it
// on mount, so nothing hydrates and nothing mismatches). Crawlers and
// link-preview bots that read raw HTML now see a heading, the price, the
// description and links - not an empty div. Set PRERENDER_BODY=0 to turn
// it off and fall back to head tags + <noscript> only.
const BODY_ENABLED = process.env.PRERENDER_BODY !== "0";
const SHELL_STYLE = "max-width:48rem;margin:0 auto;padding:1.5rem;font-family:system-ui,-apple-system,Segoe UI,sans-serif;line-height:1.5";

const formatTzs = (value) => `TSh ${Math.round(Number(value)).toLocaleString("en-US")}`;

const bodyHtml = ({ h1, description, kind, bodyDescription, price, inStock, brand, category, storeName, storePath, location, image, imageAlt, path }) => {
    const parts = [`<h1>${esc(h1)}</h1>`];
    if (image) parts.push(`<img src="${esc(image)}" alt="${esc(imageAlt || h1)}" width="320" style="max-width:100%;height:auto" />`);
    if (kind === "product" || kind === "service") {
        const facts = [];
        if (price) facts.push(`${kind === "service" ? "From " : ""}${formatTzs(price)}`);
        if (kind === "product") facts.push(inStock ? "In stock" : "Out of stock");
        if (brand) facts.push(`Brand: ${esc(brand)}`);
        if (category) facts.push(`Category: ${esc(category)}`);
        if (location) facts.push(`Location: ${esc(location)}`);
        if (facts.length) parts.push(`<p>${facts.map((f) => (/[<&]/.test(f) ? f : esc(f))).join(" · ")}</p>`);
    }
    parts.push(`<p>${esc(bodyDescription || description)}</p>`);
    if (storeName && storePath) parts.push(`<p>Sold by <a href="${esc(storePath)}">${esc(storeName)}</a> on NEXORA.</p>`);
    const links = NAV.filter(([href]) => href !== path)
        .map(([href, label]) => `<a href="${href}">${esc(label)}</a>`)
        .join(" · ");
    parts.push(`<nav aria-label="Explore NEXORA"><a href="/">NEXORA home</a> · ${links}</nav>`);
    return `<main data-prerender="true" style="${SHELL_STYLE}">\n        ${parts.join("\n        ")}\n    </main>`;
};

// hreflang alternates: English is the clean URL (and x-default), Kiswahili
// is the same path with ?lang=sw. Mirrors utils/seo.js#buildHreflangLinks.
const hreflangTags = (url) =>
    [
        ["en", url],
        ["sw", `${url}?lang=sw`],
        ["x-default", url]
    ]
        .map(([lang, href]) => `<link rel="alternate" hreflang="${lang}" href="${esc(href)}" data-rh="true" />`)
        .join("\n    ");

const withBody = (html, body) => (BODY_ENABLED ? html.replace('<div id="root"></div>', `<div id="root">\n    ${body}\n    </div>`) : html);

// `image`/`imageAlt` are optional - static ROUTES entries never pass
// them (the template's site-wide og-banner.png default is fine for
// those), but dynamic product/service/store shells do, since a real
// photo meaningfully improves a WhatsApp/Telegram/Facebook link
// preview over the generic banner.
const build = (entry) => {
    const { path, title, description, h1, image, imageAlt } = entry;
    const fullTitle = `${title} · ${SITE_NAME}`;
    const url = `${SITE_URL}${path}`;
    let html = template;

    html = setTag(html, /<title>[\s\S]*?<\/title>/, `<title>${esc(fullTitle)}</title>`, "<title>");
    html = setTag(html, /<meta name="description"[^>]*>/, `<meta name="description" content="${esc(description)}" data-rh="true" />`, "meta description");
    html = setTag(html, /<meta property="og:title"[^>]*>/, `<meta property="og:title" content="${esc(fullTitle)}" data-rh="true" />`, "og:title");
    html = setTag(html, /<meta property="og:description"[^>]*>/, `<meta property="og:description" content="${esc(description)}" data-rh="true" />`, "og:description");
    html = setTag(html, /<meta name="twitter:title"[^>]*>/, `<meta name="twitter:title" content="${esc(fullTitle)}" data-rh="true" />`, "twitter:title");
    html = setTag(html, /<meta name="twitter:description"[^>]*>/, `<meta name="twitter:description" content="${esc(description)}" data-rh="true" />`, "twitter:description");

    if (image) {
        // Real photo of unknown dimensions - swap the image URL but drop
        // the hardcoded 1200x630 width/height (those described the
        // static og-banner.png, not this photo) rather than claim a
        // size that may be wrong.
        html = setTag(html, /<meta property="og:image"[^>]*>/, `<meta property="og:image" content="${esc(image)}" data-rh="true" />`, "og:image");
        html = html.replace(/\s*<meta property="og:image:width"[^>]*>\n?/, "\n");
        html = html.replace(/\s*<meta property="og:image:height"[^>]*>\n?/, "\n");
        html = setTag(html, /<meta name="twitter:image"[^>]*>/, `<meta name="twitter:image" content="${esc(image)}" data-rh="true" />`, "twitter:image");
        if (imageAlt) {
            html = html.replace(
                /(<meta property="og:image"[^>]*>)/,
                `$1\n    <meta property="og:image:alt" content="${esc(imageAlt)}" data-rh="true" />`
            );
            html = html.replace(
                /(<meta name="twitter:image"[^>]*>)/,
                `$1\n    <meta name="twitter:image:alt" content="${esc(imageAlt)}" data-rh="true" />`
            );
        }
    }

    // canonical + hreflang + og:url, inserted right after the description tag
    html = html.replace(
        /(<meta name="description"[^>]*>)/,
        `$1\n    <link rel="canonical" href="${esc(url)}" data-rh="true" />\n    ${hreflangTags(url)}\n    <meta property="og:url" content="${esc(url)}" data-rh="true" />`
    );

    const links = NAV.filter(([href]) => href !== path)
        .map(([href, label]) => `<a href="${href}">${esc(label)}</a>`)
        .join(" · ");
    html = setTag(
        html,
        /<noscript>[\s\S]*?<\/noscript>/,
        `<noscript>\n        <h1>${esc(h1)}</h1>\n        <p>${esc(description)} NEXORA needs JavaScript enabled to run.</p>\n        <nav aria-label="Explore NEXORA"><a href="/">NEXORA home</a> · ${links}</nav>\n    </noscript>`,
        "<noscript> block"
    );
    return withBody(html, bodyHtml({ ...entry, path }));
};

for (const route of ROUTES) {
    const dir = join(dist, ...route.path.split("/").filter(Boolean));
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "index.html"), build(route));
}

// The homepage shell itself gets a canonical, hreflang and og:url too.
const homeHtml = template.replace(
    /(<meta name="description"[^>]*>)/,
    `$1\n    <link rel="canonical" href="${SITE_URL}/" data-rh="true" />\n    ${hreflangTags(`${SITE_URL}/`)}\n    <meta property="og:url" content="${SITE_URL}/" data-rh="true" />`
);
const homeDescription = /<meta name="description" content="([^"]*)"/.exec(template)?.[1] || "";
const homeBody = bodyHtml({
    h1: "NEXORA — Online marketplace in Tanzania",
    // `template` already holds this text HTML-escaped; unescape the two
    // entities index.html uses so esc() doesn't double-encode it.
    description: homeDescription.replace(/&amp;/g, "&").replace(/&quot;/g, '"'),
    path: "/"
});
writeFileSync(join(dist, "index.html"), withBody(homeHtml, homeBody));

console.log(`prerender-shells: wrote ${ROUTES.length} static route shells + canonical on /`);

// --- Dynamic shells (Round 6 Phase 2) ---------------------------------
// Product/service/store pages, fetched fresh from the backend at build
// time. Never fails the build: a missing API_URL or an unreachable/
// erroring backend just means this build keeps whatever dynamic shells
// the PREVIOUS deploy already wrote (or none, on a first-ever build) -
// the static shells above (and the app itself) are unaffected either way.
const API_URL = (process.env.VITE_API_URL || "http://localhost:5000/api/v1").replace(/\/api\/v1\/?$/, "");

const writeDynamicShells = async () => {
    let entries;
    try {
        const res = await fetch(`${API_URL}/seo/prerender-shells.json`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        ({ entries } = await res.json());
    } catch (err) {
        console.warn(`prerender-shells: skipping dynamic shells - ${err.message}`);
        return;
    }

    let written = 0;
    for (const entry of entries || []) {
        try {
            const dir = join(dist, ...entry.path.split("/").filter(Boolean));
            mkdirSync(dir, { recursive: true });
            writeFileSync(join(dir, "index.html"), build({ ...entry, h1: entry.title }));
            written += 1;
        } catch (err) {
            // One bad entry (e.g. an unusual slug) shouldn't take the
            // rest of the catalog down with it.
            console.warn(`prerender-shells: skipped ${entry.path} - ${err.message}`);
        }
    }
    console.log(`prerender-shells: wrote ${written} dynamic route shell(s) from ${API_URL}`);
};

await writeDynamicShells();
