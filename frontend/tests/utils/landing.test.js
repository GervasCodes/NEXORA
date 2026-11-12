import { describe, it, expect } from "vitest";
import { landingPathFor } from "../../src/utils/landing";

describe("landingPathFor", () => {
    it.each([["seller", "/seller"], ["delivery_agent", "/delivery"], ["admin", "/admin"]])("%s lands on %s", (role, path) => {
        expect(landingPathFor(role)).toBe(path);
    });
    it.each([["buyer"], [undefined], [null], [""], ["super_admin"], ["anything"]])("%p lands on the home page", (role) => {
        expect(landingPathFor(role)).toBe("/");
    });
    it("only returns in-app paths that are real routes", () => {
        const app = require("node:fs").readFileSync(require("node:path").join(__dirname, "../../src/App.jsx"), "utf8");
        for (const path of ["/seller", "/delivery", "/admin"]) {
            expect(app).toContain(`path="${path}"`);
        }
    });
});
