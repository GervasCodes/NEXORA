exports.ORDER_STATUSES = [
    "pending",
    "processing",
    "shipped",
    "delivered",
    "cancelled"
];

exports.PAYMENT_METHODS = ["mobile_money", "cash_on_delivery", "snippe", "paypal"];

// Statuses a buyer is allowed to cancel from
exports.CANCELLABLE_STATUSES = ["pending", "processing"];

// Seller-driven status transitions: current status -> allowed next statuses
exports.SELLER_STATUS_TRANSITIONS = {
    pending: ["processing", "cancelled"],
    processing: ["shipped", "cancelled"],
    shipped: ["delivered"]
};

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
    tuktuk: 24,
    car: 28,
    van: 26,
    truck: 22
};
exports.DEFAULT_AVERAGE_SPEED_KMH = 25; // unknown/missing vehicle_type
