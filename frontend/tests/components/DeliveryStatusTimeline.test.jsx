import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("../../src/context/LanguageContext", () => ({
    useLanguage: () => ({
        t: (key) => ({
            "delivery.tracking.timeline.title": "Delivery status",
            "delivery.tracking.timeline.assigned": "Agent assigned",
            "delivery.tracking.timeline.picked_up": "Picked up",
            "delivery.tracking.timeline.in_transit": "In transit",
            "delivery.tracking.timeline.delivered": "Delivered",
            "delivery.tracking.timeline.failed": "Delivery failed"
        }[key] || key)
    })
}));

import DeliveryStatusTimeline from "../../src/components/DeliveryStatusTimeline";

describe("DeliveryStatusTimeline", () => {
    it("renders a dedicated failed state instead of the step list when the delivery failed", () => {
        render(<DeliveryStatusTimeline delivery={{ status: "failed" }} />);

        expect(screen.getByText("Delivery failed")).toBeInTheDocument();
        expect(screen.queryByText("Delivery status")).not.toBeInTheDocument();
        expect(screen.queryByText("Picked up")).not.toBeInTheDocument();
    });

    it("marks only 'assigned' as done and current when the delivery was just assigned", () => {
        render(<DeliveryStatusTimeline delivery={{ status: "assigned", assigned_at: "2026-06-01T10:00:00Z" }} />);

        const assignedStep = screen.getByText("Agent assigned").closest("li");
        const pickedUpStep = screen.getByText("Picked up").closest("li");

        expect(assignedStep.querySelector("div > div")).toHaveTextContent("✓");
        expect(pickedUpStep.querySelector("div > div")).toHaveTextContent("2");
    });

    it("marks all steps up to and including the current one as done", () => {
        render(<DeliveryStatusTimeline delivery={{ status: "in_transit" }} />);

        expect(screen.getByText("Agent assigned").closest("li").querySelector("div > div")).toHaveTextContent("✓");
        expect(screen.getByText("Picked up").closest("li").querySelector("div > div")).toHaveTextContent("✓");
        expect(screen.getByText("In transit").closest("li").querySelector("div > div")).toHaveTextContent("✓");
        expect(screen.getByText("Delivered").closest("li").querySelector("div > div")).toHaveTextContent("4");
    });

    it("marks every step done once delivered, with no remaining 'current' step", () => {
        render(<DeliveryStatusTimeline delivery={{ status: "delivered" }} />);

        ["Agent assigned", "Picked up", "In transit", "Delivered"].forEach((label) => {
            expect(screen.getByText(label).closest("li").querySelector("div > div")).toHaveTextContent("✓");
        });
    });

    it("shows a formatted timestamp under a step only when that timestamp exists", () => {
        render(
            <DeliveryStatusTimeline
                delivery={{
                    status: "picked_up",
                    assigned_at: "2026-06-01T10:00:00Z",
                    picked_up_at: "2026-06-01T10:15:00Z"
                    // in_transit_at / delivered_at intentionally absent
                }}
            />
        );

        const assignedStep = screen.getByText("Agent assigned").closest("li");
        const pickedUpStep = screen.getByText("Picked up").closest("li");
        const inTransitStep = screen.getByText("In transit").closest("li");

        expect(assignedStep.textContent).toMatch(/2026/);
        expect(pickedUpStep.textContent).toMatch(/2026/);
        // No in_transit_at was provided, so no date text should render for that step.
        expect(inTransitStep.textContent).not.toMatch(/2026/);
    });

    it("still marks a step done even when its timestamp is missing (pre-migration deliveries)", () => {
        render(<DeliveryStatusTimeline delivery={{ status: "in_transit", assigned_at: null, picked_up_at: null }} />);

        expect(screen.getByText("Agent assigned").closest("li").querySelector("div > div")).toHaveTextContent("✓");
        expect(screen.getByText("Picked up").closest("li").querySelector("div > div")).toHaveTextContent("✓");
    });
});
