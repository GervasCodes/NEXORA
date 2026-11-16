import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";

const mockGet = vi.fn();
vi.mock("../../src/api/client", () => ({
    default: { get: (...args) => mockGet(...args) }
}));

import usePagedList from "../../src/hooks/usePagedList";

const pick = (body) => ({ items: body.data.rows, pagination: body.data.pagination });
const page = (rows, p, totalPages) => ({ data: { data: { rows, pagination: { page: p, totalPages } } } });
const row = (id) => ({ id, name: `row-${id}` });

function setup(initialParams = {}) {
    return renderHook(
        ({ params }) => usePagedList({ url: "/things", params, pick, debounceMs: 10 }),
        { initialProps: { params: initialParams } }
    );
}

describe("usePagedList", () => {
    beforeEach(() => mockGet.mockReset());

    it("fetches the first page immediately and reports hasLoaded", async () => {
        mockGet.mockResolvedValueOnce(page([row(1), row(2)], 1, 2));
        const { result } = setup();

        expect(result.current.hasLoaded).toBe(false);
        await waitFor(() => expect(result.current.hasLoaded).toBe(true));

        expect(mockGet).toHaveBeenCalledWith("/things", { params: { page: 1 } });
        expect(result.current.items.map((r) => r.id)).toEqual([1, 2]);
        expect(result.current.hasMore).toBe(true);
    });

    it("appends the next page and drops rows it already has", async () => {
        mockGet
            .mockResolvedValueOnce(page([row(1), row(2)], 1, 2))
            .mockResolvedValueOnce(page([row(2), row(3)], 2, 2));
        const { result } = setup();
        await waitFor(() => expect(result.current.hasLoaded).toBe(true));

        act(() => result.current.loadMore());
        await waitFor(() => expect(result.current.items).toHaveLength(3));

        expect(mockGet).toHaveBeenLastCalledWith("/things", { params: { page: 2 } });
        expect(result.current.items.map((r) => r.id)).toEqual([1, 2, 3]);
        expect(result.current.hasMore).toBe(false);
    });

    it("keeps the rows on screen when Load more fails, and Retry asks for the SAME page", async () => {
        mockGet
            .mockResolvedValueOnce(page([row(1)], 1, 3))
            .mockRejectedValueOnce(new Error("network"))
            .mockResolvedValueOnce(page([row(2)], 2, 3));
        const { result } = setup();
        await waitFor(() => expect(result.current.hasLoaded).toBe(true));

        act(() => result.current.loadMore());
        await waitFor(() => expect(result.current.loadMoreError).toBe(true));
        expect(result.current.items.map((r) => r.id)).toEqual([1]);
        expect(result.current.error).toBe(null);

        act(() => result.current.loadMore());
        await waitFor(() => expect(result.current.items).toHaveLength(2));
        expect(mockGet).toHaveBeenLastCalledWith("/things", { params: { page: 2 } });
        expect(result.current.loadMoreError).toBe(false);
    });

    it("ignores a slow Load more that belongs to an older filter set", async () => {
        let resolveStale;
        mockGet
            .mockResolvedValueOnce(page([row(1)], 1, 2))
            .mockImplementationOnce(() => new Promise((resolve) => { resolveStale = resolve; }))
            .mockResolvedValueOnce(page([row(99)], 1, 1));
        const { result, rerender } = setup({});
        await waitFor(() => expect(result.current.hasLoaded).toBe(true));

        act(() => result.current.loadMore()); // pending, old filters
        rerender({ params: { q: "new" } });
        await waitFor(() => expect(result.current.items.map((r) => r.id)).toEqual([99]));

        await act(async () => { resolveStale(page([row(2)], 2, 2)); });

        expect(result.current.items.map((r) => r.id)).toEqual([99]);
        expect(result.current.loadingMore).toBe(false);
    });

    it("stays hasLoaded across filter changes so the page is not replaced by a skeleton", async () => {
        let resolveSecond;
        mockGet
            .mockResolvedValueOnce(page([row(1)], 1, 1))
            .mockImplementationOnce(() => new Promise((resolve) => { resolveSecond = resolve; }));
        const { result, rerender } = setup({});
        await waitFor(() => expect(result.current.hasLoaded).toBe(true));

        rerender({ params: { q: "x" } });
        await waitFor(() => expect(result.current.loading).toBe(true));
        // Re-fetching: the old rows stay (dimmed by the page) and hasLoaded is still true.
        expect(result.current.hasLoaded).toBe(true);
        expect(result.current.items.map((r) => r.id)).toEqual([1]);

        await act(async () => { resolveSecond(page([row(5)], 1, 1)); });
        await waitFor(() => expect(result.current.items.map((r) => r.id)).toEqual([5]));
        expect(mockGet).toHaveBeenLastCalledWith("/things", { params: { q: "x", page: 1 } });
    });

    it("surfaces a first-page failure as `error` and clears stale rows", async () => {
        mockGet.mockRejectedValueOnce(new Error("boom"));
        const { result } = setup();
        await waitFor(() => expect(result.current.hasLoaded).toBe(true));
        expect(result.current.error).toBeTruthy();
        expect(result.current.items).toEqual([]);
    });

    it("exposes a MODULE_MAINTENANCE response as `maintenance`, not `error`", async () => {
        const err = Object.assign(new Error("503"), { response: { data: { code: "MODULE_MAINTENANCE", message: "Back soon" } } });
        mockGet.mockRejectedValueOnce(err);
        const { result } = setup();
        await waitFor(() => expect(result.current.hasLoaded).toBe(true));
        expect(result.current.maintenance).toBe("Back soon");
        expect(result.current.error).toBe(null);
    });
});
