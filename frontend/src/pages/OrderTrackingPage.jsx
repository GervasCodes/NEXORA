import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import api, { extractErrorMessage } from "../api/client";
import { useSocket } from "../context/SocketContext";
import { useLanguage } from "../context/LanguageContext";
import DeliveryTrackingMap from "../components/DeliveryTrackingMap";
import DeliveryStatusTimeline from "../components/DeliveryStatusTimeline";
import CourierDetailsCard from "../components/CourierDetailsCard";
import useSmoothPosition from "../hooks/useSmoothPosition";
import Skeleton from "../components/Skeleton";

export default function OrderTrackingPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { t } = useLanguage();
    const { socket, connected, connectionState } = useSocket();

    const [order, setOrder] = useState(null);
    const [delivery, setDelivery] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [rawAgentPos, setRawAgentPos] = useState(null);
    // Phase 5C: road-routing distance/ETA pushed live by the backend with
    // every "agent:position" tick (see delivery.service.js's
    // updateAgentLocation) - the same OSRM-backed routing service GET
    // /delivery/:id uses, so this page no longer needs to approximate it
    // with a client-side straight-line calculation between ticks.
    const [liveEta, setLiveEta] = useState(null);

    const load = useCallback(() => {
        setError("");
        Promise.all([
            api.get(`/orders/${id}`),
            api.get(`/delivery/${id}`)
        ])
            .then(([orderRes, deliveryRes]) => {
                setOrder(orderRes.data.data);
                setDelivery(deliveryRes.data.data);
                if (deliveryRes.data.data.agent_current_lat != null) {
                    setRawAgentPos({
                        lat: Number(deliveryRes.data.data.agent_current_lat),
                        lng: Number(deliveryRes.data.data.agent_current_lng),
                        timestamp: Date.now()
                    });
                }
            })
            .catch((err) => setError(extractErrorMessage(err)))
            .finally(() => setLoading(false));
    }, [id]);

    useEffect(load, [load]);

    useEffect(() => {
        if (!socket || !connected) return;

        socket.emit("join_order_tracking", id);

        const handlePosition = (payload) => {
            if (String(payload.orderId) === String(id)) {
                setRawAgentPos({ lat: payload.lat, lng: payload.lng, timestamp: payload.timestamp || Date.now() });
                setLiveEta({
                    distance_remaining_km: payload.distance_remaining_km,
                    eta_minutes: payload.eta_minutes
                });
            }
        };
        const refreshDelivery = () => {
            api.get(`/delivery/${id}`).then(({ data }) => setDelivery(data.data)).catch(() => {});
        };
        // A status transition (e.g. picked up -> in transit) changes where
        // the ETA is measured from, so the road-routing ETA carried on this
        // event is applied immediately - the refetch below still runs to
        // pick up everything else the status change affects (timeline,
        // notes, timestamps).
        const handleStatus = (payload) => {
            if (String(payload.orderId) === String(id)) {
                setLiveEta({
                    distance_remaining_km: payload.distance_remaining_km,
                    eta_minutes: payload.eta_minutes
                });
            }
            refreshDelivery();
        };

        socket.on("agent:position", handlePosition);
        socket.on("delivery:status", handleStatus);
        socket.on("delivery:assigned", refreshDelivery);

        return () => {
            socket.emit("leave_order_tracking", id);
            socket.off("agent:position", handlePosition);
            socket.off("delivery:status", handleStatus);
            socket.off("delivery:assigned", refreshDelivery);
        };
    }, [socket, connected, id]);

    // Smoothly interpolated for the map marker. The raw value (no easing)
    // is used for the distance/ETA numbers below, so those figures update
    // immediately on each tick rather than trailing the animation.
    const smoothAgentPos = useSmoothPosition(rawAgentPos);

    const handleMessageAgent = async () => {
        try {
            const { data } = await api.post("/chat/conversations", {
                other_user_id: delivery.agent_id,
                role: "delivery_agent",
                order_id: order.id
            });
            navigate(`/messages/${data.data.id}`);
        } catch (err) {
            setError(extractErrorMessage(err));
        }
    };

    if (loading) {
        return (
            <div className="max-w-2xl mx-auto px-4 py-10">
                <Skeleton className="w-full rounded-xl" style={{ height: 320 }} />
            </div>
        );
    }

    if (error || !order || !delivery) {
        return (
            <div className="max-w-2xl mx-auto px-6 py-24 text-center">
                <p className="font-display text-2xl mb-2">{t("delivery.tracking.unavailable")}</p>
                {error && <p className="text-sm text-coral mb-4">{error}</p>}
                <Link to={`/orders/${id}`} className="text-teal hover:underline text-sm">
                    {t("delivery.tracking.back")}
                </Link>
            </div>
        );
    }

    const destination = order.delivery_lat && order.delivery_lng
        ? { lat: Number(order.delivery_lat), lng: Number(order.delivery_lng) }
        : delivery.destination;

    const distanceRemainingKm = liveEta?.distance_remaining_km ?? delivery.distance_remaining_km;
    const etaMinutes = liveEta?.eta_minutes ?? delivery.eta_minutes;

    const connectionBanner = !connected && (
        <div className="bg-mango/10 text-mango-dark text-xs px-3 py-2 rounded-md mb-4 flex items-center gap-2 animate-slide-down">
            <span className="w-1.5 h-1.5 rounded-full bg-mango-dark animate-pulse" />
            {t(connectionState === "reconnecting" ? "delivery.tracking.reconnecting" : "delivery.tracking.connecting")}
        </div>
    );

    return (
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6">
            <div className="flex items-center justify-between mb-4">
                <button
                    type="button"
                    onClick={() => navigate(`/orders/${id}`)}
                    className="flex items-center gap-1.5 text-sm text-ash hover:text-ink transition-colors focus-ring"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                        <path d="m15 18-6-6 6-6" />
                    </svg>
                    {t("delivery.tracking.back")}
                </button>
                <span className={`flex items-center gap-1.5 text-xs font-medium ${connected ? "text-teal" : "text-ash"}`}>
                    <span className={`w-2 h-2 rounded-full ${connected ? "bg-teal animate-pulse" : "bg-ash"}`} />
                    {connected ? t("delivery.tracking.live") : t("delivery.tracking.connecting")}
                </span>
            </div>

            {connectionBanner}

            <DeliveryTrackingMap
                agentPos={smoothAgentPos}
                pickup={delivery.pickup}
                destination={destination}
                height={320}
            />

            <div className="grid grid-cols-2 gap-4 my-6 text-sm">
                <div>
                    <p className="text-ash mb-0.5">{t("delivery.tracking.eta")}</p>
                    <p className="font-medium text-lg price">
                        {etaMinutes != null ? `${etaMinutes} min` : t("delivery.tracking.calculating")}
                    </p>
                </div>
                <div>
                    <p className="text-ash mb-0.5">{t("delivery.tracking.distanceRemaining")}</p>
                    <p className="font-medium text-lg price">
                        {distanceRemainingKm != null ? `${distanceRemainingKm.toFixed(1)} km` : t("delivery.tracking.calculating")}
                    </p>
                </div>
            </div>

            <div className="space-y-6">
                <DeliveryStatusTimeline delivery={delivery} />
                <CourierDetailsCard delivery={delivery} onMessage={handleMessageAgent} />
            </div>
        </div>
    );
}
