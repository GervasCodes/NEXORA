jest.mock("../../../src/config/db", () => ({ query: jest.fn(), getConnection: jest.fn() }));
jest.mock("../../../src/modules/stock/stock.ledger", () => {
    const actual = jest.requireActual("../../../src/modules/stock/stock.ledger");
    return { ...actual, withTransaction: jest.fn(), checkIdempotency: jest.fn(), lockByItem: jest.fn(), applyDelta: jest.fn(), setStock: jest.fn(), findItem: jest.fn() };
});
jest.mock("../../../src/modules/settings/settings.service", () => ({ getStockDefaultReorderLevel: jest.fn().mockResolvedValue(5) }));
jest.mock("../../../src/modules/productAlert/productAlert.service", () => ({
    checkAndNotifyStockChange: jest.fn().mockResolvedValue(undefined)
}));

const db = require("../../../src/config/db");
const ledger = require("../../../src/modules/stock/stock.ledger");
const stockService = require("../../../src/modules/stock/stock.service");

const itemRow = (over = {}) => ({
    id: 1, source: "external", product_id: null, variant_id: null, display_name: "Bag", sku: null, barcode: null, unit: "pcs",
    cost_price: null, reorder_level: 5, is_archived: 0, stock: 3, sell_price: 1000, variant_options: null, ...over
});

