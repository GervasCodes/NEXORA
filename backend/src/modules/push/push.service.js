const pushRepository = require("./push.repository");
const { webpush, isConfigured } = require("../../config/webPush");

exports.getPublicKey = () => process.env.VAPID_PUBLIC_KEY || null;

exports.subscribe = async (userId, subscription) => {
    if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
        throw new Error("Invalid push subscription");
    }
    await pushRepository.upsert(userId, subscription);
};

exports.unsubscribe = async (userId, endpoint) => {
    if (!endpoint) throw new Error("Missing endpoint");
    await pushRepository.remove(userId, endpoint);
};

// Best-effort fan-out to every device this user has subscribed from.
// Never throws — a failed/misconfigured push should never break the
// delivery-matching flow that triggered it.
exports.sendToUser = async (userId, payload) => {
    if (!isConfigured) return;

    const subscriptions = await pushRepository.findByUser(userId);
    if (subscriptions.length === 0) return;

    const body = JSON.stringify(payload);

    await Promise.all(
        subscriptions.map(async (sub) => {
            try {
                await webpush.sendNotification(
                    {
                        endpoint: sub.endpoint,
                        keys: { p256dh: sub.p256dh, auth: sub.auth }
                    },
                    body
                );
            } catch (error) {
                // 404/410 = the browser has invalidated this subscription
                if (error.statusCode === 404 || error.statusCode === 410) {
                    await pushRepository.removeById(sub.id).catch(() => {});
                } else {
                    console.error("Push send failed:", error.message);
                }
            }
        })
    );
};
