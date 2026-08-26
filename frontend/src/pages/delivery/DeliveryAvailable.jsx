import { useEffect, useRef, useState } from "react";
import api, { extractErrorMessage } from "../../api/client";
import { formatMoney } from "../../utils/format";
import PageLoader from "../../components/PageLoader";
import Button from "../../components/ui/Button";
import PageMeta from "../../components/PageMeta";
import { useLanguage } from "../../context/LanguageContext";
import { useToast } from "../../context/ToastContext";

// There's no socket event yet for "an order entered the manual available-
// for-pickup pool" (see delivery.service.js's fallback-pool comments) -
// the offer system (delivery:offer) only pushes to one nearest agent at a
// time, not the shared pool this page reads from. Polling is the stopgap
// until a dedicated broadcast (e.g. "delivery:pool_updated" to an
// "agents" room) is added server-side.
const POLL_INTERVAL_MS = 15000;

export default function DeliveryAvailable() {
    const { t } = useLanguage();
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [busyId, setBusyId] = useState(null);
    const toast = useToast();
    const [message, setMessage] = useState("");
    const inFlightRef = useRef(false);

    // `silent` skips the loading flag so periodic polling ticks update the
    // list in place rather than re-showing the full-page loader on every
    // refresh - only the very first load (and a manual claim's follow-up
    // load()) show it.
    const load = (silent = false) => {
        if (inFlightRef.current) return;
        inFlightRef.current = true;
        if (!silent) setLoading(true);
        api
            .get("/delivery/available")
            .then(({ data }) => setOrders(data.data))
            .catch(() => {
                // Silent - a missed poll tick isn't worth surfacing an error
                // toast for; the next tick (or a manual refresh) recovers.
            })
            .finally(() => {
                inFlightRef.current = false;
                if (!silent) setLoading(false);
            });
    };

    useEffect(() => {
        load();
        const interval = setInterval(() => load(true), POLL_INTERVAL_MS);
        return () => clearInterval(interval);
    }, []);

    const claim = async (orderId) => {
        setBusyId(orderId);
        setMessage("");
        try {
            await api.post(`/delivery/${orderId}/claim`);
            setMessage(t("delivery.agent.available.claimed"));
            load();
        } catch (err) {
            toast?.error(extractErrorMessage(err));
        } finally {
            setBusyId(null);
        }
    };

    if (loading) return <PageLoader />;

    return (
        <div>
            <PageMeta title="Available Deliveries" noIndex />
            {message && <p className="text-teal text-sm mb-4">{message}</p>}

            {orders.length === 0 && (
                <p className="text-ash text-sm">{t("delivery.agent.available.empty")}</p>
            )}

            <ul className="divide-y divide-line border-y border-line">
                {orders.map((order) => (
                    <li key={order.order_id} className="py-4 flex flex-wrap items-center gap-3">
                        <div className="min-w-0 flex-1">
                            <p className="price text-sm font-medium">{order.order_number}</p>
                            <p className="text-xs text-ash truncate">
                                {order.shipping_address}, {order.shipping_city}, {order.shipping_region}
                            </p>
                        </div>
                        <p className="price text-sm">{formatMoney(order.total_amount)}</p>
                        <Button
                            onClick={() => claim(order.order_id)}
                            disabled={busyId === order.order_id}
                        >
                            {busyId === order.order_id ? t("delivery.agent.available.claiming") : t("delivery.agent.available.claim")}
                        </Button>
                    </li>
                ))}
            </ul>
        </div>
    );
}
