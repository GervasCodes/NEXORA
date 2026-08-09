import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const mockGet = vi.fn();
vi.mock("../../src/api/client", () => ({
    default: { get: (...args) => mockGet(...args) }
}));

import { useUnreadMessagesCount } from "../../src/hooks/useUnreadMessagesCount";

describe("useUnreadMessagesCount", () => {
    beforeEach(() => {
        mockGet.mockReset();
    });

    it("stays at 0 and never calls the API when disabled", async () => {
        const { result } = renderHook(() => useUnreadMessagesCount(false), { wrapper: MemoryRouter });

        expect(result.current).toBe(0);
        expect(mockGet).not.toHaveBeenCalled();
    });

    it("fetches and reports the unread count when enabled", async () => {
        mockGet.mockResolvedValue({ data: { data: { unread: 4 } } });

        const { result } = renderHook(() => useUnreadMessagesCount(true), { wrapper: MemoryRouter });

        await waitFor(() => expect(result.current).toBe(4));
        expect(mockGet).toHaveBeenCalledWith("/chat/unread-count");
    });

    it("swallows a failed request rather than throwing, leaving the count as-is", async () => {
        mockGet.mockRejectedValue(new Error("network error"));

        const { result } = renderHook(() => useUnreadMessagesCount(true), { wrapper: MemoryRouter });

        await waitFor(() => expect(mockGet).toHaveBeenCalled());
        expect(result.current).toBe(0);
    });
});
