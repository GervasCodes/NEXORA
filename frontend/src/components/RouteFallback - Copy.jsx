import { useEffect } from "react";
import PageLoader from "./PageLoader";

export const ROUTE_LOADING_EVENT = "nexora:route-loading";

/**
 * Suspense fallback for lazy route chunks. It renders the usual
 * <PageLoader />, and also tells <RouteProgressBar /> that a route chunk
 * is genuinely being fetched (mount = started, unmount = finished), so the
 * top bar reflects real loading instead of a fixed timer.
 */
export default function RouteFallback() {
    useEffect(() => {
        window.dispatchEvent(new CustomEvent(ROUTE_LOADING_EVENT, { detail: { loading: true } }));
        return () => {
            window.dispatchEvent(new CustomEvent(ROUTE_LOADING_EVENT, { detail: { loading: false } }));
        };
    }, []);
    return <PageLoader />;
}
