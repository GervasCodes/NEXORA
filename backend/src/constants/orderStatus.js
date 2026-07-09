exports.ORDER_STATUSES = [
    "pending",
    "processing",
    "shipped",
    "delivered",
    "cancelled"
];

exports.PAYMENT_METHODS = ["mobile_money", "cash_on_delivery"];

// Statuses a buyer is allowed to cancel from
exports.CANCELLABLE_STATUSES = ["pending", "processing"];

// Seller-driven status transitions: current status -> allowed next statuses
exports.SELLER_STATUS_TRANSITIONS = {
    pending: ["processing", "cancelled"],
    processing: ["shipped", "cancelled"],
    shipped: ["delivered"]
};

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
