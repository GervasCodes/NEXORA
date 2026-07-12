import { useEffect, useState } from "react";
import { useParams, useLocation, Link, useNavigate } from "react-router-dom";
import api, { extractErrorMessage } from "../api/client";
import { formatDate } from "../utils/format";
import { useCurrency } from "../context/CurrencyContext";
import { useSocket } from "../context/SocketContext";
import DeliveryTrackingMap from "../components/DeliveryTrackingMap";

const CANCELLABLE = ["pending", "processing"];

export default function OrderDetail() {
    const { format } = useCurrency();
    const { id } = useParams();
    const location = useLocation();
    const navigate = useNavigate();
    const [order, setOrder] = useState(null);
    const [delivery, setDelivery] = useState(null);
    const [loading, setLoading] = useState(true);
    const [actionMessage, setActionMessage] = useState(
        location.state?.justPlaced ? "Order placed successfully." : ""
    );
    const [actionError, setActionError] = useState("");
    const [busy, setBusy] = useState(false);

    const load = () => {
        api.get(`/orders/${id}`).then(({ data }) => setOrder(data.data)).finally(() => setLoading(false));
        api.get(`/delivery/${id}`).then(({ data }) => setDelivery(data.data)).catch(() => setDelivery(null));
    };

    useEffect(load, [id]);

    const { socket, connected } = useSocket();

    useEffect(() => {
        if (!socket || !connected) return;

        socket.emit("join_order_tracking", id);

        const refreshDelivery = () => {
            api.get(`/delivery/${id}`).then(({ data }) => setDelivery(data.data)).catch(() => {});
        };

        socket.on("delivery:assigned", refreshDelivery);
        socket.on("delivery:status", refreshDelivery);

        return () => {
            socket.emit("leave_order_tracking", id);
            socket.off("delivery:assigned", refreshDelivery);
            socket.off("delivery:status", refreshDelivery);
        };
    }, [socket, connected, id]);

    const handleMessageAgent = async () => {
        try {
            const { data } = await api.post("/chat/conversations", {
                other_user_id: delivery.agent_id,
                role: "delivery_agent",
                order_id: order.id
            });
            navigate(`/messages/${data.data.id}`);
        } catch (err) {
            setActionError(extractErrorMessage(err));
        }
    };

    const handleCancel = async () => {
        setBusy(true);
        setActionError("");
        try {
            await api.put(`/orders/${id}/cancel`);
            setActionMessage("Order cancelled.");
            load();
        } catch (err) {
            setActionError(extractErrorMessage(err));
        } finally {
            setBusy(false);
        }
    };

    const handleRetryPayment = async () => {
        setBusy(true);
        setActionError("");
        try {
            await api.post(`/payments/${id}/initiate`);
            setActionMessage("Payment completed.");
            load();
        } catch (err) {
            setActionError(extractErrorMessage(err));
        } finally {
            setBusy(false);
        }
    };

    if (loading) return <div className="max-w-2xl mx-auto px-6 py-16 text-ash">Loading order…</div>;

    if (!order) {
        return (
            <div className="max-w-2xl mx-auto px-6 py-24 text-center">
                <p className="font-display text-2xl mb-2">Order not found</p>
                <Link to="/orders" className="text-teal hover:underline text-sm">Back to orders</Link>
            </div>
        );
    }

    return (
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10">
            <p className="text-xs uppercase tracking-widest text-ash mb-1">Order</p>
            <h1 className="price font-display text-2xl mb-1">{order.order_number}</h1>
            <p className="text-sm text-ash mb-6">Placed {formatDate(order.created_at)}</p>

            {actionMessage && <p className="text-sm text-teal mb-4">{actionMessage}</p>}
            {actionError && <p className="text-sm text-coral mb-4">{actionError}</p>}

            <div className="grid grid-cols-2 gap-4 mb-8 text-sm">
                <div>
                    <p className="text-ash mb-0.5">Status</p>
                    <p className="capitalize font-medium">{order.status}</p>
                </div>
                <div>
                    <p className="text-ash mb-0.5">Payment</p>
                    <p className="capitalize font-medium">
                        {order.payment_status} · {order.payment_method.replace("_", " ")}
                    </p>
                </div>
                <div className="col-span-2">
                    <p className="text-ash mb-0.5">Delivering to</p>
                    <p className="font-medium">
                        {order.shipping_address}, {order.shipping_city}, {order.shipping_region}
                    </p>
                    <p className="text-ash text-xs mt-0.5">{order.shipping_phone}</p>
                </div>
            </div>

            <ul className="divide-y divide-line border-y border-line mb-6">
                {order.items?.map((item) => (
                    <li key={item.id} className="py-3 flex justify-between text-sm">
                        <span>{item.name} × {item.quantity}</span>
                        <span className="price">{format(item.subtotal)}</span>
                    </li>
                ))}
            </ul>

            <div className="flex justify-between items-baseline mb-8">
                <span className="text-sm text-ash">Total</span>
                <span className="price text-xl font-medium">{format(order.total_amount)}</span>
            </div>

            {delivery?.agent_id && !["delivered", "failed"].includes(delivery.status) && (
                <div className="mb-8">
                    <p className="text-xs uppercase tracking-widest text-ash mb-2">Live tracking</p>
                    <DeliveryTrackingMap
                        orderId={id}
                        destination={
                            order.delivery_lat && order.delivery_lng
                                ? { lat: order.delivery_lat, lng: order.delivery_lng }
                                : null
                        }
                    />
                </div>
            )}

            <div className="flex flex-wrap gap-3">
                {order.payment_method === "mobile_money" && order.payment_status === "unpaid" && (
                    <button onClick={handleRetryPayment} disabled={busy}
                        className="bg-mango text-ink px-5 py-2.5 rounded-md text-sm font-medium hover:bg-mango-dark transition-colors focus-ring disabled:opacity-60">
                        {busy ? "Processing…" : "Pay with Mobile Money"}
                    </button>
                )}
                {CANCELLABLE.includes(order.status) && (
                    <button onClick={handleCancel} disabled={busy}
                        className="border border-coral text-coral px-5 py-2.5 rounded-md text-sm font-medium hover:bg-coral/5 transition-colors focus-ring disabled:opacity-60">
                        Cancel order
                    </button>
                )}
                {delivery?.agent_id && (
                    <button onClick={handleMessageAgent}
                        className="border border-line px-5 py-2.5 rounded-md text-sm font-medium hover:border-abyss transition-colors focus-ring">
                        💬 Message delivery agent
                    </button>
                )}
            </div>
        </div>
    );
}
