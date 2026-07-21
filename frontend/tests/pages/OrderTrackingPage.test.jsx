import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
    const actual = await vi.importActual("react-router-dom");
    return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock("../../src/api/client", () => ({
    default: { get: vi.fn(), post: vi.fn() },
    extractErrorMessage: (error) => error?.response?.data?.message || "Something went wrong. Please try again"
}));

const mockUseSocket = vi.fn();
vi.mock("../../src/context/SocketContext", () => ({
    useSocket: () => mockUseSocket()
}));

vi.mock("../../src/context/LanguageContext", () => ({
    useLanguage: () => ({
        t: (key) => ({
            "delivery.tracking.unavailable": "Tracking unavailable",
            "delivery.tracking.back": "Back to order",
            "delivery.tracking.eta": "ETA",
            "delivery.tracking.distanceRemaining": "Distance remaining",
            "delivery.tracking.calculating": "Calculating…",
            "delivery.tracking.live": "Live",
            "delivery.tracking.connecting": "Connecting…",
            "delivery.tracking.reconnecting": "Reconnecting…",
            "delivery.tracking.timeline.title": "Delivery status",
            "delivery.tracking.timeline.assigned": "Agent assigned",
            "delivery.tracking.timeline.picked_up": "Picked up",
            "delivery.tracking.timeline.in_transit": "In transit",
            "delivery.tracking.timeline.delivered": "Delivered",
            "delivery.tracking.timeline.failed": "Delivery failed",
            "delivery.tracking.courierDetails": "Courier details",
            "delivery.tracking.messageCourier": "Message courier",
            "delivery.tracking.callCourier": "Call courier"
        }[key] || key)
    })
}));

// Real Leaflet rendering isn't relevant to this page's data-loading and
// socket-wiring behavior - stub the map to a simple marker so we can
// assert on the props it receives instead.
vi.mock("../../src/components/DeliveryTrackingMap", () => ({
    default: ({ agentPos, destination }) => (
        <div data-testid="tracking-map">
            {agentPos ? `agent:${agentPos.lat},${agentPos.lng}` : "no-agent"} | {destination ? `dest:${destination.lat},${destination.lng}` : "no-dest"}
        </div>
    )
}));

import api from "../../src/api/client";
import OrderTrackingPage from "../../src/pages/OrderTrackingPage";

const noopSocket = { emit: vi.fn(), on: vi.fn(), off: vi.fn() };

// A socket stub that actually stores its handlers and lets a test trigger
// them - needed to exercise the Phase 5C live-ETA path, which only
// updates once an "agent:position"/"delivery:status" event arrives.
const makeEmittingSocket = () => {
    const handlers = {};
    return {
        emit: vi.fn(),
        on: vi.fn((event, cb) => {
            handlers[event] = cb;
        }),
        off: vi.fn(),
        trigger: (event, payload) => handlers[event] && handlers[event](payload)
    };
};

const order = { id: 1, delivery_lat: -6.90, delivery_lng: 39.30 };
const delivery = {
    status: "in_transit",
    agent_id: 9,
    agent_first_name: "Juma",
    agent_last_name: "Ally",
    agent_current_lat: -6.80,
    agent_current_lng: 39.20,
    pickup: { lat: -6.79, lng: 39.19 },
    destination: { lat: -6.90, lng: 39.30 },
    // Phase 5C: distance/ETA now come from the backend's road-routing
    // calculation (see GET /delivery/:id -> buildTrackingSummary) rather
    // than a client-side straight-line estimate.
    distance_remaining_km: 12.4,
    eta_minutes: 22
};

const renderPage = (id = "1") =>
    render(
        <MemoryRouter initialEntries={[`/orders/${id}/tracking`]}>
            <Routes>
                <Route path="/orders/:id/tracking" element={<OrderTrackingPage />} />
            </Routes>
        </MemoryRouter>
    );

beforeEach(() => {
    mockNavigate.mockClear();
    mockUseSocket.mockReset();
    api.get.mockReset();
    api.post.mockReset();
    noopSocket.emit.mockClear();
    noopSocket.on.mockClear();
    noopSocket.off.mockClear();
});

