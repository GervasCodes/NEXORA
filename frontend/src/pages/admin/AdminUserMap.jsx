import { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import api from "../../api/client";
import { useSocket } from "../../context/SocketContext";
import { DEFAULT_CENTER, buyerMapIcon, sellerMapIcon } from "../../utils/mapConfig";
import PageLoader from "../../components/PageLoader";
import PageMeta from "../../components/PageMeta";

// Same auto-fit behavior as AdminDispatchMap.jsx - fits to whatever's
// currently plotted whenever the *set* of points changes, without
// fighting an admin who's since panned/zoomed to look at one area.
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

// Phase 5 (map showing users) - live map of every opted-in buyer/seller,
// per the overridden Phase 1.4 decision (opt-out, both roles, precise
// coordinates - see PHASE1_DECISIONS.md #4). Loads the current snapshot
// via GET /admin/users/map, then keeps it live from the `admins` room's
// `map:user_position` events (see socket.js's `user:location` handler) -
// same "load once, then patch from a live socket feed" shape as
// AdminDispatch.jsx's agent tracking, just without dispatch's dashed
// routes/shop pins since there's no delivery here to draw a route for.
export default function AdminUserMap() {
    const { socket, connected } = useSocket();
    const [points, setPoints] = useState([]);
    const [loading, setLoading] = useState(true);
    const [roleFilter, setRoleFilter] = useState("all");

    useEffect(() => {
        api.get("/admin/users/map")
            .then(({ data }) => setPoints(data.data))
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => {
        if (!socket || !connected) return undefined;

        const handlePosition = ({ userId, role, lat, lng, timestamp }) => {
            setPoints((prev) => {
                const exists = prev.some((p) => p.id === userId);
                if (!exists) {
                    // A user who just opted in (or sent their first-ever
                    // ping) won't be in the initial snapshot yet - add
                    // them rather than silently dropping the update.
                    return [...prev, { id: userId, role, location_lat: lat, location_lng: lng, location_updated_at: timestamp }];
                }
                return prev.map((p) =>
                    p.id === userId ? { ...p, location_lat: lat, location_lng: lng, location_updated_at: timestamp } : p
                );
            });
        };

        socket.on("map:user_position", handlePosition);
        return () => socket.off("map:user_position", handlePosition);
    }, [socket, connected]);

    const visiblePoints = useMemo(
        () => (roleFilter === "all" ? points : points.filter((p) => p.role === roleFilter)),
        [points, roleFilter]
    );

    const markers = useMemo(
        () =>
            visiblePoints
                .filter((p) => p.location_lat != null && p.location_lng != null)
                .map((p) => ({
                    key: `user-${p.id}`,
                    id: p.id,
                    name: `${p.first_name || ""} ${p.last_name || ""}`.trim() || `User #${p.id}`,
                    role: p.role,
                    isOnline: Boolean(p.is_online),
                    lat: Number(p.location_lat),
                    lng: Number(p.location_lng)
                })),
        [visiblePoints]
    );

    const points2d = useMemo(() => markers.map((m) => [m.lat, m.lng]), [markers]);

    if (loading) return <PageLoader />;

    return (
        <div className="p-4 space-y-4">
            <PageMeta title="User map" />
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                    <h1 className="font-display text-xl">User map</h1>
                    <p className="text-ash text-sm mt-0.5">
                        {markers.length} opted-in {roleFilter === "all" ? "user" : roleFilter}{markers.length === 1 ? "" : "s"} currently visible.
                    </p>
                </div>

                <div className="flex gap-2">
                    {["all", "buyer", "seller"].map((option) => (
                        <button
                            key={option}
                            onClick={() => setRoleFilter(option)}
                            className={`px-3 py-1.5 rounded-md text-sm border ${
                                roleFilter === option ? "bg-ink text-paper border-ink" : "border-line hover:bg-mist"
                            }`}
                        >
                            {option === "all" ? "All" : option === "buyer" ? "Buyers" : "Sellers"}
                        </button>
                    ))}
                </div>
            </div>

            <div className="rounded-lg overflow-hidden border border-line" style={{ height: 560 }}>
                <MapContainer center={DEFAULT_CENTER} zoom={12} style={{ height: "100%", width: "100%" }}>
                    <TileLayer
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />
                    <FitToPoints points={points2d} />
                    {markers.map((m) => (
                        <Marker key={m.key} position={[m.lat, m.lng]} icon={m.role === "seller" ? sellerMapIcon : buyerMapIcon}>
                            <Popup>
                                <div className="text-sm">
                                    <div className="font-semibold">{m.name}</div>
                                    <div className="text-ash capitalize">{m.role} {m.isOnline ? "• online now" : ""}</div>
                                </div>
                            </Popup>
                        </Marker>
                    ))}
                </MapContainer>
            </div>

            <p className="text-ash text-xs">
                Only buyers/sellers who currently have location sharing turned on appear here. This updates live as they move; anyone who turns sharing off disappears immediately.
            </p>
        </div>
    );
}
