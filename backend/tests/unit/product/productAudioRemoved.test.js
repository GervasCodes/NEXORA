const express = require("express");
const request = require("supertest");

jest.mock("../../../src/modules/product/product.service");
jest.mock("../../../src/middleware/auth.middleware", () => (req, res, next) => next());

describe("removed product audio routes", () => {
    it("return 410 Gone with a clear code", async () => {
        let router;
        jest.isolateModules(() => {
            router = require("../../../src/modules/product/product.routes");
        });
        const app = express();
        app.use("/products", router);
        for (const [method, url] of [["post", "/products/5/audio"], ["delete", "/products/5/audio/2"], ["put", "/products/5/audio/reorder"]]) {
            const res = await request(app)[method](url);
            expect(res.status).toBe(410);
            expect(res.body.code).toBe("PRODUCT_AUDIO_REMOVED");
        }
    });
});
