# User Manual (Buyers, Sellers, Delivery Agents)

| Field | Value |
|---|---|
| Audit date | 2026-10-29 |
| Document version | 1.0 |
| Basis | Routes, validators, rules and states verified in code and tests (see `product/functional-specification.md`). **Screens were not viewed in a browser**, so button labels and layouts may differ; instructions use page addresses and field rules. Amounts below are the **seeded defaults** and the owner may have changed them. |

## 1. Getting started (everyone)

1. **Create an account** at `/register`. Choose a role: buyer, seller or delivery agent. Provide first and last name, a valid email, a password of **at least 8 characters**, and accept the Terms and Privacy Policy. Optional: a username (up to 30 characters; some words such as "official" or "verified" are reserved) and a referral code. Delivery agents must also give a vehicle type (bicycle, motorcycle, tuktuk, car, van, truck) and a plate number. You can also use Google sign-in.
2. After registering you are taken to the login page.
3. **Sign in** at `/login` with email and password. You then receive a **one-time code by email** (valid 5 minutes; you can ask for a new one after 1 minute). Enter it to finish signing in. This second step is always required for password sign-in.
4. **Too many wrong attempts** lock the account for 5, then 15, then 60 minutes. Wait, or use `/forgot-password` to reset your password with a code.
5. Change language (English or Swahili) and theme (light, dark, system) in the header or under `/account`.
6. Sellers and delivery agents must be **approved** before listing or delivering. Upload the requested documents and wait for review; a notice shows your status.

Problems: if you see "account suspended", contact support; your session ends immediately when an admin suspends an account.

## 2. Buyers

**Find things.** Use the home page, `/products`, `/services`, `/stores/<name>` or search. Product pages show price, variants, photos, reviews and questions. Save items with the heart; recently viewed and recommendations appear on the home page.

**Buy.**
1. Add items to the cart (`/cart`). A cart holds up to 100 lines and 500 units per line.
2. Go to `/checkout`: confirm address and delivery, choose a payment method (mobile money, card, PayPal, wallet or cash on delivery) and accept the terms. If your cart has items from several sellers, you get one order made of one part per seller.
3. Pay as prompted by the provider (a phone prompt or a redirect). Your order shows as paid only after the provider confirms.
4. Follow the order at `/orders/<id>` and live tracking at `/orders/<id>/tracking`.
5. When you receive the goods, confirm receipt. Cash on delivery orders are auto-confirmed after 48 hours if you do nothing.
6. Leave a review (with photos) on delivered items.

**Book a service.** Open a service, choose dates, pay, and wait for the provider to confirm. Follow it at `/bookings/<id>`. If any chosen date is full or closed, nothing is booked.

**Something wrong?**
- **Return** within 7 days of delivery (14 days for insured purchases): `/returns/new`.
- **Dispute** an order or booking: `/disputes/new`. The seller has 72 hours to respond, then an admin decides. Refunds go back by the original method where possible; otherwise an admin completes them manually, which can take longer.
- **Support**: use the support widget or `/contact`.

**Wallet and verification.** Top up your wallet at `/account/wallet` within the allowed limits (about 1,000 to 3,000,000 per top-up; daily limits rise with identity verification at `/account/kyc`).

**Messages.** `/messages` lets you chat with sellers and agents.

Common problems: payment pending (wait for the provider's confirmation, do not pay twice; the status banner updates live); "Your cart is empty" at checkout (refresh the cart; if it persists, contact support); cannot add to cart (only buyer accounts can buy, so a seller account must use a separate buyer account).

## 3. Sellers

1. **Register and get approved** (documents; verification tiers raise limits).
2. **Set up the store** at `/seller/setup` (branding, payout details).
3. **List products** at `/seller/products/new` (wizard: photos/video, price, variants, stock) or **services** at `/seller/services/new` and set availability at `/seller/availability`.
4. **Handle orders** at `/seller/orders`: prepare the order, mark it ready, and hand over to a delivery agent, or deliver yourself if you chose your own delivery.
5. **Get paid.** After a paid order, your net earnings (after commission) are shown as **held**. They become **available** after delivery, the hold period (default 5 days) and no open dispute. Cash-on-delivery sales are credited at once, with commission deducted. See `/seller/wallet`.
6. **Withdraw** from the wallet: minimum 5,000 and maximum 5,000,000 per request, within your daily cap (200,000 unverified; 2,000,000 ID-verified; 10,000,000 business-verified). A new payout destination waits 24 hours before first use. You cannot withdraw while you have 3 or more open disputes. An admin approves and pays manually; status goes pending, approved, paid (or rejected).
7. **Grow:** `/seller/promote` (sponsorship and featured store, when enabled), `/seller/subscription` (plans, when enabled), group buys, live selling, affiliate links, analytics.
8. **Business tools** (stock, sales, purchases, expenses, POS) are under `/business/stock` or `/seller/stock`, depending on your account type.

Common problems: cannot list (not approved yet); listing limit reached (plan cap); funds still held (check delivery, hold days, disputes); withdrawal refused (see limits above).

## 4. Delivery agents

1. Get approved, then open `/delivery` to see available offers. Accept quickly: unanswered offers expire and are re-offered.
2. Use `/delivery/mine` to go to pick-up and drop-off. Your location is shared while you work.
3. Complete the handover with the customer's code, or a photo and GPS.
4. See `/delivery/earnings` and `/delivery/ratings`. Delivery business owners manage their team at `/delivery/business`.

Common problems: no offers (not approved, not online, or none nearby); location not updating (allow location permission in the browser).

## 5. Troubleshooting for all users

| Symptom | What to try |
|---|---|
| Never receive the login code | Check spam; wait 1 minute and resend; confirm the email address; contact support |
| "Account locked" | Wait for the stated time; do not keep retrying |
| Page says "for buyer accounts" | You are signed in with a different role |
| Feature "temporarily unavailable" | Admin put that module in maintenance; try later |
| Offline | The app shows an offline notice; reconnect |
