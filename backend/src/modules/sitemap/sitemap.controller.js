const sitemapService = require("./sitemap.service");
const logger = require("../../utils/logger").child({ module: "sitemap" });

// Public — GET /sitemap.xml (mounted at the app root in app.js, not
// under /api/v1: search engines request this exact path, so it can't
// live behind the API prefix or require the frontend to know an API
// route shape).
exports.getSitemap = async (req, res) => {
    try {
        const xml = await sitemapService.getSitemapXml();
        res.set("Content-Type", "application/xml; charset=utf-8");
        res.send(xml);
    } catch (error) {
        logger.error({ err: error }, "sitemap generation failed");
        // A broken sitemap endpoint shouldn't surface as a JSON API
        // error page to a crawler - an empty-but-valid urlset is a
        // safer failure mode than a 500 with an HTML/JSON error body,
        // which some crawlers mis-parse as sitemap content.
        res.status(500)
            .set("Content-Type", "application/xml; charset=utf-8")
            .send('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>\n');
    }
};
