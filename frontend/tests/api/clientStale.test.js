import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { AxiosError } from "axios";
import api, { getStaleState, subscribeStale, _resetStaleState } from "../../src/api/client";
import { loadResponse } from "../../src/utils/staleCache";

let clock = 0;
let calls;

// axios copies the adapter into every request's config, so a retry that is already scheduled keeps the
// adapter it started with. One stable adapter that delegates to a swappable behaviour models "the server
// came back" correctly.
let current;
const use = (adapter) => { current = adapter; };
api.defaults.adapter = (config) => current(config);

const okAdapter = (data) => async (config) => {
    calls.push(`${(config.method || "get").toUpperCase()} ${config.url}`);
    return { data, status: 200, statusText: "OK", headers: {}, config, request: {} };
};
const downAdapter = (status) => async (config) => {
    calls.push(`${(config.method || "get").toUpperCase()} ${config.url}`);
    if (!status) throw new AxiosError("Network Error", "ERR_NETWORK", config);
    const response = { data: { success: false }, status, statusText: "err", headers: {}, config, request: {} };
    throw new AxiosError(`status ${status}`, "ERR_BAD_RESPONSE", config, {}, response);
};

const products = { success: true, data: [{ id: 1, name: "Rice" }] };
const flush = async () => { for (let i = 0; i < 10; i += 1) await Promise.resolve(); };

beforeEach(() => {
    vi.useFakeTimers();
    clock += 10 * 60_000; // move well past any circuit-breaker window left by an earlier test
    vi.setSystemTime(new Date(2026, 0, 1).getTime() + clock);
    localStorage.clear();
    _resetStaleState();
    calls = [];
});
afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
});

describe("saved copies while the server is away (api/client.js)", () => {
    it("serves the saved copy immediately when the server cannot be reached", async () => {
        use(okAdapter(products));
        await api.get("/products");

        use(downAdapter(null));
        const response = await api.get("/products");

        expect(response.stale).toBe(true);
        expect(response.status).toBe(200);
        expect(response.data).toEqual(products);
        expect(getStaleState().stale).toBe(true);
    });

    it.each([502, 503, 504])("also serves it for a %i from a sleeping host", async (status) => {
        use(okAdapter(products));
        await api.get("/categories/departments");
        use(downAdapter(status));
        const response = await api.get("/categories/departments");
        expect(response.stale).toBe(true);
    });

    it("keeps retrying in the background, then refreshes the copy and offers a refresh", async () => {
        use(okAdapter(products));
        await api.get("/products");

        use(downAdapter(null));
        await api.get("/products"); // served stale, background retry scheduled
        expect(getStaleState().freshAvailable).toBe(false);

        const fresh = { success: true, data: [{ id: 1, name: "Rice" }, { id: 2, name: "Beans" }] };
        use(okAdapter(fresh));
        await vi.advanceTimersByTimeAsync(1600); // first retry delay is 1.5 s
        await flush();

        expect(getStaleState().freshAvailable).toBe(true);
        expect(loadResponse({ method: "get", url: "/products" }, api.getUri({ url: "/products" })).data).toEqual(fresh);
    });

    it("notifies subscribers of state changes", async () => {
        const seen = [];
        const unsubscribe = subscribeStale((state) => seen.push(state));
        use(okAdapter(products));
        await api.get("/products");
        use(downAdapter(null));
        await api.get("/products");
        unsubscribe();
        expect(seen.some((s) => s.stale)).toBe(true);
    });

    it("a fresh successful response replaces the saved copy", async () => {
        use(okAdapter({ success: true, v: 1 }));
        await api.get("/products");
        use(okAdapter({ success: true, v: 2 }));
        await api.get("/products");
        use(downAdapter(null));
        expect((await api.get("/products")).data.v).toBe(2);
    });

    it("without a saved copy, behaves exactly as before (the error is passed on)", async () => {
        use(downAdapter(503));
        await expect(api.get("/products", { skipRetry: true })).rejects.toMatchObject({ response: { status: 503 } });
        expect(getStaleState().stale).toBe(false);
    });

    it("does not serve a saved copy for a real error answer such as 404 or 500", async () => {
        use(okAdapter(products));
        await api.get("/products/9");
        for (const status of [400, 401, 403, 404, 500]) {
            use(downAdapter(status));
            await expect(api.get("/products/9", { skipRetry: true })).rejects.toBeTruthy();
        }
        expect(getStaleState().stale).toBe(false);
    });

    it("never saves or serves personal paths such as the cart or orders", async () => {
        use(okAdapter({ success: true, items: [1] }));
        await api.get("/cart");
        await api.get("/orders");
        use(downAdapter(null));
        await expect(api.get("/cart", { skipRetry: true })).rejects.toBeTruthy();
        await expect(api.get("/orders", { skipRetry: true })).rejects.toBeTruthy();
        expect(Object.keys(localStorage).filter((k) => k.startsWith("nexora_stale:"))).toHaveLength(0);
    });

    it("never serves a copy for a request that changes data", async () => {
        use(okAdapter(products));
        await api.get("/products");
        use(downAdapter(null));
        await expect(api.post("/products", {}, { skipRetry: true })).rejects.toBeTruthy();
    });

    it("does not show one user's saved copy to another user", async () => {
        localStorage.setItem("nexora_user", JSON.stringify({ id: 1 }));
        use(okAdapter(products));
        await api.get("/products");

        localStorage.setItem("nexora_user", JSON.stringify({ id: 2 }));
        use(downAdapter(null));
        await expect(api.get("/products", { skipRetry: true })).rejects.toBeTruthy();
    });

    it("does not use a copy older than 24 hours", async () => {
        use(okAdapter(products));
        await api.get("/products");
        vi.setSystemTime(Date.now() + 25 * 60 * 60 * 1000);
        use(downAdapter(null));
        await expect(api.get("/products", { skipRetry: true })).rejects.toBeTruthy();
    });

    it("skipStale opts a single request out", async () => {
        use(okAdapter(products));
        await api.get("/products");
        use(downAdapter(null));
        await expect(api.get("/products", { skipRetry: true, skipStale: true })).rejects.toBeTruthy();
    });
});