describe("OrderTrackingPage", () => {
    it("loads the order and delivery in parallel and renders the tracking map with the destination", async () => {
        mockUseSocket.mockReturnValue({ socket: null, connected: false, connectionState: "connecting" });
        api.get.mockImplementation((url) => {
            if (url === "/orders/1") return Promise.resolve({ data: { data: order } });
            if (url === "/delivery/1") return Promise.resolve({ data: { data: delivery } });
            return Promise.reject(new Error(`unexpected url ${url}`));
        });

        renderPage();

        await waitFor(() => expect(screen.getByTestId("tracking-map")).toHaveTextContent("dest:-6.9,39.3"));
        expect(api.get).toHaveBeenCalledWith("/orders/1");
        expect(api.get).toHaveBeenCalledWith("/delivery/1");
    });

    it("shows an unavailable message with a link back to the order when loading fails", async () => {
        mockUseSocket.mockReturnValue({ socket: null, connected: false, connectionState: "connecting" });
        api.get.mockRejectedValue({ response: { data: { message: "Order not found" } } });

        renderPage();

        await waitFor(() => expect(screen.getByText("Tracking unavailable")).toBeInTheDocument());
        expect(screen.getByText("Order not found")).toBeInTheDocument();
        expect(screen.getByText("Back to order")).toHaveAttribute("href", "/orders/1");
    });

    it("shows a connecting banner while the socket isn't connected", async () => {
        mockUseSocket.mockReturnValue({ socket: null, connected: false, connectionState: "connecting" });
        api.get.mockImplementation((url) => {
            if (url === "/orders/1") return Promise.resolve({ data: { data: order } });
            return Promise.resolve({ data: { data: delivery } });
        });

        renderPage();

        await waitFor(() => expect(screen.getAllByText("Connecting…").length).toBeGreaterThan(0));
    });

    it("shows a reconnecting banner when the socket dropped after being connected", async () => {
        mockUseSocket.mockReturnValue({ socket: null, connected: false, connectionState: "reconnecting" });
        api.get.mockImplementation((url) => {
            if (url === "/orders/1") return Promise.resolve({ data: { data: order } });
            return Promise.resolve({ data: { data: delivery } });
        });

        renderPage();

        await waitFor(() => expect(screen.getByText("Reconnecting…")).toBeInTheDocument());
    });

    it("joins the order tracking room and computes distance/ETA once connected with a known agent position", async () => {
        mockUseSocket.mockReturnValue({ socket: noopSocket, connected: true, connectionState: "connected" });
        api.get.mockImplementation((url) => {
            if (url === "/orders/1") return Promise.resolve({ data: { data: order } });
            return Promise.resolve({ data: { data: delivery } });
        });

        renderPage();

        await waitFor(() => expect(noopSocket.emit).toHaveBeenCalledWith("join_order_tracking", "1"));
        await waitFor(() => expect(screen.getByText("Live")).toBeInTheDocument());
        // Distance/ETA are derived from agent position -> destination, so
        // once loaded they should no longer show the "calculating" placeholder.
        await waitFor(() => expect(screen.queryAllByText("Calculating…").length).toBe(0));
    });

    it("replaces the ETA with the road-routing value pushed on the next agent:position tick (Phase 5C)", async () => {
        const emittingSocket = makeEmittingSocket();
        mockUseSocket.mockReturnValue({ socket: emittingSocket, connected: true, connectionState: "connected" });
        api.get.mockImplementation((url) => {
            if (url === "/orders/1") return Promise.resolve({ data: { data: order } });
            return Promise.resolve({ data: { data: delivery } }); // eta_minutes: 22
        });

        renderPage();

        await waitFor(() => expect(screen.getByText("22 min")).toBeInTheDocument());

        act(() => {
            emittingSocket.trigger("agent:position", {
                orderId: "1", lat: -6.85, lng: 39.25,
                distance_remaining_km: 3.2, eta_minutes: 8,
                routing_provider: "osrm", degraded: false
            });
        });

        await waitFor(() => expect(screen.getByText("8 min")).toBeInTheDocument());
    });

    it("applies the road-routing ETA carried on a delivery:status event immediately, before the refetch resolves (Phase 5C)", async () => {
        const emittingSocket = makeEmittingSocket();
        mockUseSocket.mockReturnValue({ socket: emittingSocket, connected: true, connectionState: "connected" });
        api.get.mockImplementation((url) => {
            if (url === "/orders/1") return Promise.resolve({ data: { data: order } });
            return Promise.resolve({ data: { data: delivery } }); // eta_minutes: 22
        });

        renderPage();

        await waitFor(() => expect(screen.getByText("22 min")).toBeInTheDocument());

        act(() => {
            emittingSocket.trigger("delivery:status", {
                orderId: "1", status: "in_transit",
                distance_remaining_km: 5.0, eta_minutes: 11,
                routing_provider: "osrm", degraded: false
            });
        });

        await waitFor(() => expect(screen.getByText("11 min")).toBeInTheDocument());
        // The refetch this event also triggers should have gone out too.
        expect(api.get).toHaveBeenCalledWith("/delivery/1");
    });

    it("registers and tears down agent:position / delivery:status / delivery:assigned listeners on unmount", async () => {
        mockUseSocket.mockReturnValue({ socket: noopSocket, connected: true, connectionState: "connected" });
        api.get.mockImplementation((url) => {
            if (url === "/orders/1") return Promise.resolve({ data: { data: order } });
            return Promise.resolve({ data: { data: delivery } });
        });

        const { unmount } = renderPage();
        await waitFor(() => expect(noopSocket.on).toHaveBeenCalledWith("agent:position", expect.any(Function)));
        expect(noopSocket.on).toHaveBeenCalledWith("delivery:status", expect.any(Function));
        expect(noopSocket.on).toHaveBeenCalledWith("delivery:assigned", expect.any(Function));

        unmount();

        expect(noopSocket.emit).toHaveBeenCalledWith("leave_order_tracking", "1");
        expect(noopSocket.off).toHaveBeenCalledWith("agent:position", expect.any(Function));
        expect(noopSocket.off).toHaveBeenCalledWith("delivery:status", expect.any(Function));
        expect(noopSocket.off).toHaveBeenCalledWith("delivery:assigned", expect.any(Function));
    });

    it("renders the delivery status timeline reflecting the current delivery status", async () => {
        mockUseSocket.mockReturnValue({ socket: null, connected: false, connectionState: "connecting" });
        api.get.mockImplementation((url) => {
            if (url === "/orders/1") return Promise.resolve({ data: { data: order } });
            return Promise.resolve({ data: { data: delivery } }); // status: in_transit
        });

        renderPage();

        await waitFor(() => expect(screen.getByText("Delivery status")).toBeInTheDocument());
        expect(screen.getByText("In transit")).toBeInTheDocument();
        expect(screen.getByText("Delivered")).toBeInTheDocument();
    });

    it("opens a conversation with the agent and navigates to it when 'Message courier' is clicked", async () => {
        mockUseSocket.mockReturnValue({ socket: null, connected: false, connectionState: "connecting" });
        api.get.mockImplementation((url) => {
            if (url === "/orders/1") return Promise.resolve({ data: { data: order } });
            return Promise.resolve({ data: { data: delivery } });
        });
        api.post.mockResolvedValue({ data: { data: { id: 77 } } });
        const { default: userEvent } = await import("@testing-library/user-event");
        const user = userEvent.setup();

        renderPage();
        await waitFor(() => expect(screen.getByRole("button", { name: /Message courier/ })).toBeInTheDocument());

        await user.click(screen.getByRole("button", { name: /Message courier/ }));

        expect(api.post).toHaveBeenCalledWith("/chat/conversations", {
            other_user_id: 9,
            role: "delivery_agent",
            order_id: 1
        });
        await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/messages/77"));
    });
});
