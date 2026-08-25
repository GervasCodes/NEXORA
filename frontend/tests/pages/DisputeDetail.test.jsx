import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { LanguageProvider } from "../../src/context/LanguageContext";

// Phase 1 (Remediation, E2): DisputeDetail's withdraw button used to call
// window.confirm() directly. This test guards against that regressing -
// window.confirm must never be invoked, and the shared ConfirmDialog must
// appear/disappear correctly around the withdraw action instead.

vi.mock("../../src/api/client", () => ({
    default: { get: vi.fn(), put: vi.fn(), post: vi.fn() },
    extractErrorMessage: (err) => err?.response?.data?.message || "Something went wrong"
}));

vi.mock("../../src/context/CurrencyContext", () => ({
    useCurrency: () => ({ format: (v) => `TZS ${v}` })
}));

vi.mock("../../src/context/AuthContext", () => ({
    useAuth: () => ({ user: { id: 7, role: "buyer" } })
}));

vi.mock("../../src/components/ai/NexoraDisputeCopilot", () => ({
    default: () => null
}));

import api from "../../src/api/client";
import DisputeDetail from "../../src/pages/DisputeDetail";

const dispute = {
    id: 42,
    buyer_id: 7,
    seller_id: 99,
    status: "open",
    order_id: 55,
    order_number: "ORD-2026-00055",
    created_at: "2026-08-01T00:00:00.000Z",
    messages: [],
    evidence: []
};

const renderPage = () =>
    render(
        <LanguageProvider>
            <MemoryRouter initialEntries={["/disputes/42"]}>
                <Routes>
                    <Route path="/disputes/:id" element={<DisputeDetail />} />
                </Routes>
            </MemoryRouter>
        </LanguageProvider>
    );

beforeEach(() => {
    api.get.mockReset();
    api.put.mockReset();
    api.get.mockResolvedValue({ data: { data: dispute } });
    api.put.mockResolvedValue({ data: { data: { ...dispute, status: "withdrawn" } } });
});

describe("DisputeDetail withdraw confirmation", () => {
    it("never calls window.confirm and shows the shared ConfirmDialog instead", async () => {
        const confirmSpy = vi.spyOn(window, "confirm").mockImplementation(() => {
            throw new Error("window.confirm should not be called - use ConfirmDialog");
        });

        renderPage();

        const withdrawButton = await screen.findByRole("button", { name: /withdraw dispute/i });
        await userEvent.click(withdrawButton);

        expect(confirmSpy).not.toHaveBeenCalled();
        expect(await screen.findByRole("dialog")).toBeInTheDocument();
        expect(api.put).not.toHaveBeenCalled();

        confirmSpy.mockRestore();
    });

    it("only calls the withdraw API after the dialog is confirmed", async () => {
        renderPage();

        const withdrawButton = await screen.findByRole("button", { name: /withdraw dispute/i });
        await userEvent.click(withdrawButton);

        const dialog = await screen.findByRole("dialog");
        const confirmButton = within(dialog).getAllByRole("button", { name: /withdraw dispute/i }).pop();
        await userEvent.click(confirmButton);

        await waitFor(() => expect(api.put).toHaveBeenCalledWith("/disputes/42/withdraw"));
    });

    it("cancels without calling the withdraw API", async () => {
        renderPage();

        const withdrawButton = await screen.findByRole("button", { name: /withdraw dispute/i });
        await userEvent.click(withdrawButton);

        const dialog = await screen.findByRole("dialog");
        const cancelButton = within(dialog).getByRole("button", { name: /cancel/i });
        await userEvent.click(cancelButton);

        await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
        expect(api.put).not.toHaveBeenCalled();
    });
});
