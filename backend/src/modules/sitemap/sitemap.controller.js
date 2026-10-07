const sitemapService = require("./sitemap.service");

// Phase 1 (SEO Critical). Public, unauthenticated, crawler-facing.
// Mounted in app.js as GET /sitemap.xml (outside /api/v1 on purpose).
// Errors are returned as plain text rather than the JSON envelope the
// rest of the API uses, since the consumer here is a crawler, not the
// frontend, and an XML parser would choke on a JSON body.
exports.getSitemap = async (req, res) => {
    try {
        const xml = await sitemapService.getSitemapXml();
        res.set("Content-Type", "application/xml; charset=utf-8");
        res.send(xml);
    } catch (err) {
        res.status(500).type("text/plain").send("Sitemap temporarily unavailable");
    }
};

// GET /sitemap-<n>.xml: child files of the sitemap index (only exist once
// the catalogue outgrows a single file - otherwise this is a 404).
exports.getSitemapPart = async (req, res) => {
    try {
        const part = Number(req.params[0]);
        const xml = Number.isInteger(part) && part > 0 ? await sitemapService.getSitemapXml(part) : null;
        if (!xml) return res.status(404).type("text/plain").send("Not found");
        res.set("Content-Type", "application/xml; charset=utf-8");
        res.send(xml);
    } catch (err) {
        res.status(500).type("text/plain").send("Sitemap temporarily unavailable");
    }
};
