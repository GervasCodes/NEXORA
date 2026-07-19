import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { useSocket } from "../context/SocketContext";
import { DEFAULT_CENTER, agentIcon, destinationIcon } from "../utils/mapConfig";
import Skeleton from "./Skeleton";

// Shown on the buyer's order page once a delivery agent has been assigned
// and the delivery isn't finished yet. Joins the order's tracking room and
// re-renders the agent's marker as "agent:position" events stream in.
// Marker movement itself is smoothed via a global CSS rule on
// `.leaflet-marker-icon` (see index.css) rather than JS interpolation -
// Leaflet already animates its own inline transform, so a CSS transition
// on that same property is enough to turn position jumps into a glide.
export default function DeliveryTrackingMap({ orderId, destination }) {
    const { socket, connected } = useSocket();
    const [agentPos, setAgentPos] = useState(null);

    useEffect(() => {
        if (!socket || !connected) return;

        socket.emit("join_order_tracking", orderId);

        const handlePosition = (payload) => {
            if (payload.orderId === Number(orderId) || payload.orderId === orderId) {
                setAgentPos({ lat: payload.lat, lng: payload.lng });
            }
        };

        socket.on("agent:position", handlePosition);

        return () => {
            socket.emit("leave_order_tracking", orderId);
            socket.off("agent:position", handlePosition);
        };
    }, [socket, connected, orderId]);

    const center = destination
        ? [destination.lat, destination.lng]
        : agentPos
            ? [agentPos.lat, agentPos.lng]
            : DEFAULT_CENTER;

    if (!connected) {
        return (
            <div>
                <Skeleton className="w-full rounded-md" style={{ height: 260 }} />
                <p className="text-xs text-ash mt-1.5 animate-fade-in">Connecting to live tracking…</p>
            </div>
        );
    }

    return (
        <div className="animate-fade-in">
            <div className="relative rounded-md overflow-hidden border border-line" style={{ height: 260 }}>
                <MapContainer center={center} zoom={13} style={{ height: "100%", width: "100%" }}>
                    <TileLayer
                        attribution='&copy; OpenStreetMap contributors'
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />
                    {destination && (
                        <Marker position={[destination.lat, destination.lng]} icon={destinationIcon}>
                            <Popup>Delivery address</Popup>
                        </Marker>
                    )}
                    {agentPos && (
                        <Marker position={[agentPos.lat, agentPos.lng]} icon={agentIcon}>
                            <Popup>Your delivery agent</Popup>
                        </Marker>
                    )}
                </MapContainer>

                <div className="glass absolute top-3 right-3 z-[400] rounded-lg px-3 py-2 flex items-center gap-2 pointer-events-none animate-slide-down">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${agentPos ? "bg-teal animate-pulse" : "bg-ash"}`} />
                    <span className="text-xs font-medium text-ink">
                        {agentPos ? "Live tracking" : "Waiting for agent"}
                    </span>
                </div>
            </div>
            <p className="text-xs text-ash mt-1.5">
                {agentPos ? "Live location — updates as your agent moves." : "Waiting for your agent's location…"}
            </p>
        </div>
    );
}
