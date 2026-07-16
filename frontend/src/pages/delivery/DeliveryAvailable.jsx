import { useEffect, useState } from "react";
import api, { extractErrorMessage } from "../../api/client";
import { formatMoney } from "../../utils/format";

export default function DeliveryAvailable() {
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [busyId, setBusyId] = useState(null);
    const [error, setError] = useState("");
    const [message, setMessage] = useState("");

    const load = () => {
        setLoading(true);
        api.get("/delivery/available").then(({ data }) => setOrders(data.data)).finally(() => setLoading(false));
    };

    useEffect(load, []);

    const claim = async (orderId) => {
        setBusyId(orderId);
        setError("");
        setMessage("");
        try {
            await api.post(`/delivery/${orderId}/claim`);
            setMessage("Order claimed — find it under My deliveries.");
            load();
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setBusyId(null);
        }
    };

    if (loading) return <p className="text-ash">Loading available orders…</p>;

    return (
        <div>
            {message && <p className="text-teal text-sm mb-4">{message}</p>}
            {error && <p className="text-coral text-sm mb-4">{error}</p>}

            {orders.length === 0 && (
                <p className="text-ash text-sm">No orders ready for pickup right now. Check back soon.</p>
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
                        <button
                            onClick={() => claim(order.order_id)}
                            disabled={busyId === order.order_id}
                            className="bg-mango text-abyss px-4 py-2 rounded-md text-sm font-medium hover:bg-mango-dark transition-colors disabled:opacity-60"
                        >
                            {busyId === order.order_id ? "Claiming…" : "Claim"}
                        </button>
                    </li>
                ))}
            </ul>
        </div>
    );
}
