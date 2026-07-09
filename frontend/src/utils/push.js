import api from "../api/client";

// PushManager needs the VAPID key as a Uint8Array, but the server hands it
// back as a URL-safe base64 string — this is the standard conversion.
const urlBase64ToUint8Array = (base64String) => {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    const rawData = atob(base64);
    return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
};

export const pushSupported = () =>
    "serviceWorker" in navigator && "PushManager" in window;

// Idempotent — safe to call every time an agent goes on shift.
export const enablePushNotifications = async () => {
    if (!pushSupported()) return { success: false, message: "Push isn't supported on this device/browser." };

    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
        return { success: false, message: "Notification permission was not granted." };
    }

    try {
        const registration = await navigator.serviceWorker.register("/sw.js");
        await navigator.serviceWorker.ready;

        const existing = await registration.pushManager.getSubscription();
        if (existing) {
            await api.post("/push/subscribe", { subscription: existing.toJSON() });
            return { success: true };
        }

        const { data } = await api.get("/push/vapid-public-key");
        const subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(data.data.publicKey)
        });

        await api.post("/push/subscribe", { subscription: subscription.toJSON() });
        return { success: true };

    } catch (error) {
        // Most common case: server hasn't set VAPID_PUBLIC_KEY yet (503).
        return { success: false, message: "Push notifications aren't available right now." };
    }
};

export const disablePushNotifications = async () => {
    if (!pushSupported()) return;

    const registration = await navigator.serviceWorker.getRegistration();
    const subscription = await registration?.pushManager.getSubscription();
    if (!subscription) return;

    await api.post("/push/unsubscribe", { endpoint: subscription.endpoint }).catch(() => {});
    await subscription.unsubscribe();
};
