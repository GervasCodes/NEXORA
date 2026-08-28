import { useEffect, useState } from "react";
import { useParams, useLocation, Link, useNavigate } from "react-router-dom";
import api, { extractErrorMessage } from "../api/client";
import { formatDate } from "../utils/format";
import { useCurrency } from "../context/CurrencyContext";
import { useSocket } from "../context/SocketContext";
import DeliveryAgentRating from "../components/DeliveryAgentRating";
import OrderTimeline from "../components/OrderTimeline";
import TrackingWidget from "../components/TrackingWidget";
import PageLoader from "../components/PageLoader";
import Button from "../components/ui/Button";
import PageMeta from "../components/PageMeta";
import { useAIAssistant } from "../context/AIAssistantContext";
import FiscalReceiptBadge from "../components/FiscalReceiptBadge";
import PaymentStatusBanner, { PaymentConfirmedPill } from "../components/PaymentStatusBanner";
import { ORDER_STATE, getOrderState } from "../utils/orderStatusModel";

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
    const assistant = useAIAssistant();
    const [order, setOrder] = useState(null);
    const [delivery, setDelivery] = useState(null);
    const [loading, setLoading] = useState(true);
    const [actionMessage, setActionMessage] = useState(
        location.state?.justPlaced ? "Order placed successfully." : ""
    );
    const [actionError, setActionError] = useState(
        // Checkout redirects here (instead of stranding the buyer on the
        // checkout page) when the order was created but the payment step
        // right after it failed - see Checkout.jsx's handleSubmit catch
        // block. The order already exists; only the payment needs retrying.
        location.state?.paymentFailed
            ? "Your order was placed, but we couldn't start the payment. You can retry payment below."
            : ""
    );
    const [busy, setBusy] = useState(false);

    // Phase 2 (Honest Status Transparency): not a persisted order field
    // (orders.payment_status is only ever 'unpaid'/'paid' - see
    // database/schema/orders.sql) - this is the transient "we just heard
    // it failed/was cancelled" signal from a redirect or the
    // payment:updated socket event below, kept distinct from
    // actionError's free-text message so the PaymentStatusBanner can
    // render its own dedicated failed-state visual instead of relying on
    // string content. Cleared back to false the moment a fresh load
    // shows the order paid.
    const [paymentFailed, setPaymentFailed] = useState(Boolean(location.state?.paymentFailed));

    const load = () => {
        api.get(`/orders/${id}`).then(({ data }) => {
            setOrder(data.data);
            if (data.data.payment_status === "paid") setPaymentFailed(false);
            if (!data.data.is_parent) {
                api.get(`/delivery/${id}`).then(({ data: d }) => setDelivery(d.data)).catch(() => setDelivery(null));
            } else {
                setDelivery(null);
            }
        }).finally(() => setLoading(false));
    };

    useEffect(load, [id]);

    
    // Polls GET /orders/:id a few times as a fallback for the "payment:updated"
    // socket event below, in case the buyer's socket was still reconnecting
    // (e.g. right after a Snippe/PayPal redirect back into the app) when the
    // provider's webhook actually landed. Never declares failure on its own -
    // a timeout just means "still waiting", not "it failed".
    const pollForPaymentConfirmation = (attempt = 0) => {
        api.get(`/orders/${id}`).then(({ data }) => {
            const fresh = data.data;
            if (fresh.payment_status === "paid") {
                setOrder(fresh);
                setActionMessage("Payment successful.");
                setPaymentFailed(false);
                return;
            }
            if (attempt < 6) {
                setTimeout(() => pollForPaymentConfirmation(attempt + 1), 3000);
            } else {
                setActionMessage("We're still confirming your payment - this can take a minute. Refresh to check the latest status.");
            }
        }).catch(() => {});
    };

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
                .then(({ data }) => {
                    if (data.data?.success) {
                        setActionMessage("Payment successful.");
                        setPaymentFailed(false);
                    } else {
                        setActionError("Payment was not completed. Please try again.");
                        setPaymentFailed(true);
                    }
                })
                .catch((err) => {
                    setActionError(extractErrorMessage(err));
                    setPaymentFailed(true);
                })
                .finally(() => {
                    load();
                    cleanUrl();
                });

        } else if (payment === "success") {
            // The redirect only means the buyer finished the checkout step on
            // Snippe's side - the actual confirmation is the provider's
            // webhook, which may not have landed yet. Show a pending state
            // and wait for either the socket event or the poll fallback
            // below to confirm it before saying "successful".
            setActionMessage("Confirming your payment…");
            load();
            pollForPaymentConfirmation();
            cleanUrl();

        } else if (payment === "cancelled") {
            setActionError("Payment was cancelled - your order is still saved, you can try paying again below.");
            setPaymentFailed(true);
            cleanUrl();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [location.search]);

    const { socket, connected } = useSocket();

    // Live confirmation from the backend once the provider's webhook is
    // actually processed - covers mobile money (buyer stays on this page
    // entering their PIN) as well as being the fastest path for the Snippe/
    // PayPal redirect flows above.
    useEffect(() => {
        if (!socket || !connected) return;

        const handlePaymentUpdated = (payload) => {
            if (Number(payload.orderId) !== Number(id)) return;
            load();
            setActionMessage(payload.success ? "Payment successful." : "");
            setActionError(payload.success ? "" : "Payment could not be confirmed. Please try again.");
            setPaymentFailed(!payload.success);
        };

        socket.on("payment:updated", handlePaymentUpdated);
        return () => socket.off("payment:updated", handlePaymentUpdated);
    }, [socket, connected, id]);

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

    const handleConfirmReceipt = async () => {
        setBusy(true);
        setActionError("");
        try {
            const { data } = await api.put(`/payments/${id}/confirm-receipt`);
            setActionMessage(
                data.data?.paymentConfirmed
                    ? "Receipt confirmed - Cash on Delivery payment recorded. Thank you!"
                    : "Receipt confirmed. Thank you!"
            );
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
            // Sending the USSD prompt only means the buyer can now enter
            // their PIN - it is not confirmation the payment went through.
            // The actual result arrives later via the "payment:updated"
            // socket listener above once the provider's webhook lands.
            const { data } = await api.post(`/payments/${id}/initiate`);
            setActionMessage(data.message || "Check your phone to complete the payment.");
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

    // MalipoPay Card equivalent of handleRetrySnippe above - same
    // hosted-checkout retry shape, different route/provider.
    const handleRetryMalipopayCard = async () => {
        setBusy(true);
        setActionError("");
        try {
            const origin = window.location.origin;
            const { data } = await api.post(`/payments/${id}/malipopay-card/checkout`, {
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

    if (loading) return <PageLoader />;

    if (!order) {
        return (
            <div className="max-w-2xl mx-auto px-6 py-24 text-center">
                <p className="font-display text-2xl mb-2">Order not found</p>
                <Link to="/orders" className="text-teal hover:underline text-sm">Back to orders</Link>
            </div>
        );
    }

    // Phase 2 (Honest Status Transparency): a single computed state
    // drives both the payment banner below and the "Live tracking"
    // section's searching-vs-assigned visual, so the two never disagree
    // about what stage this order is actually in. Child orders (see
    // order.parent_order_id below) don't own payment - it's handled on
    // the parent - so the banner is scoped to non-child orders only.
    const orderState = !order.parent_order_id
        ? getOrderState(order, delivery, { paymentFailed })
        : ORDER_STATE.OTHER;
    const showTracking = !order.is_parent && (
        orderState === ORDER_STATE.SEARCHING
        || (delivery?.agent_id && !["delivered", "failed"].includes(delivery.status))
    );

    return (
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10">
            <PageMeta title={`Order ${order.order_number}`} noIndex />
            <p className="text-xs uppercase tracking-widest text-ash mb-1">Order</p>
            <h1 className="price font-display text-2xl mb-1">{order.order_number}</h1>
            <p className="text-sm text-ash mb-6">Placed {formatDate(order.created_at)}</p>

            <PaymentStatusBanner state={orderState} />

            {actionMessage && <p className="text-sm text-teal mb-4">{actionMessage}</p>}
            {actionError && <p className="text-sm text-coral mb-4">{actionError}</p>}

            {!order.is_parent && (
                <OrderTimeline status={order.status} searching={orderState === ORDER_STATE.SEARCHING} />
            )}

            {/* Phase B1: order-status assistant - reads this same real
                order via /ai/orders/:id/explain, AI only phrases it. */}
            {!order.is_parent && assistant && (
                <button
                    type="button"
                    onClick={() => assistant.open({ type: "order", orderId: order.id })}
                    className="text-sm text-azure hover:underline mb-6 -mt-3 block"
                >
                    Ask Nexora AI about this order
                </button>
            )}

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
                    {order.buyer_confirmed_at && (
                        <p className="text-xs text-teal mt-0.5">Receipt confirmed {formatDate(order.buyer_confirmed_at)}</p>
                    )}
                    {!order.is_parent && order.payment_status === "paid" && (
                        <FiscalReceiptBadge orderId={order.id} />
                    )}
                </div>
                <div className="col-span-2">
                    <p className="text-ash mb-0.5">{order.pickup_point_id ? "Pickup point" : "Delivering to"}</p>
                    <p className="font-medium">
                        {order.shipping_address}, {order.shipping_city}, {order.shipping_region}
                    </p>
                    {order.pickup_point_id && (
                        <p className="text-xs text-ash mt-0.5">Collect in person once it arrives - you'll be notified.</p>
                    )}
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

            {showTracking && (
                <div className="mb-8">
                    <p className="text-xs uppercase tracking-widest text-ash mb-2">Live tracking</p>
                    <PaymentConfirmedPill />
                    {delivery?.agent_id && (delivery.agent_vehicle_type || delivery.agent_vehicle_plate_number) && (
                        <p className="text-sm text-ash mb-2">
                            {delivery.agent_first_name} is on a {VEHICLE_LABELS[delivery.agent_vehicle_type] || delivery.agent_vehicle_type}
                            {delivery.agent_vehicle_plate_number && ` · Plate ${delivery.agent_vehicle_plate_number}`}
                        </p>
                    )}
                    <TrackingWidget
                        orderId={id}
                        delivery={delivery}
                        searching={orderState === ORDER_STATE.SEARCHING}
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
                {!order.parent_order_id && order.status !== "cancelled" && order.payment_method === "mobile_money" && order.payment_status === "unpaid" && (
                    <Button onClick={handleRetryPayment} disabled={busy}>
                        {busy ? "Processing…" : "Pay with Mobile Money"}
                    </Button>
                )}
                {!order.parent_order_id && order.status !== "cancelled" && order.payment_method === "snippe" && order.payment_status === "unpaid" && (
                    <Button onClick={handleRetrySnippe} disabled={busy}>
                        {busy ? "Redirecting…" : "Pay with Card (Snippe)"}
                    </Button>
                )}
                {!order.parent_order_id && order.status !== "cancelled" && order.payment_method === "malipopay_card" && order.payment_status === "unpaid" && (
                    <Button onClick={handleRetryMalipopayCard} disabled={busy}>
                        {busy ? "Redirecting…" : "Pay with Card (MalipoPay)"}
                    </Button>
                )}
                {!order.parent_order_id && order.status !== "cancelled" && order.payment_method === "paypal" && order.payment_status === "unpaid" && (
                    <Button onClick={handleRetryPaypal} disabled={busy}>
                        {busy ? "Redirecting…" : "Pay with PayPal"}
                    </Button>
                )}
                {!order.parent_order_id && CANCELLABLE.includes(order.status) && (
                    <button onClick={handleCancel} disabled={busy}
                        className="border border-coral text-coral px-5 py-2.5 rounded-md text-sm font-medium hover:bg-coral/5 transition-colors focus-ring disabled:opacity-60">
                        Cancel order
                    </button>
                )}
                {!order.is_parent && order.status === "delivered" && !order.buyer_confirmed_at && (
                    <button onClick={handleConfirmReceipt} disabled={busy}
                        className="bg-teal text-white px-5 py-2.5 rounded-md text-sm font-medium hover:opacity-90 transition-opacity focus-ring disabled:opacity-60">
                        {busy ? "Confirming…" : order.payment_method === "cash_on_delivery" ? "Confirm Receipt & Cash Payment" : "Confirm Receipt"}
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
                {!order.is_parent && order.status === "delivered" && (
                    <Link to={`/returns/new?order_id=${id}`}
                        className="border border-line px-5 py-2.5 rounded-md text-sm font-medium hover:border-abyss transition-colors focus-ring">
                        ↩️ Request a return
                    </Link>
                )}
            </div>
        </div>
    );
}
