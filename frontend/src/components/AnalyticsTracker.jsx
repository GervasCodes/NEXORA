import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { ANALYTICS_CONSENT_EVENT, getAnalyticsConsent, initAnalytics, isAnalyticsConfigured, trackPageView } from "../utils/analytics";

// Sends one GA4 page_view per client-side route change, once the visitor
// has opted in. Renders nothing. Mount it once inside <BrowserRouter>.
export default function AnalyticsTracker() {
    const { pathname } = useLocation();

    useEffect(() => {
        if (isAnalyticsConfigured()) initAnalytics();
    }, []);

    useEffect(() => {
        if (!isAnalyticsConfigured()) return undefined;
        const send = () => {
            if (getAnalyticsConsent() !== "granted") return;
            // Wait a tick so react-helmet-async has updated document.title.
            setTimeout(() => trackPageView(pathname), 300);
        };
        send();
        // A visitor who accepts on this page should be counted from here on.
        window.addEventListener(ANALYTICS_CONSENT_EVENT, send);
        return () => window.removeEventListener(ANALYTICS_CONSENT_EVENT, send);
    }, [pathname]);

    return null;
}
