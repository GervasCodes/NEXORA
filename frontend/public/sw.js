// NEXORA service worker: push notifications (delivery offers) + basic
// offline support. Lives in /public so Vite serves it verbatim at the
// site root — required for a service worker's scope to cover the whole app.

const CACHE_VERSION = "nexora-v1";
const APP_SHELL_CACHE = `${CACHE_VERSION}-shell`;
const API_CACHE = `${CACHE_VERSION}-api`;
const OFFLINE_URL = "/offline.html";

// Only public, non-personal GET endpoints are ever cached. Cart, orders,
// account, messages, seller/admin data, and anything else that requires
// auth is deliberately never touched here - caching a signed-in
// response would risk showing one person's data to whoever opens the
// app next on a shared device, or just serving stale personal data.
// This is what "offline browsing" means in practice: the catalog you've
// already looked at stays browsable, not "the whole app works offline".
const CACHEABLE_API_PATHS = [/^\/api\/v1\/products(\/|\?|$)/, /^\/api\/v1\/categories(\/|\?|$)/];

self.addEventListener("install", (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(APP_SHELL_CACHE).then((cache) => cache.addAll([OFFLINE_URL, "/", "/manifest.json"]))
    );
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(
                keys
                    .filter((key) => key.startsWith("nexora-") && key !== APP_SHELL_CACHE && key !== API_CACHE)
                    .map((key) => caches.delete(key))
            )
        ).then(() => self.clients.claim())
    );
});

const isCacheableApiRequest = (url) =>
    url.pathname.startsWith("/api/") && CACHEABLE_API_PATHS.some((re) => re.test(url.pathname));

self.addEventListener("fetch", (event) => {
    const { request } = event;

    // Never intercept anything but GET - POST/PUT/DELETE (checkout, cart
    // changes, messages, etc.) always go straight to the network.
    if (request.method !== "GET") return;

    const url = new URL(request.url);

    // Full-page navigations: network-first (so you always get the latest
    // build when online), falling back to a cached copy of that exact
    // page, and finally the offline fallback page if neither is available.
    if (request.mode === "navigate") {
        event.respondWith(
            fetch(request)
                .then((response) => {
                    const clone = response.clone();
                    caches.open(APP_SHELL_CACHE).then((cache) => cache.put(request, clone));
                    return response;
                })
                .catch(() =>
                    caches.match(request).then((cached) => cached || caches.match(OFFLINE_URL))
                )
        );
        return;
    }

    // Cross-origin (Cloudinary images, fonts, etc.) - let the browser
    // handle these normally rather than trying to cache/manage them here.
    if (url.origin !== self.location.origin && !isCacheableApiRequest(url)) return;

    if (isCacheableApiRequest(url)) {
        // Network-first, cached fallback when offline - so a product
        // listing you've already loaded stays browsable without a
        // connection, but never goes stale while you're actually online.
        event.respondWith(
            fetch(request)
                .then((response) => {
                    const clone = response.clone();
                    caches.open(API_CACHE).then((cache) => cache.put(request, clone));
                    return response;
                })
                .catch(() => caches.match(request))
        );
        return;
    }

    // Same-origin static assets (hashed JS/CSS bundles, icons): cache-first,
    // since a hashed filename never changes content, so there's no
    // staleness risk - and it's the fastest possible repeat load.
    if (url.origin === self.location.origin) {
        event.respondWith(
            caches.match(request).then((cached) => {
                if (cached) return cached;
                return fetch(request).then((response) => {
                    const clone = response.clone();
                    caches.open(APP_SHELL_CACHE).then((cache) => cache.put(request, clone));
                    return response;
                });
            })
        );
    }
});

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
