import { useState } from "react";
import { MapContainer, TileLayer, Marker, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { DEFAULT_CENTER, destinationIcon } from "../utils/mapConfig";

function ClickToPlace({ onPick }) {
    useMapEvents({
        click(e) {
            onPick(e.latlng);
        }
    });
    return null;
}

// Controlled-ish: reports { lat, lng } up via onChange whenever the buyer
// clicks the map. Parent (Checkout.jsx) owns whether a pin has been placed.
export default function LocationPicker({ value, onChange }) {
    const [locating, setLocating] = useState(false);

    const useMyLocation = () => {
        if (!navigator.geolocation) return;
        setLocating(true);
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                onChange({ lat: pos.coords.latitude, lng: pos.coords.longitude });
                setLocating(false);
            },
            () => setLocating(false),
            { enableHighAccuracy: true, timeout: 8000 }
        );
    };

    return (
        <div>
            <div className="flex items-center justify-between mb-2">
                <label className="block text-sm">Drop a pin for delivery (optional but recommended)</label>
                <button type="button" onClick={useMyLocation} disabled={locating}
                    className="text-xs text-teal hover:underline disabled:opacity-60">
                    {locating ? "Locating…" : "Use my current location"}
                </button>
            </div>

            <div className="rounded-md overflow-hidden border border-line" style={{ height: 260 }}>
                <MapContainer
                    center={value ? [value.lat, value.lng] : DEFAULT_CENTER}
                    zoom={value ? 15 : 12}
                    style={{ height: "100%", width: "100%" }}
                >
                    <TileLayer
                        attribution='&copy; OpenStreetMap contributors'
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />
                    <ClickToPlace onPick={onChange} />
                    {value && <Marker position={[value.lat, value.lng]} icon={destinationIcon} />}
                </MapContainer>
            </div>

            <p className="text-xs text-ash mt-1.5">
                {value
                    ? "Pin placed — this speeds up matching you with the nearest delivery agent."
                    : "Tap the map to drop a pin, or leave blank to skip auto-matching (an agent can still claim your order manually)."}
            </p>
        </div>
    );
}
