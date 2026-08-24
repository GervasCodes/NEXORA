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
import NewDispute from "../../src/pages/NewDispute";

const renderPage = (orderId = "55") =>
    render(
        <LanguageProvider>
            <MemoryRouter initialEntries={[`/disputes/new?order_id=${orderId}`]}>
                <Routes>
                    <Route path="/disputes/new" element={<NewDispute />} />
                </Routes>
            </MemoryRouter>
        </LanguageProvider>
    );

const order = {
    id: 55,
    order_number: "ORD-2026-00055",
    items: [
        { id: 1, name: "Crochet Bag", quantity: 2, subtotal: "20000.00" }
    ]
};

beforeEach(() => {
    api.get.mockReset();
    api.post.mockReset();
    mockNavigate.mockReset();
});

describe("NewDispute page", () => {
    it("shows a couldn't-load state when no order was specified", async () => {
        render(
            <LanguageProvider>
                <MemoryRouter initialEntries={["/disputes/new"]}>
                    <Routes>
                        <Route path="/disputes/new" element={<NewDispute />} />
                    </Routes>
                </MemoryRouter>
            </LanguageProvider>
        );

        await waitFor(() => expect(screen.getByText("Couldn't load that order")).toBeInTheDocument());
        expect(screen.getByText("No order was specified.")).toBeInTheDocument();
    });

    it("submits a dispute with the selected item, type, subject, and description", async () => {
        api.get.mockResolvedValueOnce({ data: { data: order } });
        api.post.mockResolvedValueOnce({ data: { data: { id: 900 } } });

        const user = userEvent.setup();
        renderPage();

        await waitFor(() => expect(screen.getByText("Order ORD-2026-00055")).toBeInTheDocument());

        await user.selectOptions(screen.getByLabelText("Which item is this about?"), "1");
        await user.selectOptions(screen.getByLabelText("What's the issue?"), "damaged_item");
        await user.type(screen.getByLabelText("Subject"), "Bag arrived torn");
        await user.type(screen.getByLabelText("Details"), "The strap was ripped on arrival.");
        await user.click(screen.getByRole("button", { name: "Submit dispute" }));

        await waitFor(() =>
            expect(api.post).toHaveBeenCalledWith("/disputes", {
                order_id: 55,
                order_item_id: 1,
                type: "damaged_item",
                subject: "Bag arrived torn",
                description: "The strap was ripped on arrival."
            })
        );
        expect(mockNavigate).toHaveBeenCalledWith("/disputes/900");
    });

    it("shows an error message when submission fails", async () => {
        api.get.mockResolvedValueOnce({ data: { data: order } });
        api.post.mockRejectedValueOnce({ response: { data: { message: "That order is already disputed." } } });

        const user = userEvent.setup();
        renderPage();

        await waitFor(() => expect(screen.getByText("Order ORD-2026-00055")).toBeInTheDocument());
        await user.selectOptions(screen.getByLabelText("What's the issue?"), "other");
        await user.type(screen.getByLabelText("Subject"), "Subject line");
        await user.type(screen.getByLabelText("Details"), "Description text");
        await user.click(screen.getByRole("button", { name: "Submit dispute" }));

        await waitFor(() => expect(screen.getByText("That order is already disputed.")).toBeInTheDocument());
        expect(mockNavigate).not.toHaveBeenCalled();
    });

    // (Accessibility & Internationalization): dispute filing is
    // one of the three flows named for the manual screen-reader audit -
    // see the matching note in Checkout.test.jsx on what this automated
    // check does and doesn't cover. This test is what caught every field
    // in the original markup having a visually-adjacent <label> with no
    // htmlFor/id link to its input/select/textarea - fixed in the same
    // change that added this test, not left as a known gap.
    it("has no detectable accessibility violations on the dispute form", async () => {
        api.get.mockResolvedValueOnce({ data: { data: order } });

        const { container } = renderPage();

        await waitFor(() => expect(screen.getByText("Order ORD-2026-00055")).toBeInTheDocument());

        const results = await axe(container);
        expect(results).toHaveNoViolations();
    });
});
