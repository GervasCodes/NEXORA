import { useCallback, useEffect, useRef, useState } from "react";
import api, { extractErrorMessage } from "../../api/client";
import { SkeletonList } from "../../components/Skeleton";
import ErrorState from "../../components/ui/ErrorState";
import Button from "../../components/ui/Button";
import DeliveryProofForm from "../../components/delivery/DeliveryProofForm";
import NexoraRouteAssist from "../../components/ai/NexoraRouteAssist";
import PageMeta from "../../components/PageMeta";
import { googleMapsUrl, wazeUrl, telUrl, whatsappUrl } from "../../utils/contactLinks";
import { enqueueStatus, getQueue, isNetworkError, removeFromQueue } from "../../utils/deliveryStatusQueue";
import { useLanguage } from "../../context/LanguageContext";
import { useToast } from "../../context/ToastContext";

const NEXT_STATUS = {
    assigned: [{ value: "picked_up", labelKey: "delivery.agent.mine.markPickedUp" }, { value: "failed", labelKey: "delivery.agent.mine.reportFailed" }],
    picked_up: [{ value: "in_transit", labelKey: "delivery.agent.mine.markInTransit" }, { value: "failed", labelKey: "delivery.agent.mine.reportFailed" }],
    in_transit: [{ value: "delivered", labelKey: "delivery.agent.mine.markDelivered" }, { value: "failed", labelKey: "delivery.agent.mine.reportFailed" }]
};

const statusStyles = {
    assigned: "bg-line text-ash",
    picked_up: "bg-mango/20 text-mango-dark",
    in_transit: "bg-teal/10 text-teal",
    delivered: "bg-teal text-white",
    failed: "bg-coral/10 text-coral"
};

const linkBtn = "text-xs border border-line px-3 py-2 rounded-md hover:border-ink transition-colors";

// Sends one status update. Photo proof is multipart; everything else is JSON-like.
const sendStatus = (orderId, { status, handoverCode, lat, lng, photo }) => {
    if (photo) {
        const body = new FormData();
        body.append("status", status);
        body.append("dropoff_photo", photo);
        if (lat != null) body.append("delivery_lat", String(lat));
        if (lng != null) body.append("delivery_lng", String(lng));
        return api.put(`/delivery/${orderId}/status`, body);
    }
    return api.put(`/delivery/${orderId}/status`, {
        status,
        ...(handoverCode ? { handover_code: handoverCode } : {}),
        ...(lat != null ? { delivery_lat: lat } : {}),
        ...(lng != null ? { delivery_lng: lng } : {})
    });
};

