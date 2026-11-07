import { describe, it, expect, vi, beforeEach } from "vitest";
import "fake-indexeddb/auto";

const api = vi.hoisted(() => ({ syncOfflineSales: vi.fn(), newRequestId: vi.fn(() => "generated-id-0001") }));
vi.mock("../../src/api/stock", () => api);

import { cacheItems, discardQueued, flushQueue, isPersistent, listQueue, queueCounts, queueSale, resetForTests, searchCachedItems, subscribeQueue } from "../../src/utils/stockOfflineStore";

const sale = (key, extra = {}) => ({ idempotency_key: key, lines: [{ item_id: 1, quantity: 2 }], payment_method: "cash", sold_at: "2026-10-27T10:00:00.000Z", ...extra });
const summary = { total: 5000, lines: [{ name: "Bag", quantity: 2 }] };

describe("stockOfflineStore", () => {
    beforeEach(async () => { vi.clearAllMocks(); await resetForTests(); });

    it("keeps queued sales in IndexedDB, oldest first, with the request id the caller made", async () => {
        expect(await isPersistent()).toBe(true);
        await queueSale(sale("key-aaaa-0001"), summary);
        await new Promise((r) => setTimeout(r, 5));
        await queueSale(sale("key-aaaa-0002"), summary);
        const q = await listQueue();
        expect(q.map((e) => e.key)).toEqual(["key-aaaa-0001", "key-aaaa-0002"]);
        expect(q[0]).toMatchObject({ status: "pending", summary });
        expect(await queueCounts()).toEqual({ pending: 2, rejected: 0 });
    });

    it("makes a request id when the sale has none", async () => {
        const e = await queueSale({ lines: [] }, null);
        expect(e.key).toBe("generated-id-0001");
        expect(e.payload.idempotency_key).toBe("generated-id-0001");
    });

    it("sends the queue, removes what the server recorded (created or replayed), reports flagged stock", async () => {
        await queueSale(sale("key-aaaa-0001"), summary);
        await queueSale(sale("key-aaaa-0002"), summary);
        api.syncOfflineSales.mockResolvedValue({ results: [
            { key: "key-aaaa-0001", status: "created", stock_flagged: true },
            { key: "key-aaaa-0002", status: "replayed" }
        ] });
        const r = await flushQueue();
        expect(r).toMatchObject({ synced: 1, replayed: 1, rejected: 0, flagged: 1, remaining: 0, blocked: null });
        expect(await listQueue()).toEqual([]);
        expect(api.syncOfflineSales).toHaveBeenCalledWith([expect.objectContaining({ idempotency_key: "key-aaaa-0001" }), expect.objectContaining({ idempotency_key: "key-aaaa-0002" })]);
    });

    it("keeps a sale the server rejected, marked with the reason, and doesn't resend it", async () => {
        await queueSale(sale("key-aaaa-0001"), summary);
        api.syncOfflineSales.mockResolvedValue({ results: [{ key: "key-aaaa-0001", status: "rejected", message: "Choose a customer." }] });
        const r = await flushQueue();
        expect(r.rejected).toBe(1);
        expect(await queueCounts()).toEqual({ pending: 0, rejected: 1 });
        api.syncOfflineSales.mockClear();
        await flushQueue();
        expect(api.syncOfflineSales).not.toHaveBeenCalled();
        await discardQueued("key-aaaa-0001");
        expect(await listQueue()).toEqual([]);
    });

    it("leaves everything queued when there is no connection, and says why", async () => {
        await queueSale(sale("key-aaaa-0001"), summary);
        api.syncOfflineSales.mockRejectedValue(new Error("Network Error")); // no err.response
        expect((await flushQueue()).blocked).toBe("offline");
        expect(await queueCounts()).toEqual({ pending: 1, rejected: 0 });
    });

    it("leaves everything queued on a server error or a plan that blocks writes", async () => {
        await queueSale(sale("key-aaaa-0001"), summary);
        api.syncOfflineSales.mockRejectedValueOnce({ response: { status: 500, data: {} } });
        expect((await flushQueue()).blocked).toBe("server");
        api.syncOfflineSales.mockRejectedValueOnce({ response: { status: 403, data: { code: "SUBSCRIPTION_REQUIRED" } } });
        expect((await flushQueue()).blocked).toBe("plan");
        expect(await queueCounts()).toEqual({ pending: 1, rejected: 0 });
    });

    it("a sale the server didn't answer for stays queued", async () => {
        await queueSale(sale("key-aaaa-0001"), summary);
        api.syncOfflineSales.mockResolvedValue({ results: [] });
        await flushQueue();
        expect((await queueCounts()).pending).toBe(1);
    });

    it("sends in batches of 50", async () => {
        for (let i = 0; i < 120; i += 1) await queueSale(sale(`key-${String(i).padStart(4, "0")}-aaaa`), summary);
        api.syncOfflineSales.mockImplementation(async (batch) => ({ results: batch.map((s) => ({ key: s.idempotency_key, status: "created" })) }));
        const r = await flushQueue();
        expect(api.syncOfflineSales.mock.calls.map((c) => c[0].length)).toEqual([50, 50, 20]);
        expect(r.synced).toBe(120);
    });

    it("two flushes at once send the queue once (no double send from two triggers)", async () => {
        await queueSale(sale("key-aaaa-0001"), summary);
        let release;
        api.syncOfflineSales.mockImplementation(() => new Promise((res) => { release = () => res({ results: [{ key: "key-aaaa-0001", status: "created" }] }); }));
        const a = flushQueue(); const b = flushQueue();
        await new Promise((r) => setTimeout(r, 10));
        release();
        await Promise.all([a, b]);
        expect(api.syncOfflineSales).toHaveBeenCalledTimes(1);
    });

    it("tells listeners when the queue changes", async () => {
        const seen = vi.fn();
        const off = subscribeQueue(seen);
        await queueSale(sale("key-aaaa-0001"), summary);
        expect(seen).toHaveBeenCalled();
        off();
    });

    describe("offline item search cache", () => {
        const items = [
            { id: 1, name: "Sugar 1kg", sku: "SUG-1", barcode: "6001", sell_price: 3000, stock: 5, source: "external" },
            { id: 2, name: "Cooking oil", sku: null, barcode: "6002", sell_price: 21000, stock: 2, source: "external", variant_label: "5L" }
        ];
        it("finds remembered items by name, sku, barcode or variant", async () => {
            await cacheItems(items);
            expect((await searchCachedItems("sugar")).map((i) => i.id)).toEqual([1]);
            expect((await searchCachedItems("6002")).map((i) => i.id)).toEqual([2]);
            expect((await searchCachedItems("5l")).map((i) => i.id)).toEqual([2]);
            expect((await searchCachedItems("")).length).toBe(2);
            expect(await searchCachedItems("nothing")).toEqual([]);
        });
        it("updates an item's price and stock when it is cached again", async () => {
            await cacheItems(items);
            await cacheItems([{ ...items[0], sell_price: 3200, stock: 1 }]);
            const [hit] = await searchCachedItems("sugar");
            expect(hit).toMatchObject({ sell_price: 3200, stock: 1 });
        });
        it("never throws on bad input", async () => {
            await expect(cacheItems(null)).resolves.toBeUndefined();
            await expect(cacheItems([null, {}])).resolves.toBeUndefined();
        });
    });
});
