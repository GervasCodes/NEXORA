import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

let mockUser = null;
vi.mock("../../src/context/AuthContext", () => ({
    useAuth: () => ({ user: mockUser })
}));

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
    const actual = await vi.importActual("react-router-dom");
    return { ...actual, useNavigate: () => mockNavigate };
});

import OnboardingTour from "../../src/components/OnboardingTour";

const renderTour = (path = "/") =>
    render(
        <MemoryRouter initialEntries={[path]}>
            <OnboardingTour />
        </MemoryRouter>
    );

const clickThroughToEnd = async (user, ctaLabel) => {
    // "Next" appears on every step but the last; keep clicking it until
    // the final step's CTA button shows up, then click that.
    while (!screen.queryByRole("button", { name: ctaLabel })) {
        await user.click(screen.getByRole("button", { name: "Next" }));
    }
    await user.click(screen.getByRole("button", { name: ctaLabel }));
};

beforeEach(() => {
    localStorage.clear();
    mockNavigate.mockClear();
    mockUser = null;
});

describe("OnboardingTour", () => {
    it("renders nothing for a logged-out visitor", () => {
        mockUser = null;
        const { container } = renderTour();
        expect(container).toBeEmptyDOMElement();
    });

    it("shows the buyer tour and finishes to the homepage", async () => {
        mockUser = { id: 1, role: "buyer" };
        const user = userEvent.setup();
        renderTour();

        expect(screen.getByText("Find anything, fast")).toBeInTheDocument();
        await clickThroughToEnd(user, "Start browsing");

        expect(mockNavigate).toHaveBeenCalledWith("/");
        expect(localStorage.getItem("nexora_onboarding_seen_1")).toBe("1");
    });

    it("shows seller-specific steps and finishes to the seller dashboard", async () => {
        mockUser = { id: 2, role: "seller" };
        const user = userEvent.setup();
        renderTour();

        expect(screen.getByText("Your store, one dashboard")).toBeInTheDocument();
        await clickThroughToEnd(user, "Go to dashboard");

        expect(mockNavigate).toHaveBeenCalledWith("/seller");
        expect(localStorage.getItem("nexora_onboarding_seen_2")).toBe("1");
    });

    it("shows delivery-agent-specific steps and finishes to the delivery dashboard", async () => {
        mockUser = { id: 3, role: "delivery_agent" };
        const user = userEvent.setup();
        renderTour();

        expect(screen.getByText("See what's available")).toBeInTheDocument();
        await clickThroughToEnd(user, "Go to dashboard");

        expect(mockNavigate).toHaveBeenCalledWith("/delivery");
        expect(localStorage.getItem("nexora_onboarding_seen_3")).toBe("1");
    });

    it("renders nothing for an admin (no onboarding configured for that role)", () => {
        mockUser = { id: 4, role: "admin" };
        const { container } = renderTour();
        expect(container).toBeEmptyDOMElement();
    });

    it("does not re-show a tour already marked seen for that account", () => {
        mockUser = { id: 5, role: "buyer" };
        localStorage.setItem("nexora_onboarding_seen_5", "1");
        const { container } = renderTour();
        expect(container).toBeEmptyDOMElement();
    });

    it("Skip dismisses the tour and marks it seen without navigating", async () => {
        mockUser = { id: 6, role: "buyer" };
        const user = userEvent.setup();
        renderTour();

        await user.click(screen.getByRole("button", { name: "Skip" }));

        expect(mockNavigate).not.toHaveBeenCalled();
        expect(localStorage.getItem("nexora_onboarding_seen_6")).toBe("1");
    });

    it("hides the buyer tour on /seller and /delivery routes", () => {
        mockUser = { id: 7, role: "buyer" };
        const { container: sellerContainer } = renderTour("/seller");
        expect(sellerContainer).toBeEmptyDOMElement();
    });
});
