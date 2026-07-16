// NEXORA service worker: push notifications (delivery offers) + basic
// offline support. Lives in /public so Vite serves it verbatim at the
// site root — required for a service worker's scope to cover the whole app.

// Bumped on every SW logic change so stale, possibly-buggy service
// workers still installed on returning visitors' devices are replaced
// rather than continuing to run their old (broken) fetch handler.
const CACHE_VERSION = "nexora-v2";
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

// Belt-and-suspenders: anything checkout/payment/order/auth/webhook
// related is NEVER handled by the service worker, regardless of method,
// origin, or request mode. Money-moving requests must always hit the
// live network directly - no cache, no fallback, no interception of any
// kind. This is checked first, before any other branching below.
const NETWORK_ONLY_PATTERNS = [
    /^\/checkout(\/|$)/,
    /\/api\/v1\/payment(s)?(\/|\?|$)/,
    /\/api\/v1\/orders?(\/|\?|$)/,
    /\/api\/v1\/webhooks?(\/|\?|$)/,
    /\/api\/v1\/auth(\/|\?|$)/,
    /\/api\/v1\/cart(\/|\?|$)/
];
const isNetworkOnly = (url) => NETWORK_ONLY_PATTERNS.some((re) => re.test(url.pathname));

self.addEventListener("install", (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches
            .open(APP_SHELL_CACHE)
            .then((cache) => cache.addAll([OFFLINE_URL, "/", "/manifest.json"]))
            .catch((err) => {
                // A slow/flaky network during install shouldn't leave the
                // whole activation in a broken state - log and move on;
                // the app shell just won't have an offline copy yet.
                console.warn("SW install: pre-cache failed", err);
            })
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
    const url = new URL(request.url);

    // Checkout, payment, orders, auth, cart, webhooks: always go straight
    // to the network, untouched. This check runs before anything else -
    // before the method check, before origin checks - so there is no
    // code path in this file that can cache, delay, or fall back for a
    // payment-related request. respondWith() isn't even called here,
    // which means the browser handles the request exactly as if this
    // service worker didn't exist for it.
    if (isNetworkOnly(url)) return;

    // Never intercept anything but GET - POST/PUT/DELETE (cart changes,
    // messages, etc.) always go straight to the network too.
    if (request.method !== "GET") return;

    // Full-page navigations: network-first (so you always get the latest
    // build when online), falling back to a cached copy of that exact
    // page, and finally the offline fallback page if neither is
    // available. Every branch of this chain always resolves to a real
    // Response - never to `undefined` and never to a rejected promise -
    // because an unresolved respondWith() is what produces the browser's
    // hard "network error" for the whole navigation.
    if (request.mode === "navigate") {
        event.respondWith(
            fetch(request)
                .then((response) => {
                    const clone = response.clone();
                    caches
                        .open(APP_SHELL_CACHE)
                        .then((cache) => cache.put(request, clone))
                        .catch(() => {});
                    return response;
                })
                .catch(() =>
                    caches
                        .match(request)
                        .then((cached) => cached || caches.match(OFFLINE_URL))
                        .then((fallback) => fallback || Response.error())
                        .catch(() => Response.error())
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
                    caches
                        .open(API_CACHE)
                        .then((cache) => cache.put(request, clone))
                        .catch(() => {});
                    return response;
                })
                .catch(() =>
                    caches
                        .match(request)
                        .then((cached) => cached || Response.error())
                        .catch(() => Response.error())
                )
        );
        return;
    }

    // Same-origin static assets (hashed JS/CSS bundles, icons): cache-first,
    // since a hashed filename never changes content, so there's no
    // staleness risk - and it's the fastest possible repeat load. The
    // network fetch here is wrapped in its own catch (this is what used
    // to be the unhandled rejection at the old line 95) so a dropped
    // connection or a Render cold-start timeout on one asset can never
    // surface as an uncaught "Failed to fetch" or block anything else.
    if (url.origin === self.location.origin) {
        event.respondWith(
            caches.match(request).then((cached) => {
                if (cached) return cached;
                return fetch(request)
                    .then((response) => {
                        // Only cache successful, cacheable responses -
                        // an opaque/error response cached here would be
                        // served back forever as if it were valid.
                        if (response && response.ok) {
                            const clone = response.clone();
                            caches
                                .open(APP_SHELL_CACHE)
                                .then((cache) => cache.put(request, clone))
                                .catch(() => {});
                        }
                        return response;
                    })
                    .catch(() => Response.error());
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
