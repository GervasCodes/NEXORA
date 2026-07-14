# NEXORA - free features pass (PWA, background jobs, fraud detection, forecasting, realtime admin, voice search)

## 1. Install new backend dependency
`package.json` now also lists `node-cron`.

    cd backend && npm install

## 2. Run new migration
    cd database && npm run migrate

`024_fraud_flags.sql` adds the fraud flag table.

## 3. What's in this pass

### PWA + offline browsing
- `manifest.json` + generated placeholder icons (`icon-192.png`,
  `icon-512.png`, `icon-512-maskable.png`) - **these are placeholder
  monogram icons in your brand colors (abyss background, mango "N"), not
  real artwork**. Swap them for real app icons whenever you have them;
  same filenames, same three sizes, and it just works.
- Also fixed a pre-existing broken reference: `index.html` linked to
  `/apple-touch-icon.png`, which didn't actually exist in `/public`. Now
  points at the generated icon.
- Extended the existing `sw.js` (previously push-notifications-only) to
  also cache the app shell and safe public GET data (`/products`,
  `/categories`) so pages/products someone has already browsed stay
  viewable offline. Deliberately does **not** cache anything
  authenticated - cart, orders, account, messages, seller/admin data all
  bypass the cache entirely and always hit the network, so there's no
  risk of stale or cross-user personal data being served from cache.
- The service worker now registers on every page load for every visitor
  (previously it only registered when a delivery agent opted into push
  notifications), which is also what makes the site installable as an
  app on a phone's home screen.
- `offline.html` - shown when someone navigates to a page that isn't
  cached and there's no connection.

### Background job processing (node-cron, no Redis/queue needed)
- **staleOrders** (every 15 min): auto-cancels orders paid by mobile
  money that sat 2+ hours with no payment confirmation webhook (buyer
  abandoned the USSD prompt, network dropped, etc.) - previously these
  just sat "pending" forever. Also closes out any payment row (order or
  seller verification fee) stuck pending past the same cutoff.
- **otpCleanup** (daily, 03:00): housekeeping - deletes old
  consumed/expired OTP codes so `otp_codes` doesn't grow forever. Not a
  correctness fix (expired codes are already rejected regardless), just
  keeps the table small.

### Fraud detection (rule-based, no ML/external service)
Three explainable heuristics, each producing a plain-English reason an
admin can immediately understand:
- **High-value first order** - a buyer's very first order is unusually
  large (≥1,000,000 TZS)
- **Order velocity** - 3+ orders from the same buyer within 10 minutes
- **Withdrawal outlier** - a seller's withdrawal request is 4x+ their own
  historical average (needs 2+ prior withdrawals to have a baseline)

New admin page at `/admin/fraud` ("Fraud review" in the sidebar) to
dismiss or confirm each flag. Flags are advisory only - nothing is
auto-blocked, orders/withdrawals still process normally; this just
surfaces things for a human to look at.

### Revenue forecasting (linear regression, no ML service)
Ordinary least-squares trend line fit to the last 30 days of revenue,
projected 7 days forward. Shows on the admin dashboard chart as dashed
mango bars alongside the real 14-day history. Deliberately simple - no
seasonality modeling, no external forecasting API - a straight trend line
is an honest level of confidence for a platform this size; anything
fancier would mostly be overfitting noise.

### Realtime admin dashboard
New orders and confirmed payments now push a lightweight
`admin:stats_changed` event over the existing Socket.io connection to
anyone with an admin dashboard open, which silently refetches the numbers
(with a small "Updating…" indicator) instead of only ever reflecting
whatever the numbers were on page load.

### Voice search
Mic button in the header search box using the browser's built-in Web
Speech API - no external speech-to-text service. The button **only
renders when the browser actually supports it**; iOS Safari and some
others don't, and rather than show a mic button that errors or does
nothing there, it just doesn't appear.

## 4. Smoke test after deploy
- [ ] Visit the site on your phone → browser should offer "Add to Home
      Screen" / install prompt (may take a couple of visits on some browsers)
- [ ] Browse a few products, then turn off wifi/data → those pages should
      still load; a page you haven't visited should show the offline screen
- [ ] Admin dashboard → daily sales chart should show dashed
      "projected" bars for the next 7 days
- [ ] Place a high-value first order (or 3 fast orders) as a test buyer →
      check it shows up under Admin → Fraud review
- [ ] Open the admin dashboard in two tabs, place an order in a third →
      both dashboard tabs should show "Updating…" and refresh automatically
- [ ] On a browser that supports it (Chrome desktop/Android), tap the mic
      icon in search and speak a product name

## 5. Still not attempted (needs a paid API/provider decision)
AI chatbot, AI product descriptions, AI category prediction, AI spam
review detection, personalized homepage - same as last time, these need
an LLM provider chosen before any of them make sense to build.
