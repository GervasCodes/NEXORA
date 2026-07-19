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
// clicks the map. Parent (Checkout.jsx / SellerStore.jsx) owns whether a
// pin has been placed. label/placedHint/emptyHint let callers other than
// checkout (e.g. a seller's pickup pin) reuse this with wording that
// makes sense for them.
export default function LocationPicker({
    value,
    onChange,
    label = "Drop a pin for delivery (optional but recommended)",
    placedHint = "Pin placed — this speeds up matching you with the nearest delivery agent.",
    emptyHint = "Tap the map to drop a pin, or leave blank to skip auto-matching (an agent can still claim your order manually)."
}) {
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
                <label className="block text-sm">{label}</label>
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
                {value ? placedHint : emptyHint}
            </p>
        </div>
    );
}