describe("stock.service", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        ledger.withTransaction.mockImplementation(async (work) => work({ query: jest.fn().mockResolvedValue([{ insertId: 1 }]) }));
    });

    describe("getItem / shape", () => {
        it("flags low and out of stock from the item's own reorder level", async () => {
            db.query.mockResolvedValueOnce([[itemRow({ stock: 3, reorder_level: 5 })]]);
            expect((await stockService.getItem(1, 1)).is_low).toBe(true);
            db.query.mockResolvedValueOnce([[itemRow({ stock: 0 })]]);
            const out = await stockService.getItem(1, 1);
            expect(out.is_out).toBe(true);
            expect(out.is_low).toBe(false);
            db.query.mockResolvedValueOnce([[itemRow({ stock: 9, reorder_level: 5 })]]);
            expect((await stockService.getItem(1, 1)).is_low).toBe(false);
        });

        it("treats a nexora item whose listing is gone as external, and 404s for another seller's item", async () => {
            db.query.mockResolvedValueOnce([[itemRow({ source: "nexora", product_id: null })]]);
            expect((await stockService.getItem(1, 1)).source).toBe("external");
            db.query.mockResolvedValueOnce([[]]);
            await expect(stockService.getItem(1, 99)).rejects.toMatchObject({ statusCode: 404 });
        });
    });

    describe("updateItem", () => {
        it("does not let name or selling price be edited on a Nexora-listed item", async () => {
            db.query.mockResolvedValueOnce([[itemRow({ source: "nexora", product_id: 5 })]]);
            await expect(stockService.updateItem(1, 1, { name: "New" })).rejects.toMatchObject({ statusCode: 409 });
        });

        it("rejects a bad reorder level", async () => {
            db.query.mockResolvedValueOnce([[itemRow()]]);
            await expect(stockService.updateItem(1, 1, { reorderLevel: -1 })).rejects.toThrow(/Reorder level/);
        });
    });

    describe("adjust", () => {
        const target = { kind: "item", product: null, item: { id: 1, seller_id: 1 }, stock: 4 };

        it("replays an earlier request with the same key instead of moving stock twice", async () => {
            ledger.checkIdempotency.mockResolvedValue({ id: 50 });
            const result = await stockService.adjust(1, 1, { type: "purchase", quantity: 3, idempotencyKey: "key-12345" });
            expect(result.replayed).toBe(true);
            expect(ledger.applyDelta).not.toHaveBeenCalled();
        });

        it("surfaces a key reused with a different body", async () => {
            ledger.checkIdempotency.mockRejectedValue(Object.assign(new Error("different change"), { statusCode: 409 }));
            await expect(stockService.adjust(1, 1, { type: "purchase", quantity: 3, idempotencyKey: "key-12345" }))
                .rejects.toMatchObject({ statusCode: 409 });
        });

        it("posts a purchase as a positive delta with the unit cost", async () => {
            ledger.checkIdempotency.mockResolvedValue(null);
            ledger.lockByItem.mockResolvedValue(target);
            ledger.applyDelta.mockResolvedValue({ stockBefore: 4, stockAfter: 7, quantityChange: 3 });
            db.query.mockResolvedValue([[itemRow()]]);

            const result = await stockService.adjust(1, 1, { type: "purchase", quantity: 3, unitCost: 250 });
            expect(ledger.applyDelta).toHaveBeenCalledWith(expect.anything(), target, 3, expect.objectContaining({ type: "purchase", unitCost: 250 }));
            expect(result.replayed).toBe(false);
        });

        it("posts a correction through setStock (with the baseline) and rejects a no-change count", async () => {
            ledger.checkIdempotency.mockResolvedValue(null);
            ledger.lockByItem.mockResolvedValue(target);
            ledger.setStock.mockResolvedValue({ stockBefore: 4, stockAfter: 9, quantityChange: 5 });
            db.query.mockResolvedValue([[itemRow()]]);
            await stockService.adjust(1, 1, { type: "correction", newStock: 9, baseline: 4 });
            expect(ledger.setStock).toHaveBeenCalledWith(expect.anything(), target, 9, expect.objectContaining({ baseline: 4 }));

            ledger.setStock.mockResolvedValue(null);
            await expect(stockService.adjust(1, 1, { type: "correction", newStock: 4 })).rejects.toThrow(/nothing to correct/);
        });

        it("rejects types the seller cannot post by hand and non-positive quantities", async () => {
            await expect(stockService.adjust(1, 1, { type: "sale", quantity: 1 })).rejects.toThrow(/Invalid movement type/);
            ledger.checkIdempotency.mockResolvedValue(null);
            ledger.lockByItem.mockResolvedValue(target);
            await expect(stockService.adjust(1, 1, { type: "purchase", quantity: 0 })).rejects.toThrow(/greater than zero/);
        });
    });

    describe("listOnNexora / unlink guards", () => {
        it("refuses to list an item that is already on Nexora", async () => {
            ledger.findItem.mockResolvedValue({ id: 1, source: "nexora", product_id: 5, stock: 2, name: "Bag", sell_price: 100 });
            await expect(stockService.listOnNexora(1, 1)).rejects.toMatchObject({ statusCode: 409 });
        });

        it("refuses to list another seller's / missing item", async () => {
            ledger.findItem.mockResolvedValue(undefined);
            await expect(stockService.listOnNexora(1, 1)).rejects.toMatchObject({ statusCode: 404 });
        });

        it("refuses to unlink an item that is not sold on Nexora", async () => {
            ledger.findItem.mockResolvedValue({ id: 1, source: "external", product_id: null });
            await expect(stockService.unlink(1, 1)).rejects.toMatchObject({ statusCode: 409 });
        });

        it("creates a draft listing, moves the stock with two ledger rows, and links the item", async () => {
            ledger.findItem.mockResolvedValue({ id: 1, source: "external", product_id: null, legacy_product_id: null, stock: 6, name: "Bag", sell_price: 1500 });
            const queries = [];
            ledger.withTransaction.mockImplementation(async (work) => work({
                query: jest.fn(async (sql, params) => { queries.push([sql, params]); return [{ insertId: 77 }]; })
            }));
            const result = await stockService.listOnNexora(1, 1, { categoryId: 4 });
            expect(result).toEqual({ item_id: 1, product_id: 77 });
            expect(queries.filter(([sql]) => sql.includes("INSERT INTO stock_movements"))).toHaveLength(2);
            const link = queries.find(([sql]) => sql.startsWith("UPDATE stock_items SET source = 'nexora'"));
            expect(link[1]).toEqual([77, "77-0", 1]);
        });
    });
});
