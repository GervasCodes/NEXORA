import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LanguageProvider } from "../../src/context/LanguageContext";

// react-leaflet needs a real map in a real browser; what matters here is how
// LocationPicker drives it (draggable marker + its dragend handler).
const marker = vi.hoisted(() => ({ props: null }));
vi.mock("react-leaflet", () => ({
    MapContainer: ({ children }) => <div data-testid="map">{children}</div>,
    TileLayer: () => null,
    Marker: (props) => { marker.props = props; return <div data-testid="marker" />; },
    useMapEvents: () => null,
    useMap: () => ({ getBounds: () => ({ contains: () => true }), setView: vi.fn(), getZoom: () => 12 })
}));
vi.mock("leaflet/dist/leaflet.css", () => ({}));
vi.mock("../../src/utils/mapConfig", () => ({ DEFAULT_CENTER: [0, 0], destinationIcon: {} }));
vi.mock("../../src/utils/reverseGeocode", () => ({ reverseGeocode: vi.fn() }));

import { reverseGeocode } from "../../src/utils/reverseGeocode";
import LocationPicker from "../../src/components/LocationPicker";

const originalGeolocation = Object.getOwnPropertyDescriptor(navigator, "geolocation");
const setGeolocation = (value) => Object.defineProperty(navigator, "geolocation", { value, configurable: true });

const renderPicker = (props = {}) => {
    const onChange = vi.fn();
    const onAddressResolved = vi.fn();
    render(
        <LanguageProvider>
            <LocationPicker value={null} onChange={onChange} onAddressResolved={onAddressResolved} {...props} />
        </LanguageProvider>
    );
    return { onChange, onAddressResolved };
};

const useMyLocationButton = () => screen.getByRole("button", { name: "Use my current location" });

beforeEach(() => {
    marker.props = null;
    reverseGeocode.mockReset();
});

afterEach(() => {
    if (originalGeolocation) Object.defineProperty(navigator, "geolocation", originalGeolocation);
    else delete navigator.geolocation;
});

