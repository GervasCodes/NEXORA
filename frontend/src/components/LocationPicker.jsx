import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { DEFAULT_CENTER, destinationIcon } from "../utils/mapConfig";
import { reverseGeocode } from "../utils/reverseGeocode";
import { getPositionOnce } from "../utils/geolocation";
import { useLanguage } from "../context/LanguageContext";

function ClickToPlace({ onPick }) {
    useMapEvents({
        click(e) {
            onPick(e.latlng);
        }
    });
    return null;
}

// The map's `center` prop only applies on first render, so a position that
// arrives later (the "use my location" result) would place the marker
// off-screen. Pan only when the pin is outside the current view, so a tap
// inside the view never makes the map jump under the buyer's finger.
function KeepPinInView({ position }) {
    const map = useMap();
    useEffect(() => {
        if (!position) return;
        const latlng = [position.lat, position.lng];
        if (!map.getBounds().contains(latlng)) map.setView(latlng, Math.max(map.getZoom(), 15));
    }, [map, position?.lat, position?.lng]); // eslint-disable-line react-hooks/exhaustive-deps
    return null;
}

/**
 * Delivery-pin map with address suggestion (Phase 7).
 *
 * - One-shot location only (see utils/geolocation.js); every failure shows a
 *   plain message instead of failing silently, and never blocks the form.
 * - The pin can be tapped into place or dragged; either re-resolves the
 *   address (reverse geocoding via the existing Nominatim helper).
 * - `showPrompt` adds an optional "fill in my address from my location?" card
 *   (asked once, easy to decline) while there is no pin yet.
 * - `onAddressResolved({ address, city, region })` only ever suggests values;
 *   the parent keeps those fields editable.
 */
export default function LocationPicker({
    value,
    onChange,
    onAddressResolved,
    label,
    placedHint,
    emptyHint,
    showPrompt = false
}) {
    const { t } = useLanguage();
    const [locating, setLocating] = useState(false);
    const [resolvingAddress, setResolvingAddress] = useState(false);
    // null | "denied" | "unavailable" | "timeout" | "unsupported" | "lookupFailed"
    const [problem, setProblem] = useState(null);
    const [promptDismissed, setPromptDismissed] = useState(false);

    // Guards against a slower, earlier lookup overwriting a newer one if the
    // pin gets moved again before the first request returns.
    const requestIdRef = useRef(0);

    const resolveAddress = (latlng) => {
        if (!onAddressResolved) return;
        const requestId = ++requestIdRef.current;
        setResolvingAddress(true);

        reverseGeocode(latlng)
            .then((fields) => {
                if (requestIdRef.current !== requestId) return;
                setProblem((current) => (current === "lookupFailed" ? null : current));
                onAddressResolved(fields);
            })
            .catch(() => {
                // The pin stays placed and usable; only the suggestion is lost.
                if (requestIdRef.current === requestId) setProblem("lookupFailed");
            })
            .finally(() => {
                if (requestIdRef.current === requestId) setResolvingAddress(false);
            });
    };

    const handlePick = (latlng) => {
        onChange({ lat: latlng.lat, lng: latlng.lng });
        resolveAddress(latlng);
    };

    const useMyLocation = async () => {
        setPromptDismissed(true);
        setProblem(null);
        setLocating(true);
        try {
            const position = await getPositionOnce();
            handlePick({ lat: position.lat, lng: position.lng });
        } catch (err) {
            setProblem(err?.code || "unavailable");
        } finally {
            setLocating(false);
        }
    };

    const markerHandlers = useMemo(() => ({
        dragend(e) {
            handlePick(e.target.getLatLng());
        }
    // handlePick closes over the parent's callbacks; re-binding on every
    // render is harmless but unnecessary, so bind once per callback identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }), [onChange, onAddressResolved]);

    const promptVisible = showPrompt && !value && !promptDismissed && !locating;

    return (
        <div>
            <div className="flex items-center justify-between mb-2">
                <label className="block text-sm">{label || t("location.label")}</label>
                <button type="button" onClick={useMyLocation} disabled={locating}
                    className="text-xs text-teal hover:underline disabled:opacity-60">
                    {locating ? t("location.locating") : t("location.useMyLocation")}
                </button>
            </div>

            {promptVisible && (
                <div className="border border-line rounded-md px-3 py-2.5 mb-2 bg-teal/5 animate-fade-in">
                    <p className="text-sm font-medium text-ink">{t("location.prompt.title")}</p>
                    <p className="text-xs text-ash mt-0.5">{t("location.prompt.body")}</p>
                    <div className="flex gap-2 mt-2">
                        <button type="button" onClick={useMyLocation}
                            className="text-xs font-semibold bg-ink text-paper px-3 py-1.5 rounded-md hover:opacity-90 focus-ring">
                            {t("location.prompt.accept")}
                        </button>
                        <button type="button" onClick={() => setPromptDismissed(true)}
                            className="text-xs border border-line px-3 py-1.5 rounded-md hover:border-ink transition-colors focus-ring">
                            {t("location.prompt.decline")}
                        </button>
                    </div>
                </div>
            )}

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
                    <KeepPinInView position={value} />
                    {value && (
                        <Marker
                            position={[value.lat, value.lng]}
                            icon={destinationIcon}
                            draggable
                            eventHandlers={markerHandlers}
                        />
                    )}
                </MapContainer>
            </div>

            {problem && (
                <p role="alert" className="text-xs text-coral mt-1.5">{t(`location.error.${problem}`)}</p>
            )}
            <p className="text-xs text-ash mt-1.5" role="status">
                {resolvingAddress
                    ? t("location.lookingUp")
                    : value
                        ? `${placedHint || t("location.placedHint")} ${t("location.dragHint")}`
                        : (emptyHint || t("location.emptyHint"))}
            </p>
        </div>
    );
}
