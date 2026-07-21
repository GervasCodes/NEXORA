import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSocket } from "../context/SocketContext";
import { useLanguage } from "../context/LanguageContext";
import { progressPercent } from "../utils/geo";

const VEHICLE_EMOJI = {
    bicycle: "🚲",
    motorcycle: "🏍️",
    tuktuk: "🛺",
    car: "🚗",
    van: "🚐",
    truck: "🚚"
};

// Shown on the order-detail page in place of the old always-on inline
// map. Deliberately doesn't mount a Leaflet map instance itself - that's
// the single biggest "map performance" win for Phase 1: an order page
// showing this widget costs nothing map-tile-wise, and the real map only
// ever renders once you actually open the full tracking page.
export default function TrackingWidget({ orderId, delivery, destination }) {
    const { t } = useLanguage();
    const { socket, connected, connectionState } = useSocket();
    const navigate = useNavigate();

    const [agentPos, setAgentPos] = useState(
        delivery?.agent_current_lat != null
            ? { lat: Number(delivery.agent_current_lat), lng: Number(delivery.agent_current_lng) }
            : null
    );

    // Phase 5C: the backend now pushes a road-routing distance/ETA with
    // every "agent:position" tick (see delivery.service.js's
    // updateAgentLocation), computed via the same OSRM-backed routing
    // service the tracking REST endpoint uses - so this only needs to
    // hold onto whatever the server last sent, never recompute it.
    const [liveEta, setLiveEta] = useState(null);

    useEffect(() => {
        if (!socket || !connected) return;

        socket.emit("join_order_tracking", orderId);

        const handlePosition = (payload) => {
            if (String(payload.orderId) === String(orderId)) {
                setAgentPos({ lat: payload.lat, lng: payload.lng });
                setLiveEta({
                    distance_remaining_km: payload.distance_remaining_km,
                    eta_minutes: payload.eta_minutes
                });
            }
        };

        socket.on("agent:position", handlePosition);

        return () => {
            socket.emit("leave_order_tracking", orderId);
            socket.off("agent:position", handlePosition);
        };
    }, [socket, connected, orderId]);

    const distanceRemainingKm = liveEta?.distance_remaining_km ?? delivery?.distance_remaining_km ?? null;
    const etaMinutes = liveEta?.eta_minutes ?? delivery?.eta_minutes ?? null;

    const totalKm = delivery?.distance_km ?? delivery?.distance_remaining_km ?? distanceRemainingKm;
    const pct = progressPercent(totalKm, distanceRemainingKm);

    const statusLabel = !connected
        ? t(connectionState === "reconnecting" ? "delivery.tracking.reconnecting" : "delivery.tracking.connecting")
        : agentPos
            ? t("delivery.tracking.agentEnRoute")
            : t("delivery.tracking.awaitingAgent");

    return (
        <button
            type="button"
            onClick={() => navigate(`/orders/${orderId}/tracking`)}
            className="w-full text-left glass border border-line rounded-xl px-4 py-3 flex items-center gap-3 hover:border-abyss transition-colors focus-ring animate-fade-in"
            aria-label={t("delivery.tracking.viewLive")}
        >
            <div className="relative shrink-0 w-11 h-11 rounded-full bg-teal/10 flex items-center justify-center text-xl">
                {VEHICLE_EMOJI[delivery?.agent_vehicle_type] || "🛵"}
                {agentPos && connected && (
                    <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-teal border-2 border-paper animate-pulse" />
                )}
            </div>

            <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-ink truncate">{statusLabel}</p>
                <div className="flex items-center gap-2 mt-1">
                    <div className="flex-1 h-1.5 bg-line rounded-full overflow-hidden">
                        <div
                            className="h-full bg-teal rounded-full transition-all duration-700 ease-out"
                            style={{ width: `${pct ?? 0}%` }}
                        />
                    </div>
                    <span className="text-xs text-ash whitespace-nowrap">
                        {etaMinutes != null ? `${etaMinutes} min` : t("delivery.tracking.calculating")}
                    </span>
                </div>
            </div>

            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2" className="w-4 h-4 text-ash shrink-0">
                <path d="m9 18 6-6-6-6" />
            </svg>
        </button>
    );
}
