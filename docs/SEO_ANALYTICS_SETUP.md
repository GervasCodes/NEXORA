# NEXORA – Search Console + Google Analytics: what to set (step by step)

Site: https://nexoramarketplace.online · API: https://api.nexoramarketplace.online

## A. Do this first (Render dashboard) – the sitemap fix

Render does NOT read `frontend/public/_redirects`, so `/sitemap.xml` was being answered by the app (HTML) and Search Console could not read it.

1. Render → **nexora-web** (static site) → **Redirects/Rewrites**.
2. Add, in this order, ABOVE the `/*` rule:
   - Type **Rewrite**, Source `/sitemap.xml`, Destination `https://api.nexoramarketplace.online/sitemap.xml`
   - Type **Rewrite**, Source `/sitemap-*.xml`, Destination `https://api.nexoramarketplace.online/sitemap-*.xml`
3. Keep `/*` → `/index.html` (Rewrite) last.
4. Deploy the backend too (new `X-Robots-Tag` + `robots.txt` for the API host), then deploy the frontend.
5. Check in a browser: `https://nexoramarketplace.online/sitemap.xml` must show XML (`<urlset ...>`), not the app.

## B. Google Search Console

1. **Sitemaps** → remove any old/failed entry → add `sitemap.xml` → status must be **Success**.
2. **Pages** report – what each reason means for NEXORA:

| Reason | Action |
|---|---|
| Alternate page with proper canonical tag (`?lang=sw`, filters) | Normal. Nothing to do. |
| Blocked by robots.txt (`/cart`, `/checkout`, `/orders`, `/seller`, `/admin`, `/business/…`) | Normal – private pages. |
| Page with redirect (`/orders`, `/account` when signed out) | Normal. |
| Excluded by "noindex" tag (`/login`, `/register`, `/search`, 404 page) | Normal – intended. |
| Not found (404) | Open a few examples. If it is a deleted product, fine. If it is a live link, fix the link. |
| Crawled – currently not indexed | Usually thin/duplicate pages. Add a longer product description + 2+ photos, real reviews, and a 2–3 sentence intro on department pages. |
| Discovered – currently not indexed | Normal for new sites; improves with links and more content. Do not mass-request indexing. |
| Duplicate, Google chose different canonical | Check that `?lang=sw` pages show Kiswahili text. |

3. **URL Inspection** → test `/`, `/products`, one product, one store → "Test live URL" → View tested page → screenshot must show the real page → "Request indexing" (a few per day).
4. **Settings → Users and permissions**: add a second owner.
5. **Links → Linked with GA4** (see below).

## C. Google Analytics 4

Already in code: page views (public pages only), `purchase`. Added now: `view_item`, `add_to_cart`, `begin_checkout`, `sign_up`.

1. Render → nexora-web → Environment: `VITE_GA_MEASUREMENT_ID=G-XXXXXXXXXX` → redeploy.
2. GA4 → Admin → Data streams → Web → Enhanced measurement: **turn OFF "Page changes based on browser history events"** (the app already sends its own `page_view`; leaving it on counts every page twice).
3. Admin → Data collection and modification → **Data retention**: 14 months. Google signals: off.
4. Admin → Events → mark as **key events**: `purchase`, `begin_checkout`, `add_to_cart`, `sign_up`.
5. Admin → Custom definitions → Create custom dimension: Scope **Event**, Event parameter `language` (English/Kiswahili split) and `role` (buyer/seller).
6. Admin → Product links → **Search Console links** → link the verified property.
7. Test: accept the cookie banner on your phone, open Reports → Realtime (or Admin → DebugView).
8. Reading the numbers: GA only counts visitors who press **Accept**, so GA < Search Console clicks is expected.

## D. Other fixes in this update

- `robots.txt`: added `/business/` and `/order-confirmed` (private pages).
- API host: `X-Robots-Tag: noindex` on every API response (sitemaps excepted) and `Disallow: /` robots.txt on the API host, so API JSON never appears in Google.
- Homepage footer: solid colour and smaller gap (it looked grey and left a large empty area); product tiles now keep equal height; the repeated "Picked for you" line under every product is hidden unless it is a real reason.
