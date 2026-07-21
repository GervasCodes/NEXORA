import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap } from "react-leaflet";
import { useEffect } from "react";
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

// Real Leaflet map for the full-screen tracking page (see
// pages/OrderTrackingPage.jsx). Renders the pickup pin, destination pin,
// a straight-line route between them (see Phase 5 for real road
// routing), and the agent's live, smoothly-interpolated position -
// `agentPos` is expected to already be the smoothed value from
// hooks/useSmoothPosition, this component just renders whatever it's
// given. Also used standalone in tests.
//
// Marker glide: Leaflet positions markers with an inline
// `transform: translate3d(...)` that a global CSS rule
// (.leaflet-marker-icon { transition: transform ... }, see index.css)
// turns into a visual glide on its own - combined with the JS-side
// easing in useSmoothPosition, movement stays smooth even when position
// ticks arrive at an uneven cadence.
export default function DeliveryTrackingMap({ agentPos, pickup, destination, height = 260, fitAll = false }) {
    const { t } = useLanguage();

    const center = agentPos
        ? [agentPos.lat, agentPos.lng]
        : destination
            ? [destination.lat, destination.lng]
            : DEFAULT_CENTER;

    const routePoints = pickup && destination
        ? [[pickup.lat, pickup.lng], [destination.lat, destination.lng]]
        : null;

    return (
        <div className="relative rounded-md overflow-hidden border border-line" style={{ height }}>
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
            </MapContainer>
        </div>
    );
}
