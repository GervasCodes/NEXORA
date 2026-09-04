import { useEffect, useState } from "react";
import api, { extractErrorMessage } from "../../api/client";
import { formatMoney, formatDate } from "../../utils/format";
import PageLoader from "../../components/PageLoader";
import Button from "../../components/ui/Button";
import PageMeta from "../../components/PageMeta";
import { useToast } from "../../context/ToastContext";
import { useLanguage } from "../../context/LanguageContext";
import EmptyState from "../../components/ui/EmptyState";
import SavedFilters from "../../components/seller/SavedFilters";

const STATUS_OPTIONS = ["pending", "processing", "shipped", "delivered", "cancelled"];

export default function SellerOrders() {
    const { t } = useLanguage();
    const [orders, setOrders] = useState([]);
    const [roster, setRoster] = useState([]);
    const [loading, setLoading] = useState(true);
    const [busyId, setBusyId] = useState(null);
    const toast = useToast();
    const [shipChoice, setShipChoice] = useState({}); // orderId -> agentId or "" for platform

    // Filters + saved filter views (Phase 11, UI/UX remediation) - this
    // page previously fetched every order with no filtering at all.
    const [searchInput, setSearchInput] = useState("");
    const [search, setSearch] = useState("");
    const [status, setStatus] = useState("");

    useEffect(() => {
        const handle = setTimeout(() => setSearch(searchInput), 400);
        return () => clearTimeout(handle);
    }, [searchInput]);

    const load = () => {
        setLoading(true);
        const params = {};
        if (search.trim()) params.q = search.trim();
        if (status) params.status = status;
        api.get("/orders/seller/list", { params }).then(({ data }) => setOrders(data.data)).finally(() => setLoading(false));
        api.get("/seller/delivery-agents").then(({ data }) => setRoster(data.data)).catch(() => {});
    };

    useEffect(load, [search, status]);

    const applySavedFilters = (filters) => {
        setSearchInput(filters.search || "");
        setSearch(filters.search || "");
        setStatus(filters.status || "");
    };

    const updateStatus = async (orderId, status, agentId) => {
        setBusyId(orderId);
        try {
            await api.put(`/orders/${orderId}/status`, {
                status,
                ...(agentId ? { agent_id: agentId } : {})
            });
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
            <PageMeta title="Orders" noIndex />
            <h1 className="font-display text-2xl mb-6">{t("seller.orders.title")}</h1>

            <SavedFilters
                pageKey="seller_orders"
                currentFilters={{ search, status }}
                onApply={applySavedFilters}
            />

            <div className="flex flex-wrap gap-3 mb-6">
                <input
                    type="text"
                    placeholder="Search order number or product…"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    className="flex-1 min-w-[180px] sm:min-w-[220px] border border-line rounded-md px-3 py-1.5 text-sm focus-ring"
                />
                <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    className="border border-line rounded-md px-3 py-1.5 text-sm focus-ring"
                >
                    <option value="">All statuses</option>
                    {STATUS_OPTIONS.map((s) => (
                        <option key={s} value={s} className="capitalize">{s}</option>
                    ))}
                </select>
                {(search || status) && (
                    <button
                        onClick={() => { setSearchInput(""); setSearch(""); setStatus(""); }}
                        className="text-xs text-ash underline hover:text-ink transition-colors"
                    >
                        {t("filters.clear")}
                    </button>
                )}
            </div>


            {orders.length === 0 && (
                <EmptyState title={(search || status) ? "No orders match these filters" : t("seller.orders.empty")} />
            )}

            <ul className="divide-y divide-line border-y border-line">
                {orders.map((order) => (
                    <li key={order.id} className="py-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                        <div className="min-w-0 flex-1">
                            <p className="price text-sm font-medium">{order.order_number}</p>
                            <p className="text-xs text-ash">{formatDate(order.created_at)}</p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
                            <span className="text-xs font-medium px-2 py-1 rounded-full bg-line text-ash capitalize">
                                {order.status}
                            </span>

                            {order.wallet_credit_pending && (
                                <span
                                    className="text-xs font-medium px-2 py-1 rounded-full bg-amber-100 text-amber-800"
                                    title={t("seller.orders.payoutPendingTooltip")}
                                >
                                    {t("seller.orders.payoutPending")}
                                </span>
                            )}

                            <p className="price text-sm">{formatMoney(order.total_amount)}</p>
                        </div>

                        <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
                            {order.status === "pending" && (
                                <>
                                    <Button
                                        onClick={() => updateStatus(order.id, "processing")}
                                        disabled={busyId === order.id}
                                        variant="secondary"
                                        size="sm"
                                    >
                                        {t("seller.orders.accept")}
                                    </Button>
                                    <Button
                                        onClick={() => updateStatus(order.id, "cancelled")}
                                        disabled={busyId === order.id}
                                        variant="secondary"
                                        size="sm"
                                    >
                                        {t("seller.orders.reject")}
                                    </Button>
                                </>
                            )}

                            {order.status === "processing" && (
                                <>
                                    {roster.length > 0 && (
                                        <select
                                            value={shipChoice[order.id] || ""}
                                            onChange={(e) => setShipChoice({ ...shipChoice, [order.id]: e.target.value })}
                                            className="text-xs border border-line rounded-md px-2 py-1.5 focus-ring bg-paper"
                                        >
                                            {order.payment_method !== "cash_on_delivery" && (
                                                <option value="">{t("seller.orders.platformPool")}</option>
                                            )}
                                            {roster.map((agent) => (
                                                <option key={agent.agent_id} value={agent.agent_id}>
                                                    {t("seller.orders.agentMyTeam", { name: `${agent.first_name} ${agent.last_name}` })}
                                                </option>
                                            ))}
                                        </select>
                                    )}
                                    {order.payment_method === "cash_on_delivery" && roster.length === 0 && (
                                        <span className="text-xs text-coral">
                                            {t("seller.orders.addAgentHint")}
                                        </span>
                                    )}
                                    <Button
                                        onClick={() => updateStatus(order.id, "shipped", shipChoice[order.id])}
                                        disabled={busyId === order.id || (order.payment_method === "cash_on_delivery" && !shipChoice[order.id])}
                                        variant="secondary"
                                        size="sm"
                                    >
                                        {t("seller.orders.markShipped")}
                                    </Button>
                                    <Button
                                        onClick={() => updateStatus(order.id, "cancelled")}
                                        disabled={busyId === order.id}
                                        variant="secondary"
                                        size="sm"
                                    >
                                        {t("common.cancel")}
                                    </Button>
                                </>
                            )}

                            {order.status === "shipped" && (
                                <Button
                                    onClick={() => updateStatus(order.id, "delivered")}
                                    disabled={busyId === order.id}
                                    variant="secondary"
                                    size="sm"
                                >
                                    {t("seller.orders.markDelivered")}
                                </Button>
                            )}

                            {order.status === "delivered" && order.payment_status === "unpaid" && (
                                <span className="text-xs text-ash italic">
                                    {t("seller.orders.waitingConfirmation")}
                                </span>
                            )}
                        </div>
                    </li>
                ))}
            </ul>
        </div>
    );
}
