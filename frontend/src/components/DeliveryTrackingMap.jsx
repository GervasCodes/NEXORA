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
