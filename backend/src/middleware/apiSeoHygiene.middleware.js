// Keeps the API host (api.nexoramarketplace.online) out of Google's index.
//
// Why: product/store JSON, /health and the welcome message live on a public host.
// Anything that links to them can get them crawled and listed, which shows up in
// Search Console as junk "Crawled - currently not indexed" / "Indexed, not
// submitted in sitemap" rows and wastes crawl budget.
//
// X-Robots-Tag: noindex is added to every response EXCEPT the files crawlers are
// supposed to read (sitemaps and robots.txt). The storefront's own HTML pages are
// served by the static site, not by this app, so they are unaffected.

const CRAWLER_FILES = [/^\/sitemap\.xml$/, /^\/sitemap-\d+\.xml$/, /^\/robots\.txt$/];

const isCrawlerFile = (path) => CRAWLER_FILES.some((re) => re.test(path));

exports.noIndexApi = (req, res, next) => {
    if (!isCrawlerFile(req.path)) res.set("X-Robots-Tag", "noindex, nofollow");
    next();
};

// The API host has nothing worth crawling: tell every crawler so.
exports.apiRobots = (req, res) => {
    res.type("text/plain").set("Cache-Control", "public, max-age=86400").send("User-agent: *\nDisallow: /\n");
};

exports.isCrawlerFile = isCrawlerFile;
