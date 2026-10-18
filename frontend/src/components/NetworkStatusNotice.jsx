import { useEffect, useRef, useState } from "react";
import { useToast } from "../context/ToastContext.jsx";
import { useLanguage } from "../context/LanguageContext.jsx";
import api, { getServerWaking, subscribeServerWaking } from "../api/client";

// How often an open, visible tab pings the API to keep a sleepy host awake.
// Free-tier hosts typically sleep after ~15 minutes without traffic, so 4
// minutes leaves comfortable margin without being chatty.
const KEEP_ALIVE_INTERVAL_MS = 4 * 60 * 1000;

// The "waking up" notice only appears once the wait has lasted this long -
// a request that retries once and succeeds a second later shouldn't flash a
// banner at anyone.
const WAKING_NOTICE_DELAY_MS = 2000;

const pingUrl = () => {
    try {
        const base = api.defaults.baseURL || "";
        return `${new URL(base, window.location.href).origin}/ping`;
    } catch {
        return null;
    }
};

// Resilience & Growth + Reliability phase.
//  1. Wires window "online"/"offline" events to the toast system so a
//     buyer mid-checkout (or a seller mid-upload) gets an explicit signal
//     instead of silently-failing requests. Deliberately does NOT fire a
//     toast on first mount even if already offline - it only reacts to a
//     genuine transition after mount.
//  2. Shows a calm "server is waking up, retrying" notice while api/client.js
//     is retrying failed GETs (see getServerWaking / subscribeServerWaking).
//  3. Keeps the API awake while the tab is open and visible, by pinging the
//     database-free /ping route every few minutes. Skipped when the tab is
//     hidden (no point keeping the server warm for nobody) and under tests.
export default function NetworkStatusNotice() {
    const toast = useToast();
    const language = useLanguage();
    const t = language?.t || ((key) => key);
    const hasMounted = useRef(false);
    const [showWaking, setShowWaking] = useState(false);

    useEffect(() => {
        hasMounted.current = true;

        const handleOffline = () => {
            if (!hasMounted.current) return;
            toast?.error(t("network.offline"), 6000);
        };
        const handleOnline = () => {
            if (!hasMounted.current) return;
            toast?.success(t("network.online"), 3000);
        };

        window.addEventListener("offline", handleOffline);
        window.addEventListener("online", handleOnline);
        return () => {
            window.removeEventListener("offline", handleOffline);
            window.removeEventListener("online", handleOnline);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // "Waking up" notice, debounced so brief blips never show it.
    useEffect(() => {
        let timer = null;
        const apply = (waking) => {
            if (waking) {
                if (!timer) {
                    timer = setTimeout(() => {
                        timer = null;
                        setShowWaking(true);
                    }, WAKING_NOTICE_DELAY_MS);
                }
            } else {
                if (timer) {
                    clearTimeout(timer);
                    timer = null;
                }
                setShowWaking(false);
            }
        };
        apply(getServerWaking());
        const unsubscribe = subscribeServerWaking(apply);
        return () => {
            unsubscribe();
            if (timer) clearTimeout(timer);
        };
    }, []);

    // Keep-alive while the tab is visible.
    useEffect(() => {
        if (import.meta.env.MODE === "test") return undefined;
        const url = pingUrl();
        if (!url) return undefined;

        let lastPing = Date.now();
        const ping = () => {
            lastPing = Date.now();
            // no-cors: the response is never read, we only need the request
            // to reach the server. Errors (server still asleep, offline) are
            // ignored - the next interval or real request tries again.
            fetch(url, { mode: "no-cors", cache: "no-store", credentials: "omit" }).catch(() => {});
        };

        const interval = setInterval(() => {
            if (document.visibilityState === "visible") ping();
        }, KEEP_ALIVE_INTERVAL_MS);

        // Coming back to a tab that sat in the background: if it has been a
        // while, wake the server right away instead of waiting for the
        // person's first click to hit a cold host.
        const handleVisibility = () => {
            if (document.visibilityState === "visible" && Date.now() - lastPing > KEEP_ALIVE_INTERVAL_MS) {
                ping();
            }
        };
        document.addEventListener("visibilitychange", handleVisibility);

        return () => {
            clearInterval(interval);
            document.removeEventListener("visibilitychange", handleVisibility);
        };
    }, []);

    if (!showWaking) return null;

    return (
        <div
            role="status"
            aria-live="polite"
            className="bg-teal/10 text-ink border-b border-line text-sm text-center py-2 px-4"
        >
            {t("network.waking")}
        </div>
    );
}
