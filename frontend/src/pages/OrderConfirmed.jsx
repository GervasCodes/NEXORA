import { useCallback, useEffect, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import api from "../api/client";
import PageMeta from "../components/PageMeta";
import { SkeletonPage } from "../components/Skeleton";
import { useCurrency } from "../context/CurrencyContext";
import { useLanguage } from "../context/LanguageContext";
import { useSocket } from "../context/SocketContext";
import { useToast } from "../context/ToastContext";
import { trackPurchase } from "../utils/analytics";
import { formatDate } from "../utils/format";
import { getConfirmationState, getPurchaseEvent, getSummaryItems, isAwaitingOnlinePayment } from "../utils/orderConfirmation";

// Poll for a late payment confirmation (mobile-money PIN, hosted card page):
// every 3 s for about 2 minutes, then stop and point at the order page.
const POLL_MS = 3000;
const POLL_MAX = 40;

export default function OrderConfirmed() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { t } = useLanguage();
    const { format } = useCurrency();
    const toast = useToast();
    const { socket, connected } = useSocket();

    const [order, setOrder] = useState(null);
    const [loadFailed, setLoadFailed] = useState(false);
    const [gaveUp, setGaveUp] = useState(false);
    const headingRef = useRef(null);

    const load = useCallback(() => api.get(`/orders/${id}`)
        .then(({ data }) => { setOrder(data.data); setLoadFailed(false); return data.data; })
        .catch(() => { setLoadFailed(true); return null; }), [id]);

    useEffect(() => { load(); }, [load]);

    const state = getConfirmationState(order);
    const awaiting = order ? isAwaitingOnlinePayment(order) : false;

    // Late payment: poll, and also listen for the live socket event.
    useEffect(() => {
        if (!awaiting) return undefined;
        let attempts = 0;
        const timer = setInterval(() => {
            attempts += 1;
            load();
            if (attempts >= POLL_MAX) { clearInterval(timer); setGaveUp(true); }
        }, POLL_MS);
        return () => clearInterval(timer);
    }, [awaiting, load]);

    useEffect(() => {
        if (!socket || !connected) return undefined;
        const onPayment = (payload) => {
            if (Number(payload?.orderId) !== Number(id)) return;
            if (payload.success) load();
            else navigate(`/orders/${id}`, { replace: true, state: { paymentFailed: true } });
        };
        socket.on("payment:updated", onPayment);
        return () => socket.off("payment:updated", onPayment);
    }, [socket, connected, id, load, navigate]);

    // One purchase event per confirmed order (consent-gated inside trackPurchase).
    useEffect(() => {
        const event = getPurchaseEvent(order);
        if (event) trackPurchase(event);
    }, [order]);

    // Move focus to the heading once the order is shown.
    useEffect(() => { if (order && state !== "cancelled") headingRef.current?.focus(); }, [order, state]);

    if (state === "cancelled") return <Navigate to={`/orders/${id}`} replace />;

    if (loadFailed && !order) {
        return (
            <div className="max-w-lg mx-auto px-4 sm:px-6 py-20 text-center">
                <PageMeta title={t("orderConfirmed.metaTitle")} noIndex />
                <p className="font-display text-xl mb-2">{t("orderConfirmed.loadFailed.title")}</p>
                <p className="text-sm text-ash mb-6">{t("orderConfirmed.loadFailed.body")}</p>
                <Link to="/orders" className="bg-ink text-paper px-5 py-2.5 rounded-md text-sm font-semibold hover:opacity-90">{t("orderConfirmed.viewOrders")}</Link>
            </div>
        );
    }

    if (!order) return <SkeletonPage />;

    const confirmed = state === "confirmed";
    const isParent = Boolean(order.is_parent);
    const items = getSummaryItems(order);
    const isPickup = Boolean(order.pickup_point_id);
    const isPreOrder = order.order_type === "pre_order";
    const isCod = order.payment_method === "cash_on_delivery";
    const trackPath = isParent ? `/orders/${id}` : `/orders/${id}/tracking`;

    const paymentLabel = order.payment_status === "paid"
        ? t("orderConfirmed.payment.paid")
        : order.payment_status === "deposit_paid"
            ? t("orderConfirmed.payment.deposit")
            : isCod
                ? t("orderConfirmed.payment.cod")
                : t("orderConfirmed.payment.awaiting");

    const awaitingHint = {
        mobile_money: t("checkout.next.mobileMoney"),
        paypal: t("orderConfirmed.awaitingHint.online"),
        card: t("orderConfirmed.awaitingHint.online")
    }[order.payment_method] || t("orderConfirmed.awaitingHint.online");

    const handleShare = async () => {
        const url = `${window.location.origin}${trackPath}`;
        try {
            if (navigator.share) await navigator.share({ title: order.order_number, url });
            else {
                await navigator.clipboard.writeText(url);
                toast?.success?.(t("order.placed.linkCopied"));
            }
        } catch { /* share dismissed */ }
    };

    return (
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10 animate-fade-in">
            <PageMeta title={t("orderConfirmed.metaTitle")} noIndex />

            <div role="status" className={`border rounded-lg p-5 mb-8 ${confirmed ? "border-teal/30 bg-teal/5" : "border-mango/40 bg-mango/10"}`}>
                <h1 ref={headingRef} tabIndex={-1} className="font-display text-2xl mb-1 outline-none">
                    {confirmed ? t("orderConfirmed.title.confirmed") : t("orderConfirmed.title.awaiting")}
                </h1>
                <p className="text-sm text-ink/80">
                    {confirmed ? t("orderConfirmed.body.confirmed", { number: order.order_number }) : t("orderConfirmed.body.awaiting", { number: order.order_number })}
                </p>
                {!confirmed && (
                    <p className="text-sm text-ink/80 mt-2">{gaveUp ? t("orderConfirmed.stillConfirming") : awaitingHint}</p>
                )}
            </div>

            <section aria-labelledby="oc-summary" className="mb-8">
                <h2 id="oc-summary" className="text-xs uppercase tracking-widest text-ash mb-2">{t("orderConfirmed.summary")}</h2>
                <ul className="divide-y divide-line border-y border-line">
                    {items.map((item) => (
                        <li key={item.id} className="py-3 flex justify-between gap-4 text-sm">
                            <span>{item.name} × {item.quantity}</span>
                            <span className="price shrink-0">{format(item.subtotal)}</span>
                        </li>
                    ))}
                </ul>
                <div className="flex justify-between items-baseline mt-3">
                    <span className="text-sm text-ash">{t("orderConfirmed.total")}</span>
                    <span className="price text-xl font-medium">{format(order.total_amount)}</span>
                </div>
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-5 text-sm">
                    <div>
                        <dt className="text-ash mb-0.5">{t("orderConfirmed.payment")}</dt>
                        <dd className="font-medium">{paymentLabel}</dd>
                    </div>
                    <div>
                        <dt className="text-ash mb-0.5">{t("orderConfirmed.placedOn")}</dt>
                        <dd className="font-medium">{formatDate(order.created_at)}</dd>
                    </div>
                    <div className="sm:col-span-2">
                        <dt className="text-ash mb-0.5">{isPickup ? t("orderConfirmed.pickupAt") : t("orderConfirmed.deliveringTo")}</dt>
                        <dd className="font-medium">{[order.shipping_address, order.shipping_city, order.shipping_region].filter(Boolean).join(", ")}</dd>
                    </div>
                </dl>
            </section>

            <section aria-labelledby="oc-next" className="mb-8">
                <h2 id="oc-next" className="text-xs uppercase tracking-widest text-ash mb-2">{t("orderConfirmed.next.title")}</h2>
                <ol className="list-decimal pl-5 space-y-1.5 text-sm text-ink/80">
                    <li>{t("orderConfirmed.next.seller")}</li>
                    <li>{isPickup ? t("orderConfirmed.next.pickup") : t("orderConfirmed.next.delivery")}</li>
                    {isPreOrder && <li>{t("orderConfirmed.next.preOrder")}</li>}
                    <li>{isCod ? t("orderConfirmed.next.cod") : t("orderConfirmed.next.receipt")}</li>
                </ol>
            </section>

            <div className="flex flex-wrap gap-3">
                <Link to={trackPath} className="bg-ink text-paper px-5 py-2.5 rounded-md text-sm font-semibold hover:opacity-90 focus-ring">
                    {isParent ? t("orderConfirmed.viewOrder") : t("order.placed.track")}
                </Link>
                {!isParent && (
                    <Link to={`/orders/${id}`} className="border border-line px-5 py-2.5 rounded-md text-sm font-medium hover:border-ink transition-colors focus-ring">
                        {t("orderConfirmed.viewOrder")}
                    </Link>
                )}
                <button type="button" onClick={handleShare} className="border border-line px-5 py-2.5 rounded-md text-sm font-medium hover:border-ink transition-colors focus-ring">
                    {t("order.placed.share")}
                </button>
                <Link to="/" className="px-5 py-2.5 rounded-md text-sm text-teal hover:underline focus-ring">{t("orderConfirmed.continue")}</Link>
            </div>
        </div>
    );
}
