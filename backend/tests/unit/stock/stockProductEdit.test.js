const fs = require("fs");
const path = require("path");
const read = (p) => fs.readFileSync(path.join(__dirname, "../../../src", p), "utf8");

// Phase 6 "fix first": no published-product stock write may bypass the ledger.
describe("stock edits go through the ledger", () => {
    it("product.repository.update no longer writes stock", () => {
        const src = read("modules/product/product.repository.js");
        const start = src.indexOf("exports.update = async");
        const block = src.slice(start, start + 900);
        // Only the allow-list matters (a comment next to it may mention "stock").
        const allowed = block.match(/const allowed = \[([\s\S]*?)\];/);
        expect(allowed).not.toBeNull();
        expect(allowed[1]).not.toMatch(/"stock"/);
    });

    it("product.service.updateProduct sends stock to the ledger, with the form baseline", () => {
        const src = read("modules/product/product.service.js");
        expect(src).toMatch(/stockLedger\.setStock\(connection, target, requestedStock/);
        expect(src).toMatch(/baseline: stockBaseline/);
    });

    it("variant replace no longer overwrites stock of published products", () => {
        const src = read("modules/productVariant/productVariant.repository.js");
        expect(src).toMatch(/stockLedger\.setStock/);
        expect(src).toMatch(/draftStock/);
    });

    it("classic POS uses the ledger for adjustments and sales and checks the request hash", () => {
        const src = read("modules/pos/pos.service.js");
        expect(src).toMatch(/stockLedger\.applyDelta/);
        expect(src).toMatch(/assertSameRequest/);
        expect(src).not.toMatch(/setProductStock|setVariantStock/);
    });

    it("checkout and cancellation write order_deduct / order_restore rows", () => {
        const src = read("modules/order/order.repository.js");
        expect(src).toMatch(/"order_deduct"/);
        expect(src).toMatch(/"order_restore"/);
    });
});
