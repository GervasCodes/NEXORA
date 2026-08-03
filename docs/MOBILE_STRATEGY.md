# Mobile Experience Strategy (Phase 3c)

Part of the Revenue & Product Enhancements roadmap ("improve mobile
experience through a native app strategy or enhanced PWA capabilities").

## What already existed before this phase

The PWA groundwork here is more mature than a typical "add a manifest"
pass - by the time this phase started, NEXORA already had:
- `manifest.json` with proper icons (including maskable), shortcuts, and
  standalone display mode.
- `sw.js` with a network-first app-shell strategy, an offline fallback
  page, and push-notification handling (delivery offers, order/message
  notifications) with click-to-navigate.
- `InstallPrompt.jsx` capturing `beforeinstallprompt` (Chrome/Android)
  and Apple's meta tags for the manual "Add to Home Screen" path on iOS
  Safari, which never fires that event.
- `UpdateAvailableBanner.jsx` for prompting a refresh when a new build is
  live.

## What this phase added

Extended the service worker's offline-cacheable public catalog paths -
previously only `/products` and `/categories` - to also cover
`/service-categories`, `/services`, `/store-types`, and `/stores`, so
offline browsing has the same coverage on the services side of the
marketplace it always had on products. Recommendations
(`/recommendations/*`, added in Phase 3b) were deliberately **not**
added to the cacheable list even though they're public: they personalize
per signed-in buyer at the same URL, and caching one person's
recommendations risks serving them to whoever opens the app next on a
shared device - the same reasoning the service worker's own comments
already apply to cart/orders/auth.

## Native app strategy (not built this phase - a recommendation)

A true native app (App Store/Play Store) is a materially larger
undertaking than anything else in this roadmap phase, so this phase
documents a strategy rather than building one. Given how the backend is
already structured - a stateless REST API under `/api/v1`, JWT auth,
Cloudinary-hosted media, web-push already wired for delivery/order/chat
notifications - the lowest-risk path is a **wrapper approach**, not a
ground-up rewrite:

- **Capacitor** (Ionic's native wrapper) over a from-scratch React
  Native app: it reuses the existing React/Vite frontend almost as-is,
  swaps push notifications from web-push to native FCM/APNs (the
  backend's `push` module would need a second provider alongside the
  existing web-push one), and gets real app-store presence, native
  camera/file-picker access, and background push delivery reliability
  that PWA push can't fully match on iOS.
- A full React Native rewrite would give more native-feeling UI but
  duplicates the entire frontend codebase and its ongoing maintenance -
  not justified unless PWA/Capacitor limitations become a real product
  blocker (e.g. iOS PWA push reliability, or platform APIs Capacitor
  can't bridge).
- Either path needs no backend changes beyond the push-provider swap -
  every REST endpoint, auth flow, and webhook this roadmap's other
  phases touch (subscriptions, payments, bookings) works unchanged from
  a native shell.

**Recommendation:** treat the current PWA (now with broader offline
catalog coverage) as the primary mobile experience, and revisit
Capacitor specifically if app-store distribution or push reliability
becomes a concrete business need - not preemptively.
