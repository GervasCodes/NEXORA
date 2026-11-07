// Opt-in Google Analytics 4.
//
// Nothing loads, and no cookie is set, unless BOTH are true:
//   1. VITE_GA_MEASUREMENT_ID is set for this build (a "G-XXXXXXXXXX" id), and
//   2. the visitor pressed "Accept" on the cookie banner.
// "Decline" (or never answering) keeps analytics fully off. See
// CookieConsentBanner.jsx and legal/cookie-policy.md.
//
// Only public pages are measured, and only their path (no query string),
// so search terms, order numbers and similar never reach Google.

const RAW_ID = import.meta.env?.VITE_GA_MEASUREMENT_ID || "";
export const GA_MEASUREMENT_ID = /^G-[A-Z0-9]{4,}$/.test(RAW_ID) ? RAW_ID : "";

export const ANALYTICS_CONSENT_KEY = "nexora_analytics_consent";
export const ANALYTICS_CONSENT_EVENT = "nexora:analytics-consent";

// Routes that sit behind a login or carry personal data: never reported.
const PRIVATE_PREFIXES = [
    "/account", "/cart", "/checkout", "/orders", "/bookings", "/disputes", "/returns",
    "/saved", "/loyalty", "/affiliate", "/messages", "/seller", "/delivery", "/admin",
    "/login", "/register", "/forgot-password", "/track"
];

export const isPrivatePath = (pathname = "/") =>
    PRIVATE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));

export const isAnalyticsConfigured = () => Boolean(GA_MEASUREMENT_ID);

export const getAnalyticsConsent = () => {
    try {
        const value = localStorage.getItem(ANALYTICS_CONSENT_KEY);
        return value === "granted" || value === "denied" ? value : null;
    } catch {
        return null;
    }
};

let loaded = false;

const ensureGtag = () => {
    window.dataLayer = window.dataLayer || [];
    if (typeof window.gtag !== "function") {
        // GA's snippet pushes the `arguments` object, not an array.
        window.gtag = function gtag() { window.dataLayer.push(arguments); }; // eslint-disable-line prefer-rest-params
    }
};

const loadAnalytics = () => {
    if (loaded || !GA_MEASUREMENT_ID || typeof document === "undefined") return;
    loaded = true;
    window[`ga-disable-${GA_MEASUREMENT_ID}`] = false;
    ensureGtag();
    window.gtag("js", new Date());
    window.gtag("config", GA_MEASUREMENT_ID, {
        send_page_view: false, // SPA: page views are sent per route by trackPageView
        anonymize_ip: true,
        allow_google_signals: false,
        allow_ad_personalization_signals: false
    });
    const script = document.createElement("script");
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_MEASUREMENT_ID)}`;
    document.head.appendChild(script);
};

// Called once on app start: loads GA only for visitors who already accepted.
export const initAnalytics = () => {
    if (getAnalyticsConsent() === "granted") loadAnalytics();
};

export const setAnalyticsConsent = (value) => {
    const next = value === "granted" ? "granted" : "denied";
    try { localStorage.setItem(ANALYTICS_CONSENT_KEY, next); } catch { /* storage unavailable */ }
    if (next === "granted") {
        loadAnalytics();
    } else if (GA_MEASUREMENT_ID && typeof window !== "undefined") {
        window[`ga-disable-${GA_MEASUREMENT_ID}`] = true;
    }
    try { window.dispatchEvent(new CustomEvent(ANALYTICS_CONSENT_EVENT, { detail: next })); } catch { /* ignore */ }
};

const canSend = () => Boolean(GA_MEASUREMENT_ID) && loaded && getAnalyticsConsent() === "granted";

export const trackPageView = (pathname, title) => {
    if (!canSend() || isPrivatePath(pathname)) return;
    window.gtag("event", "page_view", {
        page_path: pathname,
        page_location: `${window.location.origin}${pathname}`,
        page_title: title || document.title
    });
};

// Generic custom event (e.g. "add_to_cart"). Private pages stay unreported.
export const trackEvent = (name, params = {}) => {
    if (!canSend() || isPrivatePath(window.location.pathname)) return;
    window.gtag("event", name, params);
};