describe("LocationPicker - one-shot location", () => {
    it("asks for the position once, places the pin and suggests the address", async () => {
        const geo = {
            getCurrentPosition: vi.fn((ok) => ok({ coords: { latitude: -6.8, longitude: 39.2, accuracy: 20 } })),
            watchPosition: vi.fn()
        };
        setGeolocation(geo);
        reverseGeocode.mockResolvedValue({ address: "Kinondoni Rd", city: "Dar es Salaam", region: "Dar es Salaam" });
        const user = userEvent.setup();
        const { onChange, onAddressResolved } = renderPicker();

        await user.click(useMyLocationButton());

        await waitFor(() => expect(onAddressResolved).toHaveBeenCalledWith({
            address: "Kinondoni Rd", city: "Dar es Salaam", region: "Dar es Salaam"
        }));
        expect(onChange).toHaveBeenCalledWith({ lat: -6.8, lng: 39.2 });
        expect(geo.getCurrentPosition).toHaveBeenCalledTimes(1);
        expect(geo.watchPosition).not.toHaveBeenCalled();
        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("explains when permission is denied and leaves the form usable", async () => {
        setGeolocation({ getCurrentPosition: vi.fn((_ok, fail) => fail({ code: 1, message: "denied" })) });
        const user = userEvent.setup();
        const { onChange } = renderPicker();

        await user.click(useMyLocationButton());

        expect(await screen.findByRole("alert")).toHaveTextContent(/turned off for this site/i);
        expect(onChange).not.toHaveBeenCalled();
        expect(useMyLocationButton()).toBeEnabled();
    });

    it("explains a timeout and an unavailable position with their own messages", async () => {
        const user = userEvent.setup();
        setGeolocation({ getCurrentPosition: vi.fn((_ok, fail) => fail({ code: 3 })) });
        renderPicker();
        await user.click(useMyLocationButton());
        expect(await screen.findByRole("alert")).toHaveTextContent(/took too long/i);
    });

    it("explains when the browser has no location support", async () => {
        setGeolocation(undefined);
        const user = userEvent.setup();
        renderPicker();

        await user.click(useMyLocationButton());

        expect(await screen.findByRole("alert")).toHaveTextContent(/can't share your location/i);
    });

    it("keeps the pin and says so when the address lookup fails", async () => {
        setGeolocation({ getCurrentPosition: vi.fn((ok) => ok({ coords: { latitude: -6.8, longitude: 39.2 } })) });
        reverseGeocode.mockRejectedValue(new Error("offline"));
        const user = userEvent.setup();
        const { onChange, onAddressResolved } = renderPicker();

        await user.click(useMyLocationButton());

        expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't find an address/i);
        expect(onChange).toHaveBeenCalledWith({ lat: -6.8, lng: 39.2 });
        expect(onAddressResolved).not.toHaveBeenCalled();
    });
});

describe("LocationPicker - optional prompt", () => {
    it("shows the prompt only when asked to and there is no pin; declining hides it without asking the browser", async () => {
        const geo = { getCurrentPosition: vi.fn() };
        setGeolocation(geo);
        const user = userEvent.setup();
        renderPicker({ showPrompt: true });

        expect(screen.getByText("Fill in your address from your location?")).toBeInTheDocument();
        await user.click(screen.getByRole("button", { name: "No thanks, I'll type it" }));

        expect(screen.queryByText("Fill in your address from your location?")).not.toBeInTheDocument();
        expect(geo.getCurrentPosition).not.toHaveBeenCalled();
    });

    it("accepting the prompt requests the location", async () => {
        const geo = { getCurrentPosition: vi.fn((ok) => ok({ coords: { latitude: 1, longitude: 2 } })) };
        setGeolocation(geo);
        reverseGeocode.mockResolvedValue({ address: "", city: "", region: "" });
        const user = userEvent.setup();
        const { onChange } = renderPicker({ showPrompt: true });

        await user.click(screen.getByRole("button", { name: "Use my location" }));

        await waitFor(() => expect(onChange).toHaveBeenCalledWith({ lat: 1, lng: 2 }));
        expect(geo.getCurrentPosition).toHaveBeenCalledTimes(1);
    });

    it("does not show the prompt by default or once a pin exists", () => {
        setGeolocation({ getCurrentPosition: vi.fn() });
        const { unmount } = render(
            <LanguageProvider><LocationPicker value={null} onChange={() => {}} /></LanguageProvider>
        );
        expect(screen.queryByText("Fill in your address from your location?")).not.toBeInTheDocument();
        unmount();

        render(
            <LanguageProvider><LocationPicker value={{ lat: 1, lng: 2 }} onChange={() => {}} showPrompt /></LanguageProvider>
        );
        expect(screen.queryByText("Fill in your address from your location?")).not.toBeInTheDocument();
    });
});

describe("LocationPicker - draggable pin", () => {
    it("renders a draggable marker and re-resolves the address when it is dropped somewhere new", async () => {
        reverseGeocode.mockResolvedValue({ address: "Samora Ave", city: "Dar es Salaam", region: "Dar es Salaam" });
        const { onChange, onAddressResolved } = renderPicker({ value: { lat: -6.8, lng: 39.2 } });

        expect(marker.props.draggable).toBe(true);
        marker.props.eventHandlers.dragend({ target: { getLatLng: () => ({ lat: -6.81, lng: 39.21 }) } });

        expect(onChange).toHaveBeenCalledWith({ lat: -6.81, lng: 39.21 });
        await waitFor(() => expect(onAddressResolved).toHaveBeenCalledWith(expect.objectContaining({ address: "Samora Ave" })));
        expect(reverseGeocode).toHaveBeenCalledWith({ lat: -6.81, lng: 39.21 });
    });

    it("tells the buyer the pin can be dragged", () => {
        renderPicker({ value: { lat: -6.8, lng: 39.2 } });
        expect(screen.getByRole("status")).toHaveTextContent(/drag the pin/i);
    });
});
