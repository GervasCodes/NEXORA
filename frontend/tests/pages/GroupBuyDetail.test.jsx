import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { LanguageProvider } from "../../src/context/LanguageContext";

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
    const actual = await vi.importActual("react-router-dom");
    return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock("../../src/api/client", () => ({
    default: { get: vi.fn(), post: vi.fn() },
    extractErrorMessage: (err) => err?.response?.data?.message || "Something went wrong"
}));

const mockAuth = vi.hoisted(() => ({ user: null }));
vi.mock("../../src/context/AuthContext", () => ({ useAuth: () => ({ user: mockAuth.user }) }));
vi.mock("../../src/context/CurrencyContext", () => ({ useCurrency: () => ({ format: (v) => `TZS ${v}` }) }));

import api from "../../src/api/client";
import GroupBuyDetail from "../../src/pages/GroupBuyDetail";

const group = (overrides = {}) => ({
    id: 9,
    status: "open",
    product_name: "Crochet Bag",
    product_slug: "crochet-bag",
    product_price: "20000",
    group_price: "15000",
    participant_count: 3,
    min_participants: 10,
    ends_at: new Date(Date.now() + 86400000).toISOString(),
    ...overrides
});

const renderPage = () =>
    render(
        <LanguageProvider>
            <MemoryRouter initialEntries={["/group-buys/9"]}>
                <Routes><Route path="/group-buys/:id" element={<GroupBuyDetail />} /></Routes>
            </MemoryRouter>
        </LanguageProvider>
    );

// The sticky bar's button lives in the element that carries md:hidden.
const stickyBar = () => document.querySelector("div.md\\:hidden.fixed");

beforeEach(() => {
    api.get.mockReset();
    api.post.mockReset();
    mockNavigate.mockReset();
    mockAuth.user = null;
});

describe("GroupBuyDetail - sticky mobile CTA (Phase 8)", () => {
    it("shows a phone-only Join bar with the group price for an open group", async () => {
        api.get.mockResolvedValueOnce({ data: { data: group() } });
        renderPage();
        await waitFor(() => expect(screen.getByText("Group buy")).toBeInTheDocument());

        const bar = stickyBar();
        expect(bar).not.toBeNull();
        expect(bar.className).toContain("bottom-[var(--bottom-inset)]");
        expect(bar).toHaveTextContent("Group price");
        expect(bar).toHaveTextContent("TZS 15000");
        expect(bar).toHaveTextContent("Join - no payment yet");
    });

    it("sends a signed-out visitor to login with a way back, like the inline Join button", async () => {
        api.get.mockResolvedValueOnce({ data: { data: group() } });
        const user = userEvent.setup();
        renderPage();
        await waitFor(() => expect(screen.getByText("Group buy")).toBeInTheDocument());

        await user.click(stickyBar().querySelector("button"));

        expect(mockNavigate).toHaveBeenCalledWith("/login?returnTo=%2Fgroup-buys%2F9");
        expect(api.post).not.toHaveBeenCalled();
    });

    it("joins as a signed-in buyer and then hides the bar", async () => {
        mockAuth.user = { id: 5, role: "buyer" };
        api.get.mockResolvedValue({ data: { data: group() } });
        api.post.mockResolvedValueOnce({});
        const user = userEvent.setup();
        renderPage();
        await waitFor(() => expect(screen.getByText("Group buy")).toBeInTheDocument());

        await user.click(stickyBar().querySelector("button"));

        await waitFor(() => expect(api.post).toHaveBeenCalledWith("/group-buys/9/join"));
        await waitFor(() => expect(stickyBar()).toBeNull());
    });

    it("does not show the bar to sellers", async () => {
        mockAuth.user = { id: 6, role: "seller" };
        api.get.mockResolvedValueOnce({ data: { data: group() } });
        renderPage();
        await waitFor(() => expect(screen.getByText("Group buy")).toBeInTheDocument());

        expect(stickyBar()).toBeNull();
    });

    it("does not show a Join bar once the group is no longer open", async () => {
        api.get.mockResolvedValueOnce({ data: { data: group({ status: "failed" }) } });
        renderPage();
        await waitFor(() => expect(screen.getByText("Group buy")).toBeInTheDocument());

        expect(stickyBar()).toBeNull();
    });

    it("offers 'Claim your price' to a buyer on a successful group, and opens the claim form", async () => {
        mockAuth.user = { id: 5, role: "buyer" };
        api.get.mockResolvedValueOnce({ data: { data: group({ status: "successful" }) } });
        const user = userEvent.setup();
        renderPage();
        await waitFor(() => expect(screen.getByText("Group buy")).toBeInTheDocument());

        await user.click(stickyBar().querySelector("button"));

        expect(document.getElementById("group-claim-form")).not.toBeNull();
        expect(stickyBar()).toBeNull();
    });
});
