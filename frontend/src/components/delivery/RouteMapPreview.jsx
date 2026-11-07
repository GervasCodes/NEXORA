import { MapContainer, TileLayer, Marker, Polyline } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { pickupIcon, destinationIcon } from "../../utils/mapConfig";

// Small non-interactive pickup -> drop-off preview. Straight line only;
// real turn-by-turn is one tap away via the navigation buttons.
export default function RouteMapPreview({ pickup, dropoff }) {
    const points = [pickup, dropoff].filter(Boolean).map((p) => [Number(p.lat), Number(p.lng)]);
    if (points.length === 0) return null;
    return (
        <div className="h-40 rounded-md overflow-hidden border border-line">
            <MapContainer
                bounds={points.length > 1 ? points : undefined}
                center={points[0]}
                zoom={14}
                boundsOptions={{ padding: [24, 24] }}
                zoomControl={false}
                dragging={false}
                scrollWheelZoom={false}
                doubleClickZoom={false}
                touchZoom={false}
                attributionControl={false}
                style={{ height: "100%", width: "100%" }}
            >
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                {pickup && <Marker position={[Number(pickup.lat), Number(pickup.lng)]} icon={pickupIcon} />}
                {dropoff && <Marker position={[Number(dropoff.lat), Number(dropoff.lng)]} icon={destinationIcon} />}
                {points.length > 1 && <Polyline positions={points} pathOptions={{ color: "#0F7A6C", weight: 3, dashArray: "6 6" }} />}
            </MapContainer>
        </div>
    );
}
