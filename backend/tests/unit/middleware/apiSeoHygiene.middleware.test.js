const { noIndexApi, apiRobots, isCrawlerFile } = require("../../../src/middleware/apiSeoHygiene.middleware");

const mockRes = () => {
    const res = { headers: {} };
    res.set = jest.fn((k, v) => { res.headers[k] = v; return res; });
    res.type = jest.fn().mockReturnValue(res);
    res.send = jest.fn().mockReturnValue(res);
    return res;
};

describe("apiSeoHygiene.middleware", () => {
    it("adds noindex to API responses", () => {
        for (const path of ["/", "/health", "/api/v1/products", "/seo/prerender-shells.json"]) {
            const res = mockRes();
            const next = jest.fn();
            noIndexApi({ path }, res, next);
            expect(res.headers["X-Robots-Tag"]).toBe("noindex, nofollow");
            expect(next).toHaveBeenCalled();
        }
    });

    it("never adds noindex to the sitemap files or robots.txt", () => {
        for (const path of ["/sitemap.xml", "/sitemap-1.xml", "/sitemap-12.xml", "/robots.txt"]) {
            const res = mockRes();
            const next = jest.fn();
            noIndexApi({ path }, res, next);
            expect(res.headers["X-Robots-Tag"]).toBeUndefined();
            expect(next).toHaveBeenCalled();
            expect(isCrawlerFile(path)).toBe(true);
        }
    });

    it("serves a Disallow-all robots.txt for the API host", () => {
        const res = mockRes();
        apiRobots({}, res);
        expect(res.type).toHaveBeenCalledWith("text/plain");
        expect(res.send).toHaveBeenCalledWith("User-agent: *\nDisallow: /\n");
    });
});
