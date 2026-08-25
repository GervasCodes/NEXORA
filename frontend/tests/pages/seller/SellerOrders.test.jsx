import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

vi.mock("../../../src/api/client", () => ({
    default: { get: vi.fn(), put: vi.fn() },
    extractErrorMessage: () => "Something went wrong"
}));

vi.mock("../../../src/context/ToastContext", () => ({
    useToast: () => ({ error: vi.fn() })
}));

import api from "../../../src/api/client";
import SellerOrders from "../../../src/pages/seller/SellerOrders";

const order = (overrides = {}) => ({
    id: 1,
    order_number: "ORD-1",
    status: "processing",
    payment_status: "paid",
    payment_method: "mobile_money",
    total_amount: "10000.00",
    created_at: "2026-01-01",
    wallet_credit_pending: false,
    ...overrides
});

beforeEach(() => {
    api.get.mockReset();
    api.get.mockImplementation((path) => {
        if (path === "/seller/delivery-agents") return Promise.resolve({ data: { data: [] } });
        return Promise.resolve({ data: { data: [] } });
    });
});

// C1 (Phase 4 remediation): the "Payout pending" badge is the only
// user-facing surface of wallet_credit_pending - this is a render-level
// smoke test that it shows up when the flag is true and stays hidden
// otherwise, since order.service.test.js already covers when the flag
// itself should be true/false.
describe("SellerOrders wallet_credit_pending badge", () => {
    it("shows a Payout pending badge for an order flagged wallet_credit_pending", async () => {
        api.get.mockImplementation((path) => {
            if (path === "/orders/seller/list") return Promise.resolve({ data: { data: [order({ wallet_credit_pending: true })] } });
            return Promise.resolve({ data: { data: [] } });
        });

        render(<SellerOrders />);

        await waitFor(() => expect(screen.getByText("Payout pending")).toBeInTheDocument());
    });

    it("does not show the badge for an order that isn't flagged", async () => {
        api.get.mockImplementation((path) => {
            if (path === "/orders/seller/list") return Promise.resolve({ data: { data: [order({ wallet_credit_pending: false })] } });
            return Promise.resolve({ data: { data: [] } });
        });

        render(<SellerOrders />);

        await waitFor(() => expect(screen.getByText("ORD-1")).toBeInTheDocument());
        expect(screen.queryByText("Payout pending")).not.toBeInTheDocument();
    });
});
