# NEXORA SEO, Analytics and Growth Playbook

Site: https://nexoramarketplace.online (Search Console ownership already verified via the HTML file).

## 1. Search Console: do this now (about 30 minutes)

1. **Confirm the sitemap works.** Open `/sitemap.xml` in a browser. It must show XML, not the app. If it shows the app, fix the Render rewrite (see DEPLOYMENT.md).
2. **Sitemaps → submit `sitemap.xml`.** Status must say "Success". Note "Discovered URLs".
3. **Settings → add a second verification method** (optional backup): set `VITE_GSC_VERIFICATION` and rebuild, or add the DNS TXT record at your domain provider.
4. **URL Inspection** for `/`, `/products`, one product, one service, one store, `/?lang=sw`. For each: "Test live URL" → "View tested page" → check the screenshot and HTML contain the real heading/price/description. Then "Request indexing" (a handful per day is the limit).
5. **Pages (indexing) report**, weekly: read the reasons under "Not indexed". Healthy: "Page with redirect", "Alternate page with proper canonical tag" (that is the `?lang=sw` / filter URLs). Investigate: "Crawled – currently not indexed" and "Discovered – currently not indexed" (thin or duplicate pages, slow server), "Soft 404", "Server error (5xx)".
6. **Enhancements → Products, Breadcrumbs, Merchant listings**: fix any errors; warnings about shipping rates/return window are expected (those vary per order).
7. **Experience → Core Web Vitals** (mobile first). Fix "Poor" groups using PageSpeed Insights.
8. **International Targeting is retired**; hreflang on the pages is what Google reads. After a few weeks check the Pages report for "Alternate page with proper canonical tag" on `?lang=sw` URLs.
9. **Settings → Crawl stats** monthly: watch for spikes in 5xx or slow response time.
10. **Links** report: see who links to you; note the best sources.
11. **Performance** (weekly): Queries tab, filter Country = Tanzania. Sort by impressions. Rewrite titles/descriptions for queries with many impressions but under 2% CTR. Compare Pages for the same.
12. **Users and permissions**: add a second owner so access isn't lost.

## 2. Google Analytics 4: setup

1. analytics.google.com → Admin → Create account/property "NEXORA", time zone Tanzania, currency TZS.
2. Data stream → Web → `https://nexoramarketplace.online` → copy the **Measurement ID** (`G-…`).
3. Set `VITE_GA_MEASUREMENT_ID=G-…` on the Render static site, rebuild. Update the CSP (DEPLOYMENT.md). The cookie banner now shows Accept/Decline; GA loads only after Accept, so expect lower counts than total traffic.
4. Admin → Data retention → set to 14 months. Admin → Data collection → leave Google signals off.
5. **Link Search Console**: Admin → Product links → Search Console links → choose the verified property. Gives the Reports → Search Console section.
6. Mark conversions (Admin → Events → "Mark as key event") once events exist: `sign_up`, `add_to_cart`, `begin_checkout`, `purchase`. The code currently sends page views; add `trackEvent(...)` calls (utils/analytics.js) at those moments.
7. Check: Admin → DebugView (or Reports → Realtime) while accepting the banner on your own phone.
8. Reports to read weekly: Acquisition → Traffic acquisition (channels), Engagement → Pages and screens, Tech → Tech details (device, browser), Demographics → Country/City.

## 3. Reaching more people

**Local search**
- Create a Google Business Profile if there is a real office/shop (Dar es Salaam address is in company info). Add photos, hours, link to the site.
- Get listed in Tanzanian directories and business listings; ask partner sellers to link their own pages to their NEXORA store page.
- Register on Bing Webmaster Tools (import from Search Console) and Yandex if desired.

**Content (use /guides)** – write in English and Kiswahili, one clear question per article, link to relevant products:
- "How to buy safely online in Tanzania"
- "Paying with M-Pesa, Tigo Pesa and Airtel Money: step by step"
- "How NEXORA delivery tracking works"
- "How to start selling online in Tanzania" (targets sellers)
- Seasonal: back-to-school, Eid/Christmas gifts, Black Friday
- "Best [category] in Tanzania" lists using real catalog items
Give each department/category page a short intro paragraph (2–3 sentences) naming the category and Tanzania.

**Social and messaging (where Tanzanians already are)**
- WhatsApp: a Business account/Channel for new arrivals; every product page has a share button (ShareButtons) – promote it. Link previews already use the product photo.
- Instagram/TikTok/YouTube (already in the footer): short videos of products, unboxings, seller stories; always link the exact product URL.
- Ask sellers to post their NEXORA store link in their own bio and status updates; offer a small incentive via the affiliate programme that already exists.

**Marketplace growth loops**
- Seller onboarding drives supply: more products means more indexed pages. Run seller sign-up drives in markets/campuses.
- Group buys and live selling are shareable by nature: promote each event on WhatsApp/TikTok.
- Referral/affiliate links: pay creators and micro-influencers per sale.
- Reviews: ask buyers to leave a review after delivery (real reviews improve search appearance and conversion).

**Paid, once organic basics work**
- Google Merchant Center (free product listings) then Shopping/Performance Max ads in TZS.
- Meta (Facebook/Instagram) click-to-WhatsApp ads aimed at Dar es Salaam, Arusha, Mwanza, Dodoma.

**Measure what works** – after 4–6 weeks compare channels in GA4 (Traffic acquisition) and queries in Search Console; double down on the top two channels.
