*Effective date: 18 September 2026 · Version 1.0*

> **Template notice:** This document is a starting-point template generated for the NEXORA
> platform. It describes what NEXORA actually stores in your browser today. If analytics,
> advertising, or any third-party tracking is added later, this document must be updated
> and the consent banner revisited — a notice-only banner is not sufficient once
> non-essential cookies exist.

## 1. What this policy covers

This Cookie Policy explains the small pieces of data NEXORA stores in your browser, what
each one is for, and what control you have over them. It sits alongside the
**[Privacy Policy](/legal/privacy-policy)**, which covers personal data more broadly.

## 2. The short version

NEXORA sets **two cookies, and both are strictly necessary** for the site to work. We do
**not** use advertising cookies, and we do **not** load third-party analytics or tracking
scripts. Nothing we store in your browser is used to profile you or follow you across
other websites.

## 3. Cookies we set

| Cookie | Purpose | Type | Lifetime |
|---|---|---|---|
| `nexora_session` | Keeps you signed in. Set when you log in, cleared when you log out. It is `HttpOnly`, so page scripts cannot read it. | Strictly necessary | 7 days |
| `nexora_csrf` | Security. Carries a token your browser sends back on every action that changes data, so a malicious site cannot perform actions on your account. It is deliberately readable by our own scripts for that purpose. | Strictly necessary | 7 days |

Both are marked `Secure` in production, so they are only ever sent over HTTPS.

Because these two cookies are strictly necessary to log in and to use the Platform safely,
they are not subject to consent — turning them off would simply mean you cannot sign in.
Blocking them in your browser settings is possible, but the Platform will not work.

## 4. Other things stored in your browser

Some preferences are kept in your browser's own local storage rather than in a cookie.
These never leave your device and are never sent to our servers as a tracking signal. They
include:

- Your chosen **language**, **currency**, and **light/dark theme**
- **Data-saver** mode
- Grid/list **view preference** on product and service listings
- **Recent searches** you typed into the search bar
- Your **chat wallpaper** choice
- Whether you have already dismissed the **"install the app"** prompt or seen the splash
  screen
- A short-lived **affiliate referral token**, when you arrive through a seller's or
  affiliate's referral link, so the referral can be credited to the right person
- Basic **signed-in user details** and a last-activity timestamp, used to restore your
  session state between page loads

You can clear all of these at any time through your browser's "clear site data" or "clear
browsing data" controls.

## 5. Third-party cookies

**We currently set none.** NEXORA does not embed Google Analytics, advertising pixels, or
similar third-party trackers.

Some third-party services we rely on may set their own cookies **on their own pages** when
you are sent there — for example a payment provider's hosted checkout page, where you are
briefly on that provider's site to enter payment details. Those cookies are governed by
that provider's own cookie and privacy policies, not this one. Map tiles are served from
OpenStreetMap; embedded media may be served from its own host.

## 6. Your choices

- **Browser settings.** Every major browser lets you block or delete cookies. Blocking the
  two cookies in Section 3 will prevent you from signing in.
- **Clear site data.** This removes both the cookies and the local-storage preferences in
  Section 4.
- **Log out.** Logging out clears both cookies immediately.

## 7. Changes to this policy

If NEXORA ever introduces analytics, advertising, or other non-essential cookies, this
policy will be updated **and** the cookie notice will be replaced with a proper opt-in
consent mechanism before those cookies are set. The effective date at the top of this page
tells you which version is current.
