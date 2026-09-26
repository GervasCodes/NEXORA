import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

vi.mock("../../src/api/client", () => ({
    default: { get: vi.fn(), put: vi.fn(), post: vi.fn(), delete: vi.fn() },
    extractErrorMessage: (err) => err?.response?.data?.message || "Something went wrong"
}));

vi.mock("../../src/context/AuthContext", () => ({
    useAuth: () => ({ user: { id: 1 }, sessionReady: true })
}));

vi.mock("../../src/context/SocketContext", () => ({
    useSocket: () => ({ socket: null })
}));

vi.mock("../../src/context/LanguageContext", () => ({
    useLanguage: () => ({
        t: (key, params) => {
            const template = ({
                "chat.today": "Today",
                "chat.yesterday": "Yesterday",
                "chat.allMessages": "All messages",
                "chat.search": "Search",
                "chat.searchAria": "Search this conversation",
                "chat.wallpaper": "Wallpaper",
                "chat.wallpaperAria": "Change wallpaper",
                "chat.clearChat": "Clear chat",
                "chat.deleteChat": "Delete chat",
                "chat.loadError": "Couldn't load this conversation.",
                "chat.noMessages": "No messages here yet.",
                "common.cancel": "Cancel"
            }[key] || key);
            if (!params) return template;
            return template.replace(/\{(\w+)\}/g, (m, k) => (params[k] ?? ""));
        }
    })
}));

import api from "../../src/api/client";
import ConversationThread from "../../src/pages/ConversationThread";

const renderPage = (id = "5") =>
    render(
        <MemoryRouter initialEntries={[`/messages/${id}`]}>
            <Routes>
                <Route path="/messages/:id" element={<ConversationThread />} />
            </Routes>
        </MemoryRouter>
    );

beforeEach(() => {
    api.get.mockReset();
    api.put.mockReset();
    api.put.mockResolvedValue({ data: {} });
});

describe("ConversationThread page", () => {
    it("shows the friendly empty state for a genuinely new conversation", async () => {
        api.get.mockResolvedValueOnce({ data: { data: [] } });
        renderPage();

        await waitFor(() => expect(screen.getByText("No messages here yet.")).toBeInTheDocument());
        expect(screen.queryByText("Try again")).not.toBeInTheDocument();
    });

    // Phase 8 sub-phase 3 (empty & loading states): a failed history fetch
    // used to render identically to the "no messages here yet" placeholder
    // above - this confirms the new loadFailed branch keeps them visually
    // and semantically distinct, with a working retry.
    it("shows a retryable error state when the history fetch fails, not the empty-conversation state", async () => {
        api.get.mockRejectedValueOnce(new Error("network error"));
        renderPage();

        await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Couldn't load this conversation."));
        expect(screen.queryByText("No messages here yet.")).not.toBeInTheDocument();

        api.get.mockResolvedValueOnce({ data: { data: [] } });
        screen.getByText("Try again").click();

        await waitFor(() => expect(screen.getByText("No messages here yet.")).toBeInTheDocument());
        expect(api.get).toHaveBeenCalledTimes(2);
    });
});
