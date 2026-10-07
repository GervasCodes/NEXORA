// Offline queue for delivery status updates. A rider in a dead zone taps
// "Picked up" / "In transit" / "Delivered (code)" and the update is kept on
// the device, then retried when the connection returns. Photo proof can't
// be stored here, so those updates are never queued.

const KEY = "nexora_delivery_status_queue";

const read = () => {
    try {
        const parsed = JSON.parse(localStorage.getItem(KEY) || "[]");
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
};

const write = (items) => {
    try {
        localStorage.setItem(KEY, JSON.stringify(items));
    } catch {
        /* storage unavailable - queue is best-effort */
    }
};

export const getQueue = read;

export const enqueueStatus = ({ orderId, status, handoverCode, lat, lng }) => {
    // Latest tap for an order wins, so a retry never replays a stale step.
    const items = read().filter((i) => String(i.orderId) !== String(orderId));
    items.push({ orderId, status, handoverCode: handoverCode || null, lat: lat ?? null, lng: lng ?? null, queuedAt: Date.now() });
    write(items);
};

export const removeFromQueue = (orderId) => {
    write(read().filter((i) => String(i.orderId) !== String(orderId)));
};

// Network-level failure (no HTTP response) - the only kind worth queueing.
export const isNetworkError = (err) => !err?.response;
