import { useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { DEFAULT_CENTER, destinationIcon } from "../utils/mapConfig";
import { reverseGeocode } from "../utils/reverseGeocode";

function ClickToPlace({ onPick }) {
    useMapEvents({
        click(e) {
            onPick(e.latlng);
        }
    });
    return null;
}


export default function LocationPicker({
    value,
    onChange,
    onAddressResolved,
    label = "Drop a pin for delivery (optional but recommended)",
    placedHint = "Pin placed — this speeds up matching you with the nearest delivery agent.",
    emptyHint = "Tap the map to drop a pin, or leave blank to skip auto-matching (an agent can still claim your order manually)."
}) {
    const [locating, setLocating] = useState(false);
    const [resolvingAddress, setResolvingAddress] = useState(false);

    // Guards against a slower, earlier lookup overwriting a newer one if
    // the pin gets moved again before the first request returns.
    const requestIdRef = useRef(0);

    // Reverse-geocodes a placed/moved pin and hands the result to the
    // parent so it can pre-fill address text fields - those fields stay
    // separately editable in the parent form, this only ever suggests a
    // starting value. Silent on failure (offline, Nominatim rate-limited,
    // pin dropped somewhere with no address data): the pin itself is
    // still placed and usable even if the lookup never resolves.
    const resolveAddress = (latlng) => {
        if (!onAddressResolved) return;
        const requestId = ++requestIdRef.current;
        setResolvingAddress(true);

        reverseGeocode(latlng)
            .then((fields) => {
                if (requestIdRef.current === requestId) onAddressResolved(fields);
            })
            .catch(() => {})
            .finally(() => {
                if (requestIdRef.current === requestId) setResolvingAddress(false);
            });
    };

    const handlePick = (latlng) => {
        onChange(latlng);
        resolveAddress(latlng);
    };

    const useMyLocation = () => {
        if (!navigator.geolocation) return;
        setLocating(true);
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const latlng = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                onChange(latlng);
                resolveAddress(latlng);
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
                    <ClickToPlace onPick={handlePick} />
                    {value && <Marker position={[value.lat, value.lng]} icon={destinationIcon} />}
                </MapContainer>
            </div>

            <p className="text-xs text-ash mt-1.5">
                {resolvingAddress ? "Looking up address…" : value ? placedHint : emptyHint}
            </p>
        </div>
    );
}
