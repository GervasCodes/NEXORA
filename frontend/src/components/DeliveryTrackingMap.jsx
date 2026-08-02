import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap } from "react-leaflet";
import { useEffect, useState, useCallback } from "react";
import "leaflet/dist/leaflet.css";
import { DEFAULT_CENTER, agentIcon, destinationIcon, pickupIcon } from "../utils/mapConfig";
import { useLanguage } from "../context/LanguageContext";

// Recenters the map to keep the agent marker in view as it moves,
// without fighting the user if they've panned/zoomed manually - only
// re-centers when the agent is meaningfully outside the current view.
function FollowAgent({ agentPos }) {
    const map = useMap();

    useEffect(() => {
        if (!agentPos) return;
        const bounds = map.getBounds();
        if (!bounds.contains([agentPos.lat, agentPos.lng])) {
            map.panTo([agentPos.lat, agentPos.lng], { animate: true, duration: 0.8 });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [agentPos?.lat, agentPos?.lng]);

    return null;
}

// Leaflet caches its container size on init, so whenever the container's
// dimensions change outside of a normal resize event (like toggling
// fullscreen) we need to explicitly tell it to re-measure.
function InvalidateOnChange({ watch }) {
    const map = useMap();

    useEffect(() => {
        const id = setTimeout(() => map.invalidateSize(), 120);
        return () => clearTimeout(id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [watch]);

    return null;
}

function ExpandIcon() {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
            <path d="M8 3H5a2 2 0 0 0-2 2v3" />
            <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
            <path d="M3 16v3a2 2 0 0 0 2 2h3" />
            <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
        </svg>
    );
}

function CollapseIcon() {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
            <path d="M8 3v3a2 2 0 0 1-2 2H3" />
            <path d="M21 8h-3a2 2 0 0 1-2-2V3" />
            <path d="M3 16h3a2 2 0 0 1 2 2v3" />
            <path d="M16 21v-3a2 2 0 0 1 2-2h3" />
        </svg>
    );
}

export default function DeliveryTrackingMap({ agentPos, pickup, destination, height = 260, fitAll = false }) {
    const { t } = useLanguage();
    const [isFullscreen, setIsFullscreen] = useState(false);

    const toggleFullscreen = useCallback(() => {
        setIsFullscreen((prev) => !prev);
    }, []);

    // Let Escape close fullscreen, and lock background scroll while it's open.
    useEffect(() => {
        if (!isFullscreen) return;

        const handleKeyDown = (e) => {
            if (e.key === "Escape") setIsFullscreen(false);
        };
        document.addEventListener("keydown", handleKeyDown);

        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";

        return () => {
            document.removeEventListener("keydown", handleKeyDown);
            document.body.style.overflow = previousOverflow;
        };
    }, [isFullscreen]);

    const center = agentPos
        ? [agentPos.lat, agentPos.lng]
        : destination
            ? [destination.lat, destination.lng]
            : DEFAULT_CENTER;

    const routePoints = pickup && destination
        ? [[pickup.lat, pickup.lng], [destination.lat, destination.lng]]
        : null;

    const mapBody = (
        <MapContainer center={center} zoom={13} style={{ height: "100%", width: "100%" }}>
            <TileLayer
                attribution='&copy; OpenStreetMap contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            {routePoints && (
                <Polyline
                    positions={routePoints}
                    pathOptions={{ color: "#0F7A6C", weight: 3, opacity: 0.55, dashArray: "1 8" }}
                />
            )}

            {pickup && (
                <Marker position={[pickup.lat, pickup.lng]} icon={pickupIcon}>
                    <Popup>{t("delivery.tracking.pickup")}</Popup>
                </Marker>
            )}

            {destination && (
                <Marker position={[destination.lat, destination.lng]} icon={destinationIcon}>
                    <Popup>{t("delivery.tracking.destination")}</Popup>
                </Marker>
            )}

            {agentPos && (
                <Marker position={[agentPos.lat, agentPos.lng]} icon={agentIcon}>
                    <Popup>{t("delivery.tracking.agentEnRoute")}</Popup>
                </Marker>
            )}

            {!fitAll && <FollowAgent agentPos={agentPos} />}
            <InvalidateOnChange watch={isFullscreen} />
        </MapContainer>
    );

    return (
        <>
            {/* Keeps the surrounding layout stable while the map is popped out fullscreen. */}
            {isFullscreen && <div style={{ height }} aria-hidden="true" />}

            <div
                className={
                    isFullscreen
                        ? "fixed inset-0 z-[2000] bg-black/50 flex items-center justify-center p-0 sm:p-4"
                        : "relative rounded-md overflow-hidden border border-line"
                }
                style={isFullscreen ? undefined : { height }}
            >
                <div
                    className={
                        isFullscreen
                            ? "relative bg-white overflow-hidden w-full h-full sm:h-[90vh] sm:max-w-5xl sm:rounded-md border border-line"
                            : "relative w-full h-full"
                    }
                >
                    {mapBody}

                    <button
                        type="button"
                        onClick={toggleFullscreen}
                        aria-label={t(isFullscreen ? "delivery.tracking.exitFullscreen" : "delivery.tracking.viewFullscreen")}
                        title={t(isFullscreen ? "delivery.tracking.exitFullscreen" : "delivery.tracking.viewFullscreen")}
                        className="absolute top-2 right-2 z-[1000] bg-white/95 hover:bg-white text-ink rounded-md p-1.5 shadow-md border border-line transition-colors focus-ring"
                    >
                        {isFullscreen ? <CollapseIcon /> : <ExpandIcon />}
                    </button>
                </div>
            </div>
        </>
    );
}