export default function DeliveryMine() {
    const { t } = useLanguage();
    const [deliveries, setDeliveries] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);
    const [busyId, setBusyId] = useState(null);
    const [proofOrderId, setProofOrderId] = useState(null);
    const [queuedIds, setQueuedIds] = useState(() => getQueue().map((i) => String(i.orderId)));
    const toast = useToast();
    const [routeRefresh, setRouteRefresh] = useState(0);
    const flushing = useRef(false);

    const load = useCallback((silent = false) => {
        if (!silent) setLoading(true);
        setLoadError(false);
        return api.get("/delivery/my/list")
            .then(({ data }) => setDeliveries(data.data))
            .catch(() => setLoadError(true))
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => { load(); }, [load]);

    // Replays updates saved while offline. A server rejection (HTTP error)
    // drops the item - retrying a rejected transition would never succeed.
    const flushQueue = useCallback(async () => {
        if (flushing.current) return;
        flushing.current = true;
        try {
            for (const item of getQueue()) {
                try {
                    await sendStatus(item.orderId, item);
                    removeFromQueue(item.orderId);
                } catch (err) {
                    if (isNetworkError(err)) break;
                    removeFromQueue(item.orderId);
                    toast?.error(extractErrorMessage(err));
                }
            }
        } finally {
            flushing.current = false;
            setQueuedIds(getQueue().map((i) => String(i.orderId)));
            load(true);
            setRouteRefresh((n) => n + 1);
        }
    }, [load, toast]);

    useEffect(() => {
        if (getQueue().length > 0 && navigator.onLine) flushQueue();
        window.addEventListener("online", flushQueue);
        return () => window.removeEventListener("online", flushQueue);
    }, [flushQueue]);

    const updateStatus = async (orderId, payload) => {
        setBusyId(orderId);
        try {
            await sendStatus(orderId, payload);
            setProofOrderId(null);
            load(true);
            setRouteRefresh((n) => n + 1);
        } catch (err) {
            if (isNetworkError(err) && !payload.photo) {
                enqueueStatus({ orderId, ...payload });
                setQueuedIds(getQueue().map((i) => String(i.orderId)));
                setProofOrderId(null);
                toast?.info?.(t("delivery.agent.mine.queued"));
            } else if (isNetworkError(err)) {
                toast?.error(t("delivery.agent.proof.photoOffline"));
            } else {
                toast?.error(extractErrorMessage(err));
            }
        } finally {
            setBusyId(null);
        }
    };

    const onNext = (d, next) => {
        if (next.value === "delivered") {
            setProofOrderId(d.order_id);
            return;
        }
        updateStatus(d.order_id, { status: next.value });
    };

    if (loading) return <SkeletonList rows={3} />;
    if (loadError && deliveries.length === 0) {
        return <ErrorState title={t("delivery.agent.mine.loadError")} onRetry={() => load()} />;
    }

    if (deliveries.length === 0) {
        return <p className="text-ash text-sm">{t("delivery.agent.mine.empty")}</p>;
    }

    return (
        <div>
            <PageMeta title="My Deliveries" noIndex />

            {queuedIds.length > 0 && (
                <div role="status" className="flex items-center justify-between gap-3 border border-mango/40 bg-mango/10 rounded-lg px-3 py-2 mb-4 text-sm">
                    <span>{t("delivery.agent.mine.queuedBanner", { count: queuedIds.length })}</span>
                    <button type="button" onClick={flushQueue} className="text-xs underline shrink-0">{t("delivery.agent.mine.retryNow")}</button>
                </div>
            )}

            <NexoraRouteAssist refreshToken={routeRefresh} />

            <ul className="space-y-4">
                {deliveries.map((d) => {
                    const address = [d.shipping_address, d.shipping_city, d.shipping_region].filter(Boolean).join(", ");
                    const dest = { lat: d.delivery_lat, lng: d.delivery_lng, address };
                    const mapsHref = googleMapsUrl(dest);
                    const wazeHref = wazeUrl(dest);
                    const active = Boolean(NEXT_STATUS[d.status]);
                    const queued = queuedIds.includes(String(d.order_id));

                    return (
                        <li key={d.id} className="border border-line rounded-lg p-4">
                            <div className="flex items-center justify-between gap-3 mb-2">
                                <p className="price text-sm font-medium">{d.order_number}</p>
                                <span className={`text-xs font-medium px-2 py-1 rounded-full capitalize ${statusStyles[d.status] || "bg-line text-ash"}`}>
                                    {d.status.replace("_", " ")}
                                </span>
                            </div>

                            <p className="text-sm text-ink/80 mb-1">{address}</p>
                            <p className="text-xs text-ash mb-3">{t("delivery.agent.mine.contact")}: {d.shipping_phone}</p>
                            {queued && <p className="text-xs text-mango-dark mb-2">{t("delivery.agent.mine.waitingToSync")}</p>}

                            {active && (
                                <div className="flex flex-wrap gap-2 mb-3">
                                    {mapsHref && <a href={mapsHref} target="_blank" rel="noopener noreferrer" className={linkBtn}>{t("delivery.agent.nav.googleMaps")}</a>}
                                    {wazeHref && <a href={wazeHref} target="_blank" rel="noopener noreferrer" className={linkBtn}>{t("delivery.agent.nav.waze")}</a>}
                                    {telUrl(d.shipping_phone) && <a href={telUrl(d.shipping_phone)} className={linkBtn}>{t("delivery.agent.nav.call")}</a>}
                                    {whatsappUrl(d.shipping_phone) && (
                                        <a href={whatsappUrl(d.shipping_phone)} target="_blank" rel="noopener noreferrer" className={linkBtn}>
                                            {t("delivery.agent.nav.whatsapp")}
                                        </a>
                                    )}
                                </div>
                            )}

                            <div className="flex flex-wrap gap-2">
                                {(NEXT_STATUS[d.status] || []).map((next) => (
                                    <Button
                                        key={next.value}
                                        onClick={() => onNext(d, next)}
                                        disabled={busyId === d.order_id}
                                        variant="secondary"
                                        size="sm"
                                    >
                                        {t(next.labelKey)}
                                    </Button>
                                ))}
                            </div>

                            {proofOrderId === d.order_id && (
                                <DeliveryProofForm
                                    busy={busyId === d.order_id}
                                    onCancel={() => setProofOrderId(null)}
                                    onSubmit={({ handoverCode, photo, lat, lng }) =>
                                        updateStatus(d.order_id, { status: "delivered", handoverCode, photo, lat, lng })
                                    }
                                />
                            )}
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}
