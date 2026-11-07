import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { axe } from "jest-axe";
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

vi.mock("../../src/context/CurrencyContext", () => ({
    useCurrency: () => ({ format: (v) => `TZS ${v}` })
}));

import api from "../../src/api/client";
import NewReturn from "../../src/pages/NewReturn";

const renderPage = (orderId = "55") =>
    render(
        <LanguageProvider>
            <MemoryRouter initialEntries={[`/returns/new?order_id=${orderId}`]}>
                <Routes>
                    <Route path="/returns/new" element={<NewReturn />} />
                </Routes>
            </MemoryRouter>
        </LanguageProvider>
    );

const order = {
    id: 55,
    order_number: "ORD-2026-00055",
    items: [{ id: 1, name: "Crochet Bag", quantity: 2, subtotal: "20000.00" }]
};

beforeEach(() => {
    api.get.mockReset();
    api.post.mockReset();
    mockNavigate.mockReset();
});

describe("NewReturn page", () => {
    it("submits a return with the chosen item, reason and details", async () => {
        api.get.mockResolvedValueOnce({ data: { data: order } });
        api.post.mockResolvedValueOnce({ data: { data: { id: 700 } } });
        const user = userEvent.setup();
        renderPage();
        await waitFor(() => expect(screen.getByText("Order ORD-2026-00055")).toBeInTheDocument());

        await user.selectOptions(screen.getByLabelText("Item"), "1");
        await user.selectOptions(screen.getByLabelText("Reason"), "damaged_item");
        await user.type(screen.getByLabelText("Details (optional)"), "Strap torn");
        await user.click(screen.getByRole("button", { name: "Submit return request" }));

        await waitFor(() =>
            expect(api.post).toHaveBeenCalledWith("/returns", {
                order_id: 55,
                order_item_id: 1,
                reason: "damaged_item",
                description: "Strap torn"
            })
        );
        expect(mockNavigate).toHaveBeenCalledWith("/returns/700");
    });

    // Phase 6 form-error pattern.
    it("asks for a reason under the field, does not submit and focuses it", async () => {
        api.get.mockResolvedValueOnce({ data: { data: order } });
        const user = userEvent.setup();
        renderPage();
        await waitFor(() => expect(screen.getByText("Order ORD-2026-00055")).toBeInTheDocument());

        await user.click(screen.getByRole("button", { name: "Submit return request" }));

        const reason = screen.getByLabelText("Reason");
        expect(api.post).not.toHaveBeenCalled();
        expect(reason).toHaveAttribute("aria-invalid", "true");
        expect(reason).toHaveAttribute("aria-describedby", screen.getByText("Choose a reason for the return.").id);
        await waitFor(() => expect(reason).toHaveFocus());

        await user.selectOptions(reason, "other");
        expect(screen.queryByText("Choose a reason for the return.")).not.toBeInTheDocument();
        expect(reason).not.toHaveAttribute("aria-invalid");
    });

    it("shows the server's message when submission fails", async () => {
        api.get.mockResolvedValueOnce({ data: { data: order } });
        api.post.mockRejectedValueOnce({ response: { data: { message: "Return window has closed." } } });
        const user = userEvent.setup();
        renderPage();
        await waitFor(() => expect(screen.getByText("Order ORD-2026-00055")).toBeInTheDocument());

        await user.selectOptions(screen.getByLabelText("Reason"), "other");
        await user.click(screen.getByRole("button", { name: "Submit return request" }));

        await waitFor(() => expect(screen.getByText("Return window has closed.")).toBeInTheDocument());
        expect(mockNavigate).not.toHaveBeenCalled();
    });

    it("has no detectable accessibility violations, including with errors showing", async () => {
        api.get.mockResolvedValueOnce({ data: { data: order } });
        const user = userEvent.setup();
        const { container } = renderPage();
        await waitFor(() => expect(screen.getByText("Order ORD-2026-00055")).toBeInTheDocument());

        await user.click(screen.getByRole("button", { name: "Submit return request" }));

        expect(await axe(container)).toHaveNoViolations();
    });
});
