import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap } from "react-leaflet";
import { useEffect, useMemo } from "react";
import "leaflet/dist/leaflet.css";
import { DEFAULT_CENTER, agentIcon, destinationIcon, pickupIcon, stalledIcon } from "../utils/mapConfig";

// Fits the map to every marker currently on it whenever the point set
// changes (a delivery starting/finishing, or the very first load) -
// without fighting the admin if they've since panned/zoomed to look at
// one area, since this only runs when the *set* of points changes, not
// on every position tick.
function FitToPoints({ points }) {
    const map = useMap();

    useEffect(() => {
        if (points.length === 0) return;
        if (points.length === 1) {
            map.setView(points[0], 13);
            return;
        }
        map.fitBounds(points, { padding: [40, 40], maxZoom: 15 });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [points.length]);

    return null;
}

// Live overview map for the admin dispatch board: every active delivery's
// shop (pickup) pin and buyer destination pin, joined by a dashed route
// line, plus every online agent's current position - so dispatch can see
// at a glance where deliveries and delivery personnel actually are around
// the city, not just as a list. Positions update live as `deliveries` and
// `agents` change (AdminDispatch.jsx already keeps both current via the
// dispatch:* socket events), so this component just re-renders with
// whatever it's handed.
export default function AdminDispatchMap({ deliveries, agents, unmatchedOrders = [], height = 420 }) {
    // Agents' live positions come from the `agents` list, which is kept
    // current by the dispatch:agent_position socket event in
    // AdminDispatch.jsx - not from each delivery's own
    // agent_current_lat/lng snapshot taken at initial page load, which
    // never gets patched by that event.
    const shopMarkers = useMemo(
        () =>
            deliveries
                .filter((d) => d.seller_pickup_lat != null && d.seller_pickup_lng != null)
                .map((d) => ({
                    key: `shop-${d.id}`,
                    orderNumber: d.order_number,
                    storeName: d.seller_store_name,
                    lat: Number(d.seller_pickup_lat),
                    lng: Number(d.seller_pickup_lng)
                })),
        [deliveries]
    );

    const destinationMarkers = useMemo(
        () =>
            deliveries
                .filter((d) => d.delivery_lat != null && d.delivery_lng != null)
                .map((d) => ({
                    key: `dest-${d.id}`,
                    orderNumber: d.order_number,
                    city: d.shipping_city || d.shipping_region,
                    lat: Number(d.delivery_lat),
                    lng: Number(d.delivery_lng)
                })),
        [deliveries]
    );

    const routeLines = useMemo(
        () =>
            deliveries
                .filter((d) => d.seller_pickup_lat != null && d.seller_pickup_lng != null && d.delivery_lat != null && d.delivery_lng != null)
                .map((d) => ({
                    key: `route-${d.id}`,
                    positions: [
                        [Number(d.seller_pickup_lat), Number(d.seller_pickup_lng)],
                        [Number(d.delivery_lat), Number(d.delivery_lng)]
                    ]
                })),
        [deliveries]
    );

    const agentMarkers = useMemo(
        () =>
            agents
                .filter((a) => a.current_lat != null && a.current_lng != null)
                .map((a) => ({
                    key: `agent-${a.id}`,
                    name: `${a.first_name || ""} ${a.last_name || ""}`.trim(),
                    isBusy: Number(a.active_delivery_count) > 0,
                    lat: Number(a.current_lat),
                    lng: Number(a.current_lng)
                })),
        [agents]
    );

    // Phase 3 (Admin Manual Override & Ops Visibility) - only orders
    // that are actually flagged stalled get a pin here (the wider
    // unmatchedOrders list can include ones only a few minutes old,
    // which would just clutter the map with routine, non-actionable
    // noise). Not every unmatched order has delivery coordinates
    // (buyer didn't drop a map pin at checkout), same caveat the
    // destination markers above already have.
    const stalledMarkers = useMemo(
        () =>
            unmatchedOrders
                .filter((o) => o.is_stalled && o.delivery_lat != null && o.delivery_lng != null)
                .map((o) => ({
                    key: `stalled-${o.order_id}`,
                    orderNumber: o.order_number,
                    city: o.shipping_city || o.shipping_region,
                    minutesWaiting: o.minutes_waiting,
                    lat: Number(o.delivery_lat),
                    lng: Number(o.delivery_lng)
                })),
        [unmatchedOrders]
    );

    const allPoints = useMemo(
        () => [
            ...shopMarkers.map((m) => [m.lat, m.lng]),
            ...destinationMarkers.map((m) => [m.lat, m.lng]),
            ...agentMarkers.map((m) => [m.lat, m.lng]),
            ...stalledMarkers.map((m) => [m.lat, m.lng])
        ],
        [shopMarkers, destinationMarkers, agentMarkers, stalledMarkers]
    );

    const center = allPoints[0] || DEFAULT_CENTER;

    return (
        <div className="rounded-lg overflow-hidden border border-line" style={{ height }}>
            <MapContainer center={center} zoom={12} style={{ height: "100%", width: "100%" }}>
                <TileLayer
                    attribution='&copy; OpenStreetMap contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />

                {routeLines.map((r) => (
                    <Polyline
                        key={r.key}
                        positions={r.positions}
                        pathOptions={{ color: "#0F7A6C", weight: 3, opacity: 0.5, dashArray: "1 8" }}
                    />
                ))}

                {shopMarkers.map((m) => (
                    <Marker key={m.key} position={[m.lat, m.lng]} icon={pickupIcon}>
                        <Popup>
                            <strong>{m.storeName || "Shop"}</strong>
                            <br />
                            Order {m.orderNumber}
                        </Popup>
                    </Marker>
                ))}

                {destinationMarkers.map((m) => (
                    <Marker key={m.key} position={[m.lat, m.lng]} icon={destinationIcon}>
                        <Popup>
                            <strong>Delivery destination</strong>
                            <br />
                            Order {m.orderNumber}
                            {m.city ? ` · ${m.city}` : ""}
                        </Popup>
                    </Marker>
                ))}

                {agentMarkers.map((m) => (
                    <Marker key={m.key} position={[m.lat, m.lng]} icon={agentIcon}>
                        <Popup>
                            <strong>{m.name || "Delivery agent"}</strong>
                            <br />
                            {m.isBusy ? "On a delivery" : "Idle"}
                        </Popup>
                    </Marker>
                ))}

                {stalledMarkers.map((m) => (
                    <Marker key={m.key} position={[m.lat, m.lng]} icon={stalledIcon}>
                        <Popup>
                            <strong>Stalled order</strong>
                            <br />
                            Order {m.orderNumber}
                            {m.city ? ` · ${m.city}` : ""}
                            <br />
                            Waiting {m.minutesWaiting}m
                        </Popup>
                    </Marker>
                ))}

                <FitToPoints points={allPoints} />
            </MapContainer>
        </div>
    );
}
