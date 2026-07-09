// NEXORA delivery push service worker.
// Lives in /public so Vite serves it verbatim at the site root — required
// for a service worker's scope to cover the whole app.

self.addEventListener("push", (event) => {
    let data = {};
    try {
        data = event.data ? event.data.json() : {};
    } catch {
        data = { title: "NEXORA", body: event.data?.text() || "New notification" };
    }

    const title = data.title || "NEXORA";
    const options = {
        body: data.body || "",
        icon: "/apple-touch-icon.png",
        badge: "/favicon-32.png",
        data: { orderId: data.orderId, offerId: data.offerId },
        tag: data.offerId ? `offer-${data.offerId}` : undefined
    };

    event.waitUntil(self.registration.showNotification(title, options));
});

// Clicking the OS notification focuses an existing NEXORA tab if one's
// open, otherwise opens the delivery-available page.
self.addEventListener("notificationclick", (event) => {
    event.notification.close();

    event.waitUntil(
        clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
            for (const client of clientList) {
                if (client.url.includes(self.location.origin) && "focus" in client) {
                    return client.focus();
                }
            }
            return clients.openWindow("/delivery");
        })
    );
});
