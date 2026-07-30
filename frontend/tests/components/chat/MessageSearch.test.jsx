import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

// A stray copy of the MessageSearch *component* itself previously lived at
// this path (tests/components/chat/MessageSearch.jsx) instead of a test -
// removed as part of the Phase 6 test review. This is the real test.

const mockGet = vi.fn();
vi.mock("../../../src/api/client", () => ({
    default: { get: (...args) => mockGet(...args) }
}));

import MessageSearch from "../../../src/components/chat/MessageSearch";

beforeEach(() => {
    mockGet.mockReset();
});

describe("MessageSearch", () => {
    it("does not call the search endpoint for a blank query", () => {
        render(<MessageSearch conversationId={1} onJumpTo={() => {}} onClose={() => {}} />);
        expect(mockGet).not.toHaveBeenCalled();
    });

    it("searches this conversation only, trimming the query, after the debounce", async () => {
        vi.useFakeTimers();
        mockGet.mockResolvedValue({ data: { data: [] } });

        render(<MessageSearch conversationId={42} onJumpTo={() => {}} onClose={() => {}} />);
        fireEvent.change(screen.getByPlaceholderText(/search this conversation/i), {
            target: { value: "  hello  " }
        });

        vi.advanceTimersByTime(300);
        vi.useRealTimers();

        await waitFor(() =>
            expect(mockGet).toHaveBeenCalledWith("/chat/conversations/42/search", {
                params: { q: "hello" }
            })
        );
    });

    it("renders results and jumps to a message on click", async () => {
        mockGet.mockResolvedValue({
            data: { data: [{ id: 7, message: "Is it still available?", created_at: "2026-07-01T10:00:00Z" }] }
        });
        const onJumpTo = vi.fn();

        render(<MessageSearch conversationId={1} onJumpTo={onJumpTo} onClose={() => {}} />);
        fireEvent.change(screen.getByPlaceholderText(/search this conversation/i), {
            target: { value: "available" }
        });

        const result = await screen.findByText("Is it still available?");
        fireEvent.click(result);

        expect(onJumpTo).toHaveBeenCalledWith(7);
    });

    it("falls back to the attachment name when a result has no text", async () => {
        mockGet.mockResolvedValue({
            data: { data: [{ id: 9, message: "", attachment_name: "invoice.pdf", created_at: "2026-07-01T10:00:00Z" }] }
        });

        render(<MessageSearch conversationId={1} onJumpTo={() => {}} onClose={() => {}} />);
        fireEvent.change(screen.getByPlaceholderText(/search this conversation/i), {
            target: { value: "invoice" }
        });

        expect(await screen.findByText(/invoice\.pdf/)).toBeInTheDocument();
    });

    it("shows a no-results message when the search comes back empty", async () => {
        mockGet.mockResolvedValue({ data: { data: [] } });

        render(<MessageSearch conversationId={1} onJumpTo={() => {}} onClose={() => {}} />);
        fireEvent.change(screen.getByPlaceholderText(/search this conversation/i), {
            target: { value: "nomatch" }
        });

        expect(await screen.findByText(/no messages match "nomatch"/i)).toBeInTheDocument();
    });

    it("calls onClose when the close button is clicked", () => {
        const onClose = vi.fn();
        render(<MessageSearch conversationId={1} onJumpTo={() => {}} onClose={onClose} />);

        fireEvent.click(screen.getByText("Close"));
        expect(onClose).toHaveBeenCalled();
    });

    it("ignores a stale, out-of-order search response instead of letting it clobber newer results", async () => {
        let resolveFirst;
        let resolveSecond;
        mockGet
            .mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; }))
            .mockImplementationOnce(() => new Promise((resolve) => { resolveSecond = resolve; }));

        render(<MessageSearch conversationId={1} onJumpTo={() => {}} onClose={() => {}} />);
        const input = screen.getByPlaceholderText(/search this conversation/i);

        // First keystroke fires a (slow) request after the debounce.
        fireEvent.change(input, { target: { value: "abc" } });
        await new Promise((resolve) => setTimeout(resolve, 350));

        // User keeps typing before that request resolves - a second, newer
        // request fires and should supersede the first.
        fireEvent.change(input, { target: { value: "abcd" } });
        await new Promise((resolve) => setTimeout(resolve, 350));

        expect(mockGet).toHaveBeenCalledTimes(2);

        // Resolve out of order: the newer ("abcd") request settles first,
        // then the older, now-stale ("abc") request settles after it.
        resolveSecond({ data: { data: [{ id: 2, message: "abcd match" }] } });
        await waitFor(() => expect(screen.getByText("abcd match")).toBeInTheDocument());

        resolveFirst({ data: { data: [{ id: 1, message: "abc match" }] } });
        // Give the stale promise's .then a tick to run, if it's going to.
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(screen.queryByText("abc match")).not.toBeInTheDocument();
        expect(screen.getByText("abcd match")).toBeInTheDocument();
    });
});
