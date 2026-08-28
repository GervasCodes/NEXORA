import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSocket } from "../context/SocketContext";
import { useLanguage } from "../context/LanguageContext";
import { progressPercent } from "../utils/geo";
import { SEARCH_STAGE, getSearchStageFromElapsed } from "../utils/orderStatusModel";
import { VEHICLE_ICON_BY_TYPE, DEFAULT_VEHICLE_ICON } from "./Icons";

const SEARCH_STAGE_COPY_KEY = {
    [SEARCH_STAGE.LOOKING]: "delivery.tracking.searching.looking",
    [SEARCH_STAGE.WIDENING]: "delivery.tracking.searching.widening",
    [SEARCH_STAGE.TAKING_LONGER]: "delivery.tracking.searching.takingLonger"
};

// Phase 2 (Honest Status Transparency): `searching` is a distinct third
// mode alongside "no delivery info yet" (null) and "agent assigned" -
// before this the widget only ever rendered once `delivery.agent_id`
// existed, so a paid order sitting in dispatch (see
// delivery.service.js#offerToNextCandidate) showed nothing at all here,
// leaving the buyer with no visible confirmation that anything was
// happening after paying. The two modes are intentionally NOT the same
// layout with a swapped label - searching has no vehicle/progress bar
// (there's no agent or route yet to show progress along) and uses a
// muted searching glyph instead of the teal "live" treatment.
export default function TrackingWidget({ orderId, delivery, destination, searching = false }) {
    const { t } = useLanguage();
    const { socket, connected, connectionState } = useSocket();
    const navigate = useNavigate();

    const [agentPos, setAgentPos] = useState(
        delivery?.agent_current_lat != null
            ? { lat: Number(delivery.agent_current_lat), lng: Number(delivery.agent_current_lng) }
            : null
    );

  
    const [liveEta, setLiveEta] = useState(null);

    // Elapsed-time copy escalation while searching (client-side baseline -
    // see orderStatusModel.js), instantly overridden by the
    // dispatch:still_searching socket event below the moment the backend
    // actually widens the radius or exhausts it, rather than waiting for
    // the timer to catch up.
    const searchStartRef = useRef(Date.now());
    const [searchStage, setSearchStage] = useState(SEARCH_STAGE.LOOKING);

    useEffect(() => {
        if (!searching) return;
        searchStartRef.current = Date.now();
        setSearchStage(SEARCH_STAGE.LOOKING);

        const interval = setInterval(() => {
            const elapsed = Date.now() - searchStartRef.current;
            setSearchStage((prev) => {
                const fromElapsed = getSearchStageFromElapsed(elapsed);
                // Never step backwards - a real dispatch event may have
                // already pushed this further along than the timer has.
                const order = [SEARCH_STAGE.LOOKING, SEARCH_STAGE.WIDENING, SEARCH_STAGE.TAKING_LONGER];
                return order.indexOf(fromElapsed) > order.indexOf(prev) ? fromElapsed : prev;
            });
        }, 5000);

        return () => clearInterval(interval);
    }, [searching, orderId]);

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

        const handleStillSearching = (payload) => {
            if (String(payload.orderId) !== String(orderId)) return;
            setSearchStage(payload.phase === "exhausted" ? SEARCH_STAGE.TAKING_LONGER : SEARCH_STAGE.WIDENING);
        };

        socket.on("agent:position", handlePosition);
        socket.on("dispatch:still_searching", handleStillSearching);

        return () => {
            socket.emit("leave_order_tracking", orderId);
            socket.off("agent:position", handlePosition);
            socket.off("dispatch:still_searching", handleStillSearching);
        };
    }, [socket, connected, orderId]);

    const distanceRemainingKm = liveEta?.distance_remaining_km ?? delivery?.distance_remaining_km ?? null;
    const etaMinutes = liveEta?.eta_minutes ?? delivery?.eta_minutes ?? null;

    const totalKm = delivery?.distance_km ?? delivery?.distance_remaining_km ?? distanceRemainingKm;
    const pct = progressPercent(totalKm, distanceRemainingKm);

    const hasAgent = Boolean(delivery?.agent_id);
    const VehicleIcon = VEHICLE_ICON_BY_TYPE[delivery?.agent_vehicle_type] || DEFAULT_VEHICLE_ICON;

    if (!hasAgent && searching) {
        return (
            <button
                type="button"
                onClick={() => navigate(`/orders/${orderId}/tracking`)}
                className="w-full text-left glass border border-line rounded-xl px-4 py-3 flex items-center gap-3 hover:border-abyss transition-colors focus-ring animate-fade-in"
                aria-label={t("delivery.tracking.viewLive")}
            >
                <div className="relative shrink-0 w-11 h-11 rounded-full bg-line flex items-center justify-center">
                    <span className="absolute inset-0 rounded-full bg-ash/20 animate-ping" />
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                        strokeWidth="2" className="relative w-5 h-5 text-ash">
                        <circle cx="11" cy="11" r="7" />
                        <path d="m21 21-4.35-4.35" />
                    </svg>
                </div>

                <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-ink truncate">
                        {t(SEARCH_STAGE_COPY_KEY[searchStage])}
                    </p>
                    <p className="text-xs text-ash mt-0.5">{t("delivery.tracking.searching.subtitle")}</p>
                </div>

                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    strokeWidth="2" className="w-4 h-4 text-ash shrink-0">
                    <path d="m9 18 6-6-6-6" />
                </svg>
            </button>
        );
    }

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
            <div className="relative shrink-0 w-11 h-11 rounded-full bg-teal/10 flex items-center justify-center text-teal">
                <VehicleIcon className="w-6 h-6" />
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
