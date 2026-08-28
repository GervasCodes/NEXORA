import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import api, { extractErrorMessage } from "../api/client";
import { useSocket } from "../context/SocketContext";
import { useLanguage } from "../context/LanguageContext";
import DeliveryTrackingMap from "../components/DeliveryTrackingMap";
import DeliveryStatusTimeline from "../components/DeliveryStatusTimeline";
import CourierDetailsCard from "../components/CourierDetailsCard";
import { PaymentConfirmedPill } from "../components/PaymentStatusBanner";
import { ORDER_STATE, SEARCH_STAGE, getOrderState, getSearchStageFromElapsed } from "../utils/orderStatusModel";
import useSmoothPosition from "../hooks/useSmoothPosition";
import Skeleton from "../components/Skeleton";
import PageMeta from "../components/PageMeta";

const SEARCH_STAGE_COPY_KEY = {
    [SEARCH_STAGE.LOOKING]: "delivery.tracking.searching.looking",
    [SEARCH_STAGE.WIDENING]: "delivery.tracking.searching.widening",
    [SEARCH_STAGE.TAKING_LONGER]: "delivery.tracking.searching.takingLonger"
};

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
    
    const [liveEta, setLiveEta] = useState(null);

    // Phase 2 (Honest Status Transparency): a paid, shipped order with no
    // delivery row yet is dispatch actively searching (see
    // delivery.service.js#offerToNextCandidate) - a perfectly normal,
    // temporary state, NOT an error. Fetching delivery separately (rather
    // than Promise.all-ing it with the order and treating any rejection
    // as a page-level failure, as this used to) lets that 404 be read as
    // "no agent yet" instead of "tracking unavailable" - which is exactly
    // the alarming false-failure this phase exists to remove.
    const load = useCallback(() => {
        setError("");
        api.get(`/orders/${id}`)
            .then(({ data }) => {
                setOrder(data.data);
                return api.get(`/delivery/${id}`)
                    .then(({ data: d }) => {
                        setDelivery(d.data);
                        if (d.data.agent_current_lat != null) {
                            setRawAgentPos({
                                lat: Number(d.data.agent_current_lat),
                                lng: Number(d.data.agent_current_lng),
                                timestamp: Date.now()
                            });
                        }
                    })
                    .catch(() => setDelivery(null));
            })
            .catch((err) => setError(extractErrorMessage(err)))
            .finally(() => setLoading(false));
    }, [id]);

    useEffect(load, [load]);

    // Elapsed-time copy escalation for the searching state - same
    // client-side-baseline-plus-socket-event approach as TrackingWidget
    // (see orderStatusModel.js and that component's comment for why).
    const searchStartRef = useRef(Date.now());
    const [searchStage, setSearchStage] = useState(SEARCH_STAGE.LOOKING);

    useEffect(() => {
        searchStartRef.current = Date.now();
        setSearchStage(SEARCH_STAGE.LOOKING);
        const interval = setInterval(() => {
            const elapsed = Date.now() - searchStartRef.current;
            setSearchStage((prev) => {
                const fromElapsed = getSearchStageFromElapsed(elapsed);
                const order = [SEARCH_STAGE.LOOKING, SEARCH_STAGE.WIDENING, SEARCH_STAGE.TAKING_LONGER];
                return order.indexOf(fromElapsed) > order.indexOf(prev) ? fromElapsed : prev;
            });
        }, 5000);
        return () => clearInterval(interval);
    }, [id]);

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
        
        const handleStatus = (payload) => {
            if (String(payload.orderId) === String(id)) {
                setLiveEta({
                    distance_remaining_km: payload.distance_remaining_km,
                    eta_minutes: payload.eta_minutes
                });
            }
            refreshDelivery();
        };

        const handleStillSearching = (payload) => {
            if (String(payload.orderId) !== String(id)) return;
            setSearchStage(payload.phase === "exhausted" ? SEARCH_STAGE.TAKING_LONGER : SEARCH_STAGE.WIDENING);
        };

        socket.on("agent:position", handlePosition);
        socket.on("delivery:status", handleStatus);
        socket.on("delivery:assigned", refreshDelivery);
        socket.on("dispatch:still_searching", handleStillSearching);

        return () => {
            socket.emit("leave_order_tracking", id);
            socket.off("agent:position", handlePosition);
            socket.off("delivery:status", handleStatus);
            socket.off("delivery:assigned", refreshDelivery);
            socket.off("dispatch:still_searching", handleStillSearching);
        };
    }, [socket, connected, id]);

  
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

    if (error || !order) {
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

    const orderState = getOrderState(order, delivery);

    const backButton = (
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
    );

    // Phase 2 (Honest Status Transparency): distinct full-page treatment
    // for "paid, dispatch still searching" - no map/timeline/courier card
    // to populate (there's no agent yet), just a calm, clearly-not-an-
    // error state with the same payment-confirmed reassurance and
    // progressive copy as TrackingWidget's compact version.
    if (orderState === ORDER_STATE.SEARCHING) {
        return (
            <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6">
                <PageMeta title="Track Order" noIndex />
                <div className="mb-8">{backButton}</div>

                <div className="flex flex-col items-center text-center py-12">
                    <div className="relative w-16 h-16 rounded-full bg-line flex items-center justify-center mb-5">
                        <span className="absolute inset-0 rounded-full bg-ash/20 animate-ping" />
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                            strokeWidth="2" className="relative w-7 h-7 text-ash">
                            <circle cx="11" cy="11" r="7" />
                            <path d="m21 21-4.35-4.35" />
                        </svg>
                    </div>
                    <PaymentConfirmedPill />
                    <p className="font-display text-xl mb-1">{t(SEARCH_STAGE_COPY_KEY[searchStage])}</p>
                    <p className="text-sm text-ash max-w-sm">{t("delivery.tracking.searching.subtitle")}</p>
                </div>
            </div>
        );
    }

    // Paid but not yet shipped, unpaid, or delivered/cancelled - none of
    // these are a live-tracking view. Point back at the order rather than
    // rendering a map/timeline built for fields (delivery.pickup etc.)
    // that don't exist yet.
    if (orderState !== ORDER_STATE.ASSIGNED) {
        return (
            <div className="max-w-2xl mx-auto px-6 py-24 text-center">
                <p className="font-display text-2xl mb-2">{t("delivery.tracking.unavailable")}</p>
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
            <PageMeta title="Track Order" noIndex />
            <div className="flex items-center justify-between mb-4">
                {backButton}
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
