import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
    const actual = await vi.importActual("react-router-dom");
    return { ...actual, useNavigate: () => mockNavigate };
});

const mockUseSocket = vi.fn();
vi.mock("../../src/context/SocketContext", () => ({
    useSocket: () => mockUseSocket()
}));

vi.mock("../../src/context/LanguageContext", () => ({
    useLanguage: () => ({
        t: (key) => ({
            "delivery.tracking.viewLive": "View live tracking",
            "delivery.tracking.agentEnRoute": "Your delivery agent is on the way",
            "delivery.tracking.awaitingAgent": "Waiting for a delivery agent",
            "delivery.tracking.connecting": "Connecting…",
            "delivery.tracking.reconnecting": "Reconnecting…",
            "delivery.tracking.calculating": "Calculating…"
        }[key] || key)
    })
}));

import TrackingWidget from "../../src/components/TrackingWidget";

const noopSocket = { emit: vi.fn(), on: vi.fn(), off: vi.fn() };

// A socket stub that actually stores its "agent:position" handler and
// lets a test trigger it - needed to exercise the Phase 5C live-ETA path,
// which only updates once an "agent:position" event actually arrives.
const makeEmittingSocket = () => {
    let handler = null;
    return {
        emit: vi.fn(),
        on: vi.fn((event, cb) => {
            if (event === "agent:position") handler = cb;
        }),
        off: vi.fn(),
        trigger: (payload) => handler && handler(payload)
    };
};

beforeEach(() => {
    mockNavigate.mockClear();
    mockUseSocket.mockReset();
});

describe("TrackingWidget", () => {
    it("shows a connecting state while the socket isn't connected yet", () => {
        mockUseSocket.mockReturnValue({ socket: null, connected: false, connectionState: "connecting" });

        render(<MemoryRouter><TrackingWidget orderId={1} delivery={{}} destination={null} /></MemoryRouter>);

        expect(screen.getByText("Connecting…")).toBeInTheDocument();
    });

    it("shows 'awaiting agent' once connected but with no position yet", () => {
        mockUseSocket.mockReturnValue({ socket: noopSocket, connected: true, connectionState: "connected" });

        render(<MemoryRouter><TrackingWidget orderId={1} delivery={{}} destination={null} /></MemoryRouter>);

        expect(screen.getByText("Waiting for a delivery agent")).toBeInTheDocument();
    });

    it("shows 'en route' once the agent's last known position is known", () => {
        mockUseSocket.mockReturnValue({ socket: noopSocket, connected: true, connectionState: "connected" });

        render(
            <MemoryRouter>
                <TrackingWidget
                    orderId={1}
                    delivery={{ agent_current_lat: -6.8, agent_current_lng: 39.2 }}
                    destination={{ lat: -6.9, lng: 39.3 }}
                />
            </MemoryRouter>
        );

        expect(screen.getByText("Your delivery agent is on the way")).toBeInTheDocument();
    });

    it("navigates to the full tracking page when tapped", async () => {
        mockUseSocket.mockReturnValue({ socket: noopSocket, connected: true, connectionState: "connected" });
        const user = userEvent.setup();

        render(<MemoryRouter><TrackingWidget orderId={42} delivery={{}} destination={null} /></MemoryRouter>);

        await user.click(screen.getByRole("button"));

        expect(mockNavigate).toHaveBeenCalledWith("/orders/42/tracking");
    });

    it("shows the ETA from the initial delivery snapshot before any live position tick arrives", () => {
        mockUseSocket.mockReturnValue({ socket: noopSocket, connected: true, connectionState: "connected" });

        render(
            <MemoryRouter>
                <TrackingWidget
                    orderId={1}
                    delivery={{ distance_remaining_km: 5.4, eta_minutes: 13 }}
                    destination={{ lat: -6.9, lng: 39.3 }}
                />
            </MemoryRouter>
        );

        expect(screen.getByText("13 min")).toBeInTheDocument();
    });

    it("replaces the ETA with the road-routing value pushed on the next agent:position tick (Phase 5C)", () => {
        const emittingSocket = makeEmittingSocket();
        mockUseSocket.mockReturnValue({ socket: emittingSocket, connected: true, connectionState: "connected" });

        render(
            <MemoryRouter>
                <TrackingWidget
                    orderId={1}
                    delivery={{ distance_remaining_km: 5.4, eta_minutes: 13 }}
                    destination={{ lat: -6.9, lng: 39.3 }}
                />
            </MemoryRouter>
        );

        expect(screen.getByText("13 min")).toBeInTheDocument();

        act(() => {
            emittingSocket.trigger({
                orderId: 1, lat: -6.85, lng: 39.25,
                distance_remaining_km: 2.1, eta_minutes: 7,
                routing_provider: "osrm", degraded: false
            });
        });

        expect(screen.getByText("7 min")).toBeInTheDocument();
    });

    it("joins and leaves the order tracking room as the socket connects/disconnects", () => {
        mockUseSocket.mockReturnValue({ socket: noopSocket, connected: true, connectionState: "connected" });

        const { unmount } = render(
            <MemoryRouter><TrackingWidget orderId={7} delivery={{}} destination={null} /></MemoryRouter>
        );

        expect(noopSocket.emit).toHaveBeenCalledWith("join_order_tracking", 7);

        unmount();

        expect(noopSocket.emit).toHaveBeenCalledWith("leave_order_tracking", 7);
    });
});
