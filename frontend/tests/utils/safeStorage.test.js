import { describe, it, expect, vi, afterEach } from "vitest";
import { installSafeStorage, safeGet, safeSet } from "../../src/utils/safeStorage";

describe("safeStorage", () => {
    afterEach(() => vi.restoreAllMocks());

    it("leaves working storage alone", () => {
        expect(installSafeStorage()).toEqual([]);
    });

    it("swaps in an in-memory store when localStorage throws", () => {
        const original = Object.getOwnPropertyDescriptor(window, "localStorage");
        Object.defineProperty(window, "localStorage", {
            configurable: true,
            get() { throw new Error("blocked"); }
        });
        try {
            expect(installSafeStorage()).toContain("localStorage");
            window.localStorage.setItem("a", "1");
            expect(window.localStorage.getItem("a")).toBe("1");
            window.localStorage.removeItem("a");
            expect(window.localStorage.getItem("a")).toBeNull();
        } finally {
            if (original) Object.defineProperty(window, "localStorage", original);
        }
    });

    it("safeGet/safeSet never throw", () => {
        vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
        expect(safeSet("k", "v")).toBe(false);
        vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
        expect(safeGet("k")).toBeNull();
    });
});
