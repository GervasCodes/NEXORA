import { describe, it, expect, beforeEach } from "vitest";
import { isCacheable, saveResponse, loadResponse, clearStaleCache, TTL_MS, MAX_ENTRIES, MAX_ENTRY_CHARS } from "../../src/utils/staleCache";

const get = (url, extra = {}) => ({ method: "get", url, ...extra });
const ok = { success: true, data: [{ id: 1, name: "Rice" }] };

beforeEach(() => {
    localStorage.clear();
});

describe("isCacheable", () => {
    it.each(["/products", "/products?page=2", "/products/42", "/categories/departments", "/categories/home-highlights", "/service-categories/browse", "/store-types", "/stores/some-shop", "/services"])(
        "allows the public catalog path %s", (url) => expect(isCacheable(get(url))).toBe(true));

    it.each(["/cart", "/orders", "/orders/5", "/account", "/auth/me", "/admin/users", "/seller/orders", "/wallet", "/messages", "/disputes", "/notifications", "/productsX", "/delivery/mine"])(
        "never caches the personal or sensitive path %s", (url) => expect(isCacheable(get(url))).toBe(false));

    it("only caches GET requests", () => {
        for (const method of ["post", "put", "patch", "delete"]) expect(isCacheable({ method, url: "/products" })).toBe(false);
    });

    it("respects skipStale, and ignores an absolute origin in the url", () => {
        expect(isCacheable(get("/products", { skipStale: true }))).toBe(false);
        expect(isCacheable(get("https://api.example.com/products?x=1"))).toBe(true);
        expect(isCacheable(get("https://api.example.com/cart"))).toBe(false);
    });
});

describe("saveResponse / loadResponse", () => {
    it("round-trips a successful response", () => {
        expect(saveResponse(get("/products"), "http://x/api/v1/products", ok, 1000)).toBe(true);
        expect(loadResponse(get("/products"), "http://x/api/v1/products", 2000)).toEqual({ data: ok, savedAt: 1000 });
    });

    it("keeps different query strings apart", () => {
        saveResponse(get("/products"), "u?page=1", { success: true, n: 1 });
        saveResponse(get("/products"), "u?page=2", { success: true, n: 2 });
        expect(loadResponse(get("/products"), "u?page=2").data.n).toBe(2);
    });

    it("does not save failures, non-objects, or non-cacheable paths", () => {
        expect(saveResponse(get("/products"), "u", { success: false })).toBe(false);
        expect(saveResponse(get("/products"), "u", "text")).toBe(false);
        expect(saveResponse(get("/products"), "u", null)).toBe(false);
        expect(saveResponse(get("/cart"), "u", ok)).toBe(false);
    });

    it("expires after 24 hours and removes the entry", () => {
        saveResponse(get("/products"), "u", ok, 0);
        expect(loadResponse(get("/products"), "u", TTL_MS - 1)).not.toBeNull();
        expect(loadResponse(get("/products"), "u", TTL_MS + 1)).toBeNull();
        expect(localStorage.length).toBe(0);
    });

    it("refuses an oversized response", () => {
        const big = { success: true, blob: "x".repeat(MAX_ENTRY_CHARS) };
        expect(saveResponse(get("/products"), "u", big)).toBe(false);
    });

    it("keeps at most MAX_ENTRIES, dropping the oldest", () => {
        for (let i = 0; i < MAX_ENTRIES + 10; i += 1) saveResponse(get("/products"), `u${i}`, { success: true, i }, i + 1);
        const keys = Object.keys(localStorage).filter((k) => k.startsWith("nexora_stale:"));
        expect(keys).toHaveLength(MAX_ENTRIES);
        expect(loadResponse(get("/products"), "u0", 500)).toBeNull();                       // oldest gone
        expect(loadResponse(get("/products"), `u${MAX_ENTRIES + 9}`, 500)).not.toBeNull(); // newest kept
    });

    it("never shows one user's saved copy to another (or to a visitor)", () => {
        localStorage.setItem("nexora_user", JSON.stringify({ id: 7 }));
        saveResponse(get("/products"), "u", ok);
        expect(loadResponse(get("/products"), "u")).not.toBeNull();
        localStorage.setItem("nexora_user", JSON.stringify({ id: 8 }));
        expect(loadResponse(get("/products"), "u")).toBeNull();
        localStorage.removeItem("nexora_user");
        expect(loadResponse(get("/products"), "u")).toBeNull();
    });

    it("keeps languages apart", () => {
        localStorage.setItem("nexora_language", "en");
        saveResponse(get("/products"), "u", ok);
        localStorage.setItem("nexora_language", "sw");
        expect(loadResponse(get("/products"), "u")).toBeNull();
    });

    it("survives corrupt entries and a broken storage", () => {
        saveResponse(get("/products"), "u", ok);
        const key = Object.keys(localStorage).find((k) => k.startsWith("nexora_stale:"));
        localStorage.setItem(key, "{not json");
        expect(loadResponse(get("/products"), "u")).toBeNull();
    });

    it("clearStaleCache removes only its own entries", () => {
        localStorage.setItem("something_else", "keep");
        saveResponse(get("/products"), "u", ok);
        clearStaleCache();
        expect(localStorage.getItem("something_else")).toBe("keep");
        expect(Object.keys(localStorage).some((k) => k.startsWith("nexora_stale:"))).toBe(false);
    });
});
