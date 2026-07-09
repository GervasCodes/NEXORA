import { useEffect, useState } from "react";
import api, { extractErrorMessage } from "../../api/client";
import { formatMoney, formatDate } from "../../utils/format";

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

    const confirmCod = async (orderId) => {
        setBusyId(orderId);
        setError("");
        try {
            await api.put(`/payments/${orderId}/confirm-cod`);
            load();
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setBusyId(null);
        }
    };

    if (loading) return <p className="text-ash">Loading orders…</p>;

    return (
        <div>
            <h1 className="font-display text-2xl mb-6">Orders</h1>

            {error && <p className="text-coral text-sm mb-4">{error}</p>}

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
                                    <button
                                        onClick={() => updateStatus(order.id, "processing")}
                                        disabled={busyId === order.id}
                                        className="text-xs border border-line px-3 py-1.5 rounded-md hover:border-ink transition-colors disabled:opacity-50"
                                    >
                                        Accept
                                    </button>
                                    <button
                                        onClick={() => updateStatus(order.id, "cancelled")}
                                        disabled={busyId === order.id}
                                        className="text-xs border border-line px-3 py-1.5 rounded-md hover:border-ink transition-colors disabled:opacity-50"
                                    >
                                        Reject
                                    </button>
                                </>
                            )}

                            {order.status === "processing" && (
                                <>
                                    {roster.length > 0 && (
                                        <select
                                            value={shipChoice[order.id] || ""}
                                            onChange={(e) => setShipChoice({ ...shipChoice, [order.id]: e.target.value })}
                                            className="text-xs border border-line rounded-md px-2 py-1.5 focus-ring bg-white"
                                        >
                                            <option value="">Platform pool</option>
                                            {roster.map((agent) => (
                                                <option key={agent.agent_id} value={agent.agent_id}>
                                                    {agent.first_name} {agent.last_name} (my team)
                                                </option>
                                            ))}
                                        </select>
                                    )}
                                    <button
                                        onClick={() => updateStatus(order.id, "shipped", shipChoice[order.id])}
                                        disabled={busyId === order.id}
                                        className="text-xs border border-line px-3 py-1.5 rounded-md hover:border-ink transition-colors disabled:opacity-50"
                                    >
                                        Mark shipped
                                    </button>
                                    <button
                                        onClick={() => updateStatus(order.id, "cancelled")}
                                        disabled={busyId === order.id}
                                        className="text-xs border border-line px-3 py-1.5 rounded-md hover:border-ink transition-colors disabled:opacity-50"
                                    >
                                        Cancel
                                    </button>
                                </>
                            )}

                            {order.status === "shipped" && (
                                <button
                                    onClick={() => updateStatus(order.id, "delivered")}
                                    disabled={busyId === order.id}
                                    className="text-xs border border-line px-3 py-1.5 rounded-md hover:border-ink transition-colors disabled:opacity-50"
                                >
                                    Mark delivered
                                </button>
                            )}

                            {order.status === "delivered" && order.payment_status === "unpaid" && (
                                <button
                                    onClick={() => confirmCod(order.id)}
                                    disabled={busyId === order.id}
                                    className="text-xs bg-teal text-white px-3 py-1.5 rounded-md hover:opacity-90 transition-opacity disabled:opacity-50"
                                >
                                    Confirm COD received
                                </button>
                            )}
                        </div>
                    </li>
                ))}
            </ul>
        </div>
    );
}
