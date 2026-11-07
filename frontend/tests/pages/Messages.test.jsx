import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("../../src/api/client", () => ({
    default: { get: vi.fn(), put: vi.fn(), delete: vi.fn() },
    extractErrorMessage: (err) => err?.response?.data?.message || "Something went wrong"
}));

vi.mock("../../src/context/ToastContext", () => ({
    useToast: () => ({ error: vi.fn() })
}));

vi.mock("../../src/context/AuthContext", () => ({
    useAuth: () => ({ user: { id: 1, role: "buyer" } })
}));

vi.mock("../../src/context/LanguageContext", () => ({
    useLanguage: () => ({
        t: (key, params) => {
            const template = ({
                "messages.title": "Messages",
                "messages.archivedTab": "Archived",
                "messages.searchPlaceholder": "Search conversations",
                "messages.emptyTitle": "No messages yet",
                "messages.emptyArchived": "No archived conversations",
                "messages.emptyHintBuyer": "Message a seller from any product page to start a conversation.",
                "messages.emptyHintSeller": "Buyers can message you from your product pages.",
                "messages.noMatches": "No conversations match \"{query}\".",
                "messages.searchingMessages": "Searching messages…",
                "messages.noMessageResults": "No messages found for \"{query}\".",
                "messages.messageResultsHeading": "Messages matching \"{query}\"",
                "messages.noMessagePreview": "No messages yet",
                "messages.reLabel": "Re: {product}"
            }[key] || key);
            if (!params) return template;
            return template.replace(/\{(\w+)\}/g, (m, k) => (params[k] ?? ""));
        }
    })
}));

import api from "../../src/api/client";
import Messages from "../../src/pages/Messages";

const renderPage = () => render(<MemoryRouter><Messages /></MemoryRouter>);

const conversation = {
    id: 5,
    buyer_id: 1,
    seller_id: 2,
    seller_first_name: "Amara",
    seller_last_name: "K",
    buyer_first_name: "Me",
    buyer_last_name: "Self",
    product_name: "Vintage Camera",
    last_message: "Is this still available?",
    unread_count: 0,
    my_muted_at: null
};

beforeEach(() => {
    api.get.mockReset();
});

describe("Messages page", () => {
    it("shows the empty state when the buyer has no conversations", async () => {
        api.get.mockResolvedValueOnce({ data: { data: [] } });
        renderPage();

        await waitFor(() => expect(screen.getByText("No messages yet")).toBeInTheDocument());
        expect(screen.getByText(/Message a seller from any product page/)).toBeInTheDocument();
    });

    it("lists conversations once loaded", async () => {
        api.get.mockResolvedValueOnce({ data: { data: [conversation] } });
        renderPage();

        await waitFor(() => expect(screen.getByText("Amara K")).toBeInTheDocument());
        expect(screen.getByText("Is this still available?")).toBeInTheDocument();
    });

    // Phase 8 sub-phase 3 (empty & loading states): a generic fetch failure
    // used to fall through silently and land on the exact same "No messages
    // yet" copy as someone with a genuinely empty inbox. This confirms the
    // new loadError branch renders a distinct error state with a retry
    // instead, and that the retry re-issues the request.
    it("shows a retryable error state when loading conversations fails, not the empty state", async () => {
        api.get.mockRejectedValueOnce({ response: { data: {} } });
        renderPage();

        await waitFor(() => expect(screen.getByText("Couldn't load your messages")).toBeInTheDocument());
        expect(screen.queryByText("No messages yet")).not.toBeInTheDocument();

        api.get.mockResolvedValueOnce({ data: { data: [conversation] } });
        screen.getByText("Try again").click();

        await waitFor(() => expect(screen.getByText("Amara K")).toBeInTheDocument());
        expect(api.get).toHaveBeenCalledTimes(2);
    });

    it("still shows the maintenance screen instead of the error state for a MODULE_MAINTENANCE response", async () => {
        api.get.mockRejectedValueOnce({ response: { data: { code: "MODULE_MAINTENANCE", message: "Back soon." } } });
        renderPage();

        await waitFor(() => expect(screen.getByText("Back soon.")).toBeInTheDocument());
        expect(screen.queryByText("Couldn't load your messages")).not.toBeInTheDocument();
    });
});
