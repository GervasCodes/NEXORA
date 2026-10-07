import { lazy, Suspense, useState } from "react";
import { useOutletContext } from "react-router-dom";
import api, { extractErrorMessage } from "../../api/client";
import { formatMoney } from "../../utils/format";
import { googleMapsUrl, wazeUrl, packageSizeKey } from "../../utils/contactLinks";
import { SkeletonList } from "../../components/Skeleton";
import ErrorState from "../../components/ui/ErrorState";
import Button from "../../components/ui/Button";
import PageMeta from "../../components/PageMeta";
import useAvailablePool from "../../hooks/useAvailablePool";
import { useLanguage } from "../../context/LanguageContext";
import { useToast } from "../../context/ToastContext";

const RouteMapPreview = lazy(() => import("../../components/delivery/RouteMapPreview"));

const hasPin = (lat, lng) => lat != null && lng != null;

// The pool is owned by DeliveryLayout (it also drives the "Available"
// badge) and arrives through the outlet context; rendered standalone it
// falls back to its own subscription.
function usePool() {
    const ctx = useOutletContext();
    const own = useAvailablePool(!ctx?.pool);
    return ctx?.pool || own;
}

export default function DeliveryAvailable() {
    const { t } = useLanguage();
    const { orders, loading, error, reload } = usePool();
    const [busyId, setBusyId] = useState(null);
    const [openMapId, setOpenMapId] = useState(null);
    const toast = useToast();
    const [message, setMessage] = useState("");

    const claim = async (orderId) => {
        setBusyId(orderId);
        setMessage("");
        try {
            await api.post(`/delivery/${orderId}/claim`);
            setMessage(t("delivery.agent.available.claimed"));
            reload();
        } catch (err) {
            toast?.error(extractErrorMessage(err));
            reload();
        } finally {
            setBusyId(null);
        }
    };

    if (loading) return <SkeletonList rows={3} />;
    if (error && orders.length === 0) {
        return <ErrorState title={t("delivery.agent.available.loadError")} onRetry={reload} />;
    }

    return (
        <div>
            <PageMeta title="Available Deliveries" noIndex />
            {message && <p role="status" className="text-teal text-sm mb-4">{message}</p>}

            {orders.length === 0 && (
                <p className="text-ash text-sm">{t("delivery.agent.available.empty")}</p>
            )}

            <ul className="space-y-4">
                {orders.map((order) => {
                    const pickup = hasPin(order.pickup_lat, order.pickup_lng) ? { lat: order.pickup_lat, lng: order.pickup_lng } : null;
                    const dropoff = hasPin(order.delivery_lat, order.delivery_lng) ? { lat: order.delivery_lat, lng: order.delivery_lng } : null;
                    const dropArea = [order.shipping_city, order.shipping_region].filter(Boolean).join(", ");
                    const pickupArea = [order.pickup_address, order.pickup_city].filter(Boolean).join(", ");
                    const navTarget = { lat: order.pickup_lat, lng: order.pickup_lng, address: pickupArea };
                    const mapsHref = googleMapsUrl(navTarget);
                    const wazeHref = wazeUrl(navTarget);

                    return (
                        <li key={order.order_id} className="border border-line rounded-lg p-4">
                            <div className="flex items-start justify-between gap-3 mb-3">
                                <div className="min-w-0">
                                    <p className="price text-sm font-medium">{order.order_number}</p>
                                    <p className="text-xs text-ash">
                                        {t(packageSizeKey(order.item_count))}
                                        {order.item_count ? ` · ${t("delivery.agent.available.items", { count: order.item_count })}` : ""}
                                    </p>
                                </div>
                                {/* Own payout, not the order total - what the agent earns for this leg. */}
                                <div className="text-right shrink-0">
                                    <p className="price text-lg font-medium text-teal">{formatMoney(order.agent_payout)}</p>
                                    {order.agent_payout_distance_km != null && (
                                        <p className="text-xs text-ash">{order.agent_payout_distance_km.toFixed(1)} km</p>
                                    )}
                                </div>
                            </div>

                            <dl className="text-sm space-y-2 mb-3">
                                <div>
                                    <dt className="text-xs text-ash">{t("delivery.agent.available.pickup")}</dt>
                                    <dd>{order.store_name || t("delivery.agent.available.pickupUnknown")}{pickupArea ? ` - ${pickupArea}` : ""}</dd>
                                </div>
                                <div>
                                    <dt className="text-xs text-ash">{t("delivery.agent.available.dropoff")}</dt>
                                    <dd>{dropArea || order.shipping_address}</dd>
                                </div>
                            </dl>

                            {(pickup || dropoff) && (
                                <>
                                    <button
                                        type="button"
                                        onClick={() => setOpenMapId(openMapId === order.order_id ? null : order.order_id)}
                                        aria-expanded={openMapId === order.order_id}
                                        className="text-xs text-teal hover:underline mb-2"
                                    >
                                        {openMapId === order.order_id ? t("delivery.agent.available.hideMap") : t("delivery.agent.available.showMap")}
                                    </button>
                                    {openMapId === order.order_id && (
                                        <div className="mb-3">
                                            <Suspense fallback={<div className="h-40 skeleton animate-shimmer rounded-md" />}>
                                                <RouteMapPreview pickup={pickup} dropoff={dropoff} />
                                            </Suspense>
                                        </div>
                                    )}
                                </>
                            )}

                            <div className="flex flex-wrap items-center gap-2">
                                <Button
                                    onClick={() => claim(order.order_id)}
                                    disabled={busyId === order.order_id}
                                    className="flex-1 sm:flex-initial"
                                >
                                    {busyId === order.order_id ? t("delivery.agent.available.claiming") : t("delivery.agent.available.claim")}
                                </Button>
                                {mapsHref && (
                                    <a href={mapsHref} target="_blank" rel="noopener noreferrer" className="text-xs border border-line px-3 py-2 rounded-md hover:border-ink transition-colors">
                                        {t("delivery.agent.nav.googleMaps")}
                                    </a>
                                )}
                                {wazeHref && (
                                    <a href={wazeHref} target="_blank" rel="noopener noreferrer" className="text-xs border border-line px-3 py-2 rounded-md hover:border-ink transition-colors">
                                        {t("delivery.agent.nav.waze")}
                                    </a>
                                )}
                            </div>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}
