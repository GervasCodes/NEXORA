import { useEffect, useState } from "react";
import { useParams, useLocation, Link, useNavigate } from "react-router-dom";
import api, { extractErrorMessage } from "../api/client";
import { formatDate } from "../utils/format";
import { useCurrency } from "../context/CurrencyContext";
import { useSocket } from "../context/SocketContext";
import DeliveryAgentRating from "../components/DeliveryAgentRating";
import OrderTimeline from "../components/OrderTimeline";
import TrackingWidget from "../components/TrackingWidget";

const CANCELLABLE = ["pending", "processing"];

const statusStyles = {
    pending: "bg-line text-ash",
    processing: "bg-mango/20 text-mango-dark",
    shipped: "bg-teal/10 text-teal",
    delivered: "bg-teal text-white",
    cancelled: "bg-coral/10 text-coral"
};

const VEHICLE_LABELS = {
    bicycle: "Bicycle",
    motorcycle: "Motorcycle",
    tuktuk: "Tuk-tuk",
    car: "Car",
    van: "Van",
    truck: "Truck"
};

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
        api.get(`/orders/${id}`).then(({ data }) => {
            setOrder(data.data);
            if (!data.data.is_parent) {
                api.get(`/delivery/${id}`).then(({ data: d }) => setDelivery(d.data)).catch(() => setDelivery(null));
            } else {
                setDelivery(null);
            }
        }).finally(() => setLoading(false));
    };

    useEffect(load, [id]);

    // Handles the buyer landing back here after Snippe/PayPal:
    //   ?payment=success        - Snippe: the webhook already confirmed the
    //                             payment server-side by the time the buyer's
    //                             browser gets here in most cases, but we
    //                             still reload the order to pick that up.
    //   ?payment=cancelled      - buyer backed out on Snippe/PayPal's site.
    //   ?payment=paypal_return  - PayPal redirects back with ?token=<paypal
    //                             order id>; THIS is what actually captures
    //                             the funds - never trust the redirect alone.
    useEffect(() => {
        const params = new URLSearchParams(location.search);
        const payment = params.get("payment");
        if (!payment) return;

        const cleanUrl = () => navigate(`/orders/${id}`, { replace: true, state: location.state });

        if (payment === "paypal_return") {
            const paypalOrderId = params.get("token");
            if (!paypalOrderId) {
                cleanUrl();
                return;
            }
            api.post("/payments/paypal/capture", { paypalOrderId })
                .then(() => setActionMessage("Payment successful."))
                .catch((err) => setActionError(extractErrorMessage(err)))
                .finally(() => {
                    load();
                    cleanUrl();
                });

        } else if (payment === "success") {
            setActionMessage("Payment successful.");
            load();
            cleanUrl();

        } else if (payment === "cancelled") {
            setActionError("Payment was cancelled - your order is still saved, you can try paying again below.");
            cleanUrl();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [location.search]);

    const { socket, connected } = useSocket();

    useEffect(() => {
        if (!socket || !connected || order?.is_parent) return;

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
    }, [socket, connected, id, order?.is_parent]);

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

    const handleRetrySnippe = async () => {
        setBusy(true);
        setActionError("");
        try {
            const origin = window.location.origin;
            const { data } = await api.post(`/payments/${id}/snippe/checkout`, {
                successUrl: `${origin}/orders/${id}?payment=success`,
                cancelUrl: `${origin}/orders/${id}?payment=cancelled`
            });
            window.location.href = data.data.url;
        } catch (err) {
            setActionError(extractErrorMessage(err));
            setBusy(false);
        }
    };

    const handleRetryPaypal = async () => {
        setBusy(true);
        setActionError("");
        try {
            const origin = window.location.origin;
            const { data } = await api.post(`/payments/${id}/paypal/create`, {
                returnUrl: `${origin}/orders/${id}?payment=paypal_return`,
                cancelUrl: `${origin}/orders/${id}?payment=cancelled`
            });
            window.location.href = data.data.url;
        } catch (err) {
            setActionError(extractErrorMessage(err));
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

            {!order.is_parent && <OrderTimeline status={order.status} />}

            <div className="grid grid-cols-2 gap-4 mb-8 text-sm">
                {!order.is_parent && (
                    <div>
                        <p className="text-ash mb-0.5">Status</p>
                        <p className="capitalize font-medium">{order.status}</p>
                    </div>
                )}
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

            {order.is_parent ? (
                <div className="space-y-4 mb-8">
                    <p className="text-xs uppercase tracking-widest text-ash">
                        {order.children.length} vendor {order.children.length === 1 ? "order" : "orders"}
                    </p>
                    {order.children.map((child) => (
                        <Link
                            key={child.id}
                            to={`/orders/${child.id}`}
                            className="block border border-line rounded-lg p-4 hover:border-abyss transition-colors"
                        >
                            <div className="flex items-center justify-between gap-4 mb-2">
                                <p className="text-sm font-medium price">{child.order_number}</p>
                                <span className={`text-xs font-medium px-2.5 py-1 rounded-full capitalize ${statusStyles[child.status] || "bg-line text-ash"}`}>
                                    {child.status}
                                </span>
                            </div>
                            <ul className="text-sm text-ash space-y-1">
                                {child.items?.map((item) => (
                                    <li key={item.id} className="flex justify-between">
                                        <span>{item.name} × {item.quantity}</span>
                                        <span className="price">{format(item.subtotal)}</span>
                                    </li>
                                ))}
                            </ul>
                        </Link>
                    ))}
                </div>
            ) : (
                <ul className="divide-y divide-line border-y border-line mb-6">
                    {order.items?.map((item) => (
                        <li key={item.id} className="py-3 flex justify-between text-sm">
                            <span>{item.name} × {item.quantity}</span>
                            <span className="price">{format(item.subtotal)}</span>
                        </li>
                    ))}
                </ul>
            )}

            <div className="flex justify-between items-baseline mb-8">
                <span className="text-sm text-ash">Total</span>
                <span className="price text-xl font-medium">{format(order.total_amount)}</span>
            </div>

            {!order.is_parent && delivery?.agent_id && !["delivered", "failed"].includes(delivery.status) && (
                <div className="mb-8">
                    <p className="text-xs uppercase tracking-widest text-ash mb-2">Live tracking</p>
                    {(delivery.agent_vehicle_type || delivery.agent_vehicle_plate_number) && (
                        <p className="text-sm text-ash mb-2">
                            {delivery.agent_first_name} is on a {VEHICLE_LABELS[delivery.agent_vehicle_type] || delivery.agent_vehicle_type}
                            {delivery.agent_vehicle_plate_number && ` · Plate ${delivery.agent_vehicle_plate_number}`}
                        </p>
                    )}
                    <TrackingWidget
                        orderId={id}
                        delivery={delivery}
                        destination={
                            order.delivery_lat && order.delivery_lng
                                ? { lat: order.delivery_lat, lng: order.delivery_lng }
                                : null
                        }
                    />
                </div>
            )}

            {!order.is_parent && delivery?.agent_id && delivery.status === "delivered" && (
                <div className="mb-8">
                    <DeliveryAgentRating
                        orderId={id}
                        existingRating={delivery.rating}
                        onRated={load}
                    />
                </div>
            )}

            {order.parent_order_id && (
                <p className="text-xs text-ash mb-4">
                    Part of order <Link to={`/orders/${order.parent_order_id}`} className="text-teal hover:underline">{order.order_number.split("-V")[0]}</Link> · payment and cancellation are handled there.
                </p>
            )}

            <div className="flex flex-wrap gap-3">
                {!order.parent_order_id && order.payment_method === "mobile_money" && order.payment_status === "unpaid" && (
                    <button onClick={handleRetryPayment} disabled={busy}
                        className="bg-mango text-abyss px-5 py-2.5 rounded-md text-sm font-medium hover:bg-mango-dark transition-colors focus-ring disabled:opacity-60">
                        {busy ? "Processing…" : "Pay with Mobile Money"}
                    </button>
                )}
                {!order.parent_order_id && order.payment_method === "snippe" && order.payment_status === "unpaid" && (
                    <button onClick={handleRetrySnippe} disabled={busy}
                        className="bg-mango text-abyss px-5 py-2.5 rounded-md text-sm font-medium hover:bg-mango-dark transition-colors focus-ring disabled:opacity-60">
                        {busy ? "Redirecting…" : "Pay with Card (Snippe)"}
                    </button>
                )}
                {!order.parent_order_id && order.payment_method === "paypal" && order.payment_status === "unpaid" && (
                    <button onClick={handleRetryPaypal} disabled={busy}
                        className="bg-mango text-abyss px-5 py-2.5 rounded-md text-sm font-medium hover:bg-mango-dark transition-colors focus-ring disabled:opacity-60">
                        {busy ? "Redirecting…" : "Pay with PayPal"}
                    </button>
                )}
                {!order.parent_order_id && CANCELLABLE.includes(order.status) && (
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
                {!order.is_parent && !["pending", "cancelled"].includes(order.status) && (
                    <Link to={`/disputes/new?order_id=${id}`}
                        className="border border-line px-5 py-2.5 rounded-md text-sm font-medium hover:border-coral hover:text-coral transition-colors focus-ring">
                        ⚠️ Report a problem
                    </Link>
                )}
            </div>
        </div>
    );
}
