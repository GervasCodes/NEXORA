import { useEffect, useState } from "react";
import api, { extractErrorMessage } from "../../api/client";
import { formatMoney, formatDate } from "../../utils/format";
import PageLoader from "../../components/PageLoader";
import Button from "../../components/ui/Button";
import PageMeta from "../../components/PageMeta";

export default function SellerOrders() {
    const [orders, setOrders] = useState([]);
    const [roster, setRoster] = useState([]);
    const [loading, setLoading] = useState(true);
    const [busyId, setBusyId] = useState(null);
    const [error, setError] = useState("");
    const [shipChoice, setShipChoice] = useState({}); // orderId -> agentId or "" for platform

    const load = () => {
        api.get("/orders/seller/list").then(({ data }) => setOrders(data.data)).finally(() => setLoading(false));
        api.get("/seller/delivery-agents").then(({ data }) => setRoster(data.data)).catch(() => {});
    };

    useEffect(load, []);

    const updateStatus = async (orderId, status, agentId) => {
        setBusyId(orderId);
        setError("");
        try {
            await api.put(`/orders/${orderId}/status`, {
                status,
                ...(agentId ? { agent_id: agentId } : {})
            });
            load();
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setBusyId(null);
        }
    };

    if (loading) return <PageLoader />;

    return (
        <div>
            <PageMeta title="Orders" noIndex />
            <h1 className="font-display text-2xl mb-6">Orders</h1>

            {error && <p role="alert" className="text-coral text-sm mb-4">{error}</p>}

            {orders.length === 0 && <p className="text-ash text-sm">No orders yet.</p>}

            <ul className="divide-y divide-line border-y border-line">
                {orders.map((order) => (
                    <li key={order.id} className="py-4 flex flex-wrap items-center gap-3">
                        <div className="min-w-0 flex-1">
                            <p className="price text-sm font-medium">{order.order_number}</p>
                            <p className="text-xs text-ash">{formatDate(order.created_at)}</p>
                        </div>

                        <span className="text-xs font-medium px-2 py-1 rounded-full bg-line text-ash capitalize">
                            {order.status}
                        </span>

                        <p className="price text-sm">{formatMoney(order.total_amount)}</p>

                        <div className="flex items-center gap-2 flex-wrap">
                            {order.status === "pending" && (
                                <>
                                    <Button
                                        onClick={() => updateStatus(order.id, "processing")}
                                        disabled={busyId === order.id}
                                        variant="secondary"
                                        size="sm"
                                    >
                                        Accept
                                    </Button>
                                    <Button
                                        onClick={() => updateStatus(order.id, "cancelled")}
                                        disabled={busyId === order.id}
                                        variant="secondary"
                                        size="sm"
                                    >
                                        Reject
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
                                                <option value="">Platform pool</option>
                                            )}
                                            {roster.map((agent) => (
                                                <option key={agent.agent_id} value={agent.agent_id}>
                                                    {agent.first_name} {agent.last_name} (my team)
                                                </option>
                                            ))}
                                        </select>
                                    )}
                                    {order.payment_method === "cash_on_delivery" && roster.length === 0 && (
                                        <span className="text-xs text-coral">
                                            Add a delivery agent to your roster to ship Cash on Delivery orders
                                        </span>
                                    )}
                                    <Button
                                        onClick={() => updateStatus(order.id, "shipped", shipChoice[order.id])}
                                        disabled={busyId === order.id || (order.payment_method === "cash_on_delivery" && !shipChoice[order.id])}
                                        variant="secondary"
                                        size="sm"
                                    >
                                        Mark shipped
                                    </Button>
                                    <Button
                                        onClick={() => updateStatus(order.id, "cancelled")}
                                        disabled={busyId === order.id}
                                        variant="secondary"
                                        size="sm"
                                    >
                                        Cancel
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
                                    Mark delivered
                                </Button>
                            )}

                            {order.status === "delivered" && order.payment_status === "unpaid" && (
                                <span className="text-xs text-ash italic">
                                    Waiting for buyer to confirm receipt & cash payment
                                </span>
                            )}
                        </div>
                    </li>
                ))}
            </ul>
        </div>
    );
}
