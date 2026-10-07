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
// Hosting: Netlify serves a real file before applying the /* -> /index.html
// rewrite, so /products resolves to dist/products/index.html.
//
// Dynamic pages (/products/:slug, /services/:slug, /stores/:slug, ...) are
// database-driven and are not generated here.
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
    ["/legal/company-information", "About NEXORA"]
];

const legal = (slug, title) => ({
    path: `/legal/${slug}`,
    title,
    description: `${title} for buyers, sellers and delivery partners on NEXORA.`,
    h1: title
});

// Mirrors the <PageMeta> of each page (title is suffixed like PageMeta does).
const ROUTES = [
    { path: "/products", title: "All Products", description: "Browse every product on NEXORA, across every department.", h1: "All products" },
    { path: "/services", title: "Book services", description: "Book trusted local services on NEXORA - browse every service category and compare providers.", h1: "Book services" },
    { path: "/sell", title: "Sell on NEXORA", description: "Open a store on NEXORA, list products or services, and reach buyers with tracked delivery and protected payments.", h1: "Sell on NEXORA" },
    { path: "/how-it-works", title: "How NEXORA works", description: "How buying and booking on NEXORA works: find a product or service, pay securely, and track your order to your door.", h1: "How NEXORA works" },
    { path: "/about", title: "About NEXORA", description: "NEXORA is an online marketplace where sellers and service providers reach buyers with protected payments and tracked delivery.", h1: "About NEXORA" },
    { path: "/contact", title: "Contact NEXORA", description: "Contact NEXORA support by email or phone for help with an order, an account or selling on the marketplace.", h1: "Contact us" },
    { path: "/guides", title: "Buying guides", description: "Guides and tips to help you shop smarter on NEXORA.", h1: "Buying guides" },
    { path: "/group-buys", title: "Group buys", description: "Join a group buy to unlock a lower price together.", h1: "Group buys" },
    { path: "/live-selling", title: "Live selling", description: "Upcoming live selling sessions from NEXORA sellers.", h1: "Live selling" },
    legal("company-information", "Company Information"),
    legal("terms-of-service", "Terms of Service"),
    legal("privacy-policy", "Privacy Policy"),
    legal("refund-policy", "Refund Policy"),
    legal("cookie-policy", "Cookie Policy"),
    legal("vendor-agreement", "Vendor Agreement"),
    legal("delivery-liability-policy", "Delivery Liability Policy"),
    legal("insurance-policy", "Insurance Policy")
];

const setTag = (html, pattern, replacement, label) => {
    if (!pattern.test(html)) throw new Error(`prerender-shells: could not find ${label} in dist/index.html`);
    return html.replace(pattern, replacement);
};

const build = ({ path, title, description, h1 }) => {
    const fullTitle = `${title} · ${SITE_NAME}`;
    const url = `${SITE_URL}${path}`;
    let html = template;

    html = setTag(html, /<title>[\s\S]*?<\/title>/, `<title>${esc(fullTitle)}</title>`, "<title>");
    html = setTag(html, /<meta name="description"[^>]*>/, `<meta name="description" content="${esc(description)}" data-rh="true" />`, "meta description");
    html = setTag(html, /<meta property="og:title"[^>]*>/, `<meta property="og:title" content="${esc(fullTitle)}" data-rh="true" />`, "og:title");
    html = setTag(html, /<meta property="og:description"[^>]*>/, `<meta property="og:description" content="${esc(description)}" data-rh="true" />`, "og:description");
    html = setTag(html, /<meta name="twitter:title"[^>]*>/, `<meta name="twitter:title" content="${esc(fullTitle)}" data-rh="true" />`, "twitter:title");
    html = setTag(html, /<meta name="twitter:description"[^>]*>/, `<meta name="twitter:description" content="${esc(description)}" data-rh="true" />`, "twitter:description");

    // canonical + og:url, inserted right after the description tag
    html = html.replace(
        /(<meta name="description"[^>]*>)/,
        `$1\n    <link rel="canonical" href="${esc(url)}" data-rh="true" />\n    <meta property="og:url" content="${esc(url)}" data-rh="true" />`
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
    return html;
};

for (const route of ROUTES) {
    const dir = join(dist, ...route.path.split("/").filter(Boolean));
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "index.html"), build(route));
}

// The homepage shell itself gets a canonical + og:url too.
const home = template.replace(
    /(<meta name="description"[^>]*>)/,
    `$1\n    <link rel="canonical" href="${SITE_URL}/" data-rh="true" />\n    <meta property="og:url" content="${SITE_URL}/" data-rh="true" />`
);
writeFileSync(join(dist, "index.html"), home);

console.log(`prerender-shells: wrote ${ROUTES.length} route shells + canonical on /`);
