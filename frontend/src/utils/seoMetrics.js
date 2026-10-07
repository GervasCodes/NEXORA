import api from "../api/client";

// Lightweight, dependency-free Core Web Vitals reporter plus zero-result
// search logging. Everything here is best-effort: a failure is swallowed so
// measurement can never affect the shopper.
//
// Scope: vitals describe the page the visitor first landed on (a hard
// navigation). Later in-app route changes are not re-measured, which keeps
// the numbers comparable with Search Console's field data.

const SAMPLE_RATE = 0.2; // report ~1 in 5 page loads to keep the table small

const THRESHOLDS = {
    LCP: [2500, 4000],
    CLS: [0.1, 0.25],
    INP: [200, 500],
    FCP: [1800, 3000],
    TTFB: [800, 1800]
};

const rate = (metric, value) => {
    const [good, poor] = THRESHOLDS[metric];
    if (value <= good) return "good";
    return value <= poor ? "needs-improvement" : "poor";
};

const send = (metric, value, path, device) => {
    api.post("/seo/web-vitals", { metric, value: Math.round(value * 1000) / 1000, rating: rate(metric, value), path, device })
        .catch(() => {});
};

export function initWebVitals() {
    if (typeof window === "undefined" || typeof PerformanceObserver === "undefined") return;
    if (Math.random() > SAMPLE_RATE) return;

    const path = window.location.pathname;
    const device = window.matchMedia?.("(max-width: 768px)").matches ? "mobile" : "desktop";
    const values = {};
    let sent = false;

    const observe = (type, onEntries, options = {}) => {
        try {
            const observer = new PerformanceObserver((list) => onEntries(list.getEntries()));
            observer.observe({ type, buffered: true, ...options });
        } catch {
            // Entry type not supported by this browser - skip that metric.
        }
    };

    observe("largest-contentful-paint", (entries) => {
        const last = entries[entries.length - 1];
        if (last) values.LCP = last.startTime;
    });

    observe("paint", (entries) => {
        const fcp = entries.find((entry) => entry.name === "first-contentful-paint");
        if (fcp) values.FCP = fcp.startTime;
    });

    // CLS: sum of shifts not caused by recent input, grouped in session
    // windows; the worst window is the score.
    let sessionValue = 0;
    let sessionEntries = [];
    let worstSession = 0;
    observe("layout-shift", (entries) => {
        for (const entry of entries) {
            if (entry.hadRecentInput) continue;
            const first = sessionEntries[0];
            const last = sessionEntries[sessionEntries.length - 1];
            if (sessionEntries.length && (entry.startTime - last.startTime > 1000 || entry.startTime - first.startTime > 5000)) {
                sessionValue = 0;
                sessionEntries = [];
            }
            sessionEntries.push(entry);
            sessionValue += entry.value;
            worstSession = Math.max(worstSession, sessionValue);
        }
        values.CLS = worstSession;
    });

    // INP (approximation): the slowest interaction seen on the page.
    observe("event", (entries) => {
        for (const entry of entries) {
            if (entry.interactionId) values.INP = Math.max(values.INP || 0, entry.duration);
        }
    }, { durationThreshold: 40 });

    const nav = performance.getEntriesByType?.("navigation")?.[0];
    if (nav) values.TTFB = nav.responseStart;

    const flush = () => {
        if (sent) return;
        sent = true;
        for (const [metric, value] of Object.entries(values)) {
            if (Number.isFinite(value)) send(metric, value, path, device);
        }
    };

    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") flush();
    });
    window.addEventListener("pagehide", flush);
}

// Reports a search that returned nothing. One report per term per tab
// session, so refreshing a results page doesn't inflate the count.
export function logSearchMiss(term, scope = "products") {
    const clean = String(term || "").trim();
    if (clean.length < 2) return;

    const key = `nexora_miss:${scope}:${clean.toLowerCase()}`;
    try {
        if (window.sessionStorage.getItem(key)) return;
        window.sessionStorage.setItem(key, "1");
    } catch {
        // sessionStorage blocked - fall through and report anyway.
    }
    api.post("/seo/search-misses", { term: clean.slice(0, 120), scope }).catch(() => {});
}
