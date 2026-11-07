// Pure helpers for the order-confirmation page (/order-confirmed/:id).

const ONLINE_METHODS_PAID_LATER = new Set(["mobile_money", "snippe", "malipopay_card", "paypal", "azampay", "selcom", "pawapay"]);
const PURCHASE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

// "confirmed"        - paid (or deposit paid), or cash on delivery (nothing to wait for)
// "awaiting_payment" - placed, but an online payment has not landed yet
// "cancelled"        - nothing to celebrate; the page sends the buyer to the order
export const getConfirmationState = (order) => {
    if (!order) return "loading";
    if (order.status === "cancelled") return "cancelled";
    if (order.payment_status === "paid" || order.payment_status === "deposit_paid") return "confirmed";
    if (order.payment_method === "cash_on_delivery") return "confirmed";
    if (order.payment_method === "wallet") return "confirmed"; // wallet is charged synchronously
    return "awaiting_payment";
};

// True while it is worth polling for the payment to land.
export const isAwaitingOnlinePayment = (order) =>
    getConfirmationState(order) === "awaiting_payment"
    && (ONLINE_METHODS_PAID_LATER.has(order.payment_method) || order.payment_status === "unpaid");

// What to report to analytics, or null when this page view must not report a
// purchase (not confirmed yet, no amount, or an old order opened later).
export const getPurchaseEvent = (order, now = Date.now()) => {
    if (getConfirmationState(order) !== "confirmed") return null;
    const created = Date.parse(order.created_at);
    if (Number.isFinite(created) && now - created > PURCHASE_MAX_AGE_MS) return null;
    const value = order.payment_status === "deposit_paid" ? Number(order.deposit_amount) : Number(order.total_amount);
    if (!Number.isFinite(value) || value <= 0) return null;
    return { orderId: order.id, value, currency: "TZS", paymentType: order.payment_method };
};

// Items to list in the summary. A multi-vendor (parent) order has none of its
// own: its vendor orders' items are listed together.
export const getSummaryItems = (order) => {
    if (!order) return [];
    if (order.is_parent) return (order.children || []).flatMap((child) => child.items || []);
    return order.items || [];
};
