import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("generated screen inventory", () => {
    it("docs/design/screen-inventory.generated.md matches the routes in App.jsx", () => {
        // exits non-zero (and execFileSync throws) when the committed file is stale
        const out = execFileSync("node", ["scripts/generate-screen-inventory.mjs", "--check"], { cwd: process.cwd(), encoding: "utf8" });
        expect(out).toContain("up to date");
    });
});
