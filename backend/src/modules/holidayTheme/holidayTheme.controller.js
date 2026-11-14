const holidayThemeService = require("./holidayTheme.service");

// Public (no login): the storefront asks this on load to decide whether to draw
// the Christmas / New Year theme. A minute of browser/CDN caching keeps it
// cheap; the cost is that turning the theme off can take up to a minute to
// reach visitors who already loaded the page.
exports.getPublic = async (req, res) => {
    try {
        const data = await holidayThemeService.getPublicStatus();
        res.set("Cache-Control", "public, max-age=60");
        return res.json({ success: true, data });
    } catch (error) {
        // Decorative feature: the storefront treats any failure as "off".
        return res.status(503).json({ success: false, message: "Holiday theme status is temporarily unavailable." });
    }
};
