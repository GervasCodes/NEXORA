exports.ORDER_STATUSES = [
    "pending",
    "processing",
    "shipped",
    "delivered",
    "cancelled"
];

exports.PAYMENT_METHODS = ["mobile_money", "cash_on_delivery", "snippe", "malipopay_card", "paypal", "wallet"];

// Pre-order / made-to-order (Phase 8). A pre-order charges a deposit at
// checkout and the remaining balance later, once the seller has the item
// ready - see order.service.js#checkout and #requestPreorderBalance.
exports.ORDER_TYPES = ["standard", "pre_order"];
exports.PAYMENT_STATUSES = ["unpaid", "deposit_paid", "paid"];

// Fallbacks used when a seller has accepts_preorders on but hasn't set
// their own deposit percent / lead time (shouldn't normally happen - the
// seller-settings form has its own defaults - but keeps checkout safe
// against a directly-edited/legacy row).
exports.DEFAULT_PREORDER_DEPOSIT_PERCENT = 30;
exports.DEFAULT_PREORDER_LEAD_TIME_DAYS = 7;

// Statuses a buyer is allowed to cancel from
exports.CANCELLABLE_STATUSES = ["pending", "processing"];

// Seller-driven status transitions: current status -> allowed next statuses
exports.SELLER_STATUS_TRANSITIONS = {
    pending: ["processing", "cancelled"],
    processing: ["shipped", "cancelled"],
    shipped: ["delivered"]
};

// Checkout buyer-protection insurance add-on  - see
// order.service.js#calculateBuyerProtectionFee. 1.5% of cart subtotal,
// floored/capped so it's meaningful on a cheap order and not excessive
// on a very large one.
exports.BUYER_PROTECTION_FEE_RATE = 0.015;
exports.BUYER_PROTECTION_FEE_MIN = 1000; // TZS
exports.BUYER_PROTECTION_FEE_MAX = 20000; // TZS

// Vehicle types a delivery agent can register with (migration 032).
exports.VEHICLE_TYPES = ["bicycle", "motorcycle", "tuktuk", "car", "van", "truck"];

exports.DELIVERY_STATUSES = [
    "assigned",
    "picked_up",
    "in_transit",
    "delivered",
    "failed"
];

// Delivery-agent-driven status transitions: current status -> allowed next statuses
exports.DELIVERY_STATUS_TRANSITIONS = {
    assigned: ["picked_up", "failed"],
    picked_up: ["in_transit", "failed"],
    in_transit: ["delivered", "failed"]
};

// Nearest-agent matching (Bolt-style offer flow)
exports.OFFER_RADIUS_KM = 15; // ignore agents further than this from the order
exports.OFFER_TIMEOUT_MS = 30 * 1000; // time an agent has to accept before we move to the next one

// Average road speed (km/h) per vehicle type, used by utils/eta.js to turn
// a straight-line distance into a rough ETA for the live tracking widget
// and full tracking page. These are city-traffic averages, not top
// speeds - deliberately conservative so ETAs skew "a bit early" rather
// than "you're late" if traffic is worse than usual. Phase 5 (road
// routing) replaces this straight-line estimate with a real OSRM travel
// time and these constants become only the last-resort fallback for when
// OSRM is unreachable.
exports.VEHICLE_AVERAGE_SPEED_KMH = {
    bicycle: 14,
    motorcycle: 32,
    Bajaji: 24,
    car: 28,
    van: 26,
    truck: 22
};
exports.DEFAULT_AVERAGE_SPEED_KMH = 25; // unknown/missing vehicle_type
