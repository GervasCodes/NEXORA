# NEXORA UI Modernization — Phase 7: Product swipe feed

## Read this first: the list endpoint doesn't return videos
The phase brief says video fields are "already supported end-to-end" and sufficient without backend changes. That's true for the product **detail** endpoint (`GET /products/:slug` returns `videos`), but **`GET /products` (the list ProductGrid uses) does not include videos at all** — `listProducts` returns only `image_url`. I did not touch the backend (per the phase rules), so:

- **The feed still plays videos.** It looks a product's video up lazily via `GET /products/:slug` for the on-screen slide and the next one only (each product requested at most once, results cached in the component). Cost: up to 2 extra detail requests as the shopper starts swiping, ~4 light queries each.
- **The video badge on `ProductCard` is dormant.** It renders when `product.has_video` or `product.videos.length` is present, but the list response has neither, so it won't appear in grid/list views yet. `has_video` is a field name I chose — it doesn't exist today.
- **Recommended follow-up (backend, not done):** add `has_video` (and ideally the first `video_url`) to the list query. That would light up the badge and let the feed skip the lookups (`pickFeedMedia` already prefers `product.videos` if present). Say the word and I'll scope it as a separate change.

## Files
Added:
- `frontend/src/components/ProductSwipeFeed.jsx`
- `frontend/src/utils/feedMedia.js`
- `frontend/tests/components/ProductSwipeFeed.test.jsx`
- `frontend/tests/utils/feedMedia.test.js`

Changed:
- `frontend/src/components/ProductGrid.jsx`
- `frontend/src/components/ProductCard.jsx` (**also contains the Phase 6b Compare removal** — this file supersedes the 6b copy)
- `frontend/src/context/LanguageContext.jsx` (6 new keys, English + Swahili; outside the listed scope but that's where all UI strings live)

## What changed

### `ProductSwipeFeed.jsx` (new)
- Full-screen overlay (`role="dialog"`, `md:hidden`), one product per screen, CSS vertical scroll-snap. Locks page scroll while open, closes on Escape / the X button, moves focus in and restores it on close.
- Each slide: video when the product has one (autoplay, muted, looping, `playsInline`, only on the active slide so off-screen videos aren't downloaded/playing), otherwise the image exactly as the product's `image_url`. Store, name, price (with discount), and a "View product" link. Mute/unmute button on video slides.
- Respects **Data Saver** and **prefers-reduced-motion**: in either case video doesn't autoplay and shows native controls with `preload="none"` and the image as poster.
- **Pagination:** the feed owns no data. `ProductGrid` passes its own `products`, `page < totalPages`, `loadingMore` and `loadMore`, so the feed and grid/list are the same list from the same cursor — no separate fetch path to duplicate/skip items. The feed calls `onLoadMore` once when the shopper is within `LOAD_AHEAD` (3) slides of the end, at most once per loaded length (guards against repeated observer callbacks firing duplicate requests). If a request fails it isn't auto-retried; the last slide shows a "Load more" button.

### `ProductGrid.jsx`
- Third button in the view toggle (`md:hidden`, disabled while loading) that opens the feed. It's a launcher, **not a persisted layout**: `readStoredView` / `changeLayout` / the stored grid-or-list preference and the `IntersectionObserver` sentinel are untouched, so desktop and existing mobile users see no change (the only new UI is one extra icon on mobile).
- Feed auto-closes if the viewport grows past `md`.
- **Filters:** `ProductFilters` is rendered by each page, not by `ProductGrid`, so the feed's Filters button closes the feed and scrolls the filter row (the element right above the view toggle) into view rather than duplicating filters in a sheet. A true in-feed filter sheet would need a slot prop and changes to every page that renders `ProductFilters` — deferred.

### `ProductCard.jsx`
- Small play-icon "Has video" badge (bottom-left of the image) — see the dormant-badge note above.

## Tests (added, per the phase rules)
- `ProductSwipeFeed.test.jsx`: video-vs-image rendering (list-provided video, image fallback, and a video discovered through the detail lookup); pagination trigger (fires once near the end and not again on the same length, fires again after more products load, never fires when `hasMore` is false).
- `feedMedia.test.js`: media-type precedence (product video > fetched video > image > none).
- **Not run:** no `node_modules`/network in the sandbox, so `npm test` / `npm run build` were not executed (I did a bracket-balance check only). Please run both; the feed tests use a recording `IntersectionObserver` swapped in per test, since the global stub never fires.

## Not done / deferred
- Backend `has_video` (see top). In-feed filter sheet. Swipe-feed preference is intentionally not persisted.
- Nothing visual was verified in a browser (snap behavior, safe-area padding, autoplay policies on iOS/Android) — worth a pass on a real phone, particularly autoplay with sound toggled.
