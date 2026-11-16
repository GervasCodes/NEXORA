import { useEffect, useLayoutEffect, useRef } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

/**
 * ScrollToTop - route-change scroll management for a BrowserRouter app.
 *
 * Why this exists: React Router's <ScrollRestoration> needs a data router,
 * and this app uses <BrowserRouter>. Without something like it, clicking a
 * link while scrolled down (a footer link, a product card far down a grid)
 * opened the next page at the SAME scroll offset, so pages appeared to
 * "start at the bottom". Lazy route chunks make the browser's own scroll
 * restoration unreliable for Back/Forward too, because the page is not tall
 * enough yet when the browser tries to restore.
 *
 * Behaviour:
 *  - new page (PUSH/REPLACE to a different pathname) -> jump to the top;
 *  - same pathname with a different ?page=N -> jump to the top (pagination);
 *  - same pathname, other query/state changes (filters, tabs, cleanups of
 *    ?status=... after a payment redirect) -> leave the scroll alone;
 *  - #hash -> scroll to that element, waiting for it to mount (lazy pages);
 *  - Back/Forward (POP) -> restore the position remembered for that history
 *    entry, waiting for the page to be tall enough. Positions also survive a
 *    reload (sessionStorage), because history entries keep their key;
 *  - `navigate(path, { state: { preserveScroll: true } })` opts out;
 *  - any wheel/touch/key input cancels a pending restore so the page never
 *    fights the user.
 */

const STORAGE_KEY = "nexora_scroll_positions";
const MAX_SAVED = 60;
const MAX_WAIT_FRAMES = 90; // ~1.5s at 60fps for lazy chunks + first fetch

let memory = null;

function load() {
    if (memory) return memory;
    memory = new Map();
    try {
        const raw = window.sessionStorage.getItem(STORAGE_KEY);
        if (raw) Object.entries(JSON.parse(raw)).forEach(([k, v]) => { if (Number.isFinite(v)) memory.set(k, v); });
    } catch { /* storage unavailable or corrupt: start empty */ }
    return memory;
}

function remember(key, y) {
    if (!key) return;
    const map = load();
    map.delete(key); // re-insert so the most recent entries are kept on trim
    map.set(key, Math.max(0, Math.round(y)));
    while (map.size > MAX_SAVED) map.delete(map.keys().next().value);
}

function persist() {
    try {
        window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(load())));
    } catch { /* ignore */ }
}

// True when the browser loaded this document by typing/clicking a URL (not a
// reload or Back/Forward). The first history entry always has the key
// "default", so without this check a position remembered for it earlier in
// the same tab would be re-applied to a brand-new visit.
function isFreshVisit() {
    try {
        const entry = window.performance.getEntriesByType("navigation")[0];
        return Boolean(entry) && entry.type === "navigate";
    } catch {
        return false;
    }
}

function jump(top) {
    try {
        // "instant" overrides any `scroll-behavior: smooth` set in CSS.
        window.scrollTo({ top, left: 0, behavior: "instant" });
    } catch {
        window.scrollTo(0, top);
    }
}

/** Runs `attempt` each frame until it returns true (or frames run out). Returns a cancel function. */
function whenReady(attempt, onGiveUp) {
    let raf = 0;
    let frames = 0;
    let done = false;
    const events = ["wheel", "touchstart", "keydown", "mousedown"];

    const stop = () => {
        if (done) return;
        done = true;
        cancelAnimationFrame(raf);
        events.forEach((e) => window.removeEventListener(e, stop));
    };
    events.forEach((e) => window.addEventListener(e, stop, { passive: true }));

    const tick = () => {
        if (done) return;
        if (attempt()) { stop(); return; }
        frames += 1;
        if (frames >= MAX_WAIT_FRAMES) { onGiveUp?.(); stop(); return; }
        raf = requestAnimationFrame(tick);
    };
    tick();
    return stop;
}

function restoreTo(top) {
    if (top <= 0) { jump(0); return () => {}; }
    const maxScroll = () => document.documentElement.scrollHeight - window.innerHeight;
    return whenReady(
        () => {
            if (maxScroll() >= top - 1) { jump(top); return true; }
            return false;
        },
        () => jump(Math.max(0, maxScroll())) // page never got tall enough: go as far as it allows
    );
}

function scrollToHash(hash) {
    let id = hash.replace(/^#/, "");
    try { id = decodeURIComponent(id); } catch { /* keep raw id */ }
    if (!id) { jump(0); return () => {}; }
    return whenReady(() => {
        const el = document.getElementById(id);
        if (!el) return false;
        el.scrollIntoView({ block: "start" });
        return true;
    });
}

export default function ScrollToTop() {
    const location = useLocation();
    const navType = useNavigationType();
    const keyRef = useRef(location.key);
    const prevRef = useRef(null);
    const cancelRef = useRef(() => {});

    // We restore positions ourselves, so the browser must not also try to.
    useEffect(() => {
        const h = window.history;
        if (!h || !("scrollRestoration" in h)) return undefined;
        const previous = h.scrollRestoration;
        h.scrollRestoration = "manual";
        return () => { h.scrollRestoration = previous; };
    }, []);

    // Remember where the user is on the current history entry.
    useEffect(() => {
        let raf = 0;
        const onScroll = () => {
            if (raf) return;
            raf = requestAnimationFrame(() => { raf = 0; remember(keyRef.current, window.scrollY); });
        };
        const flush = () => { remember(keyRef.current, window.scrollY); persist(); };
        const onVisibility = () => { if (document.visibilityState === "hidden") flush(); };
        window.addEventListener("scroll", onScroll, { passive: true });
        window.addEventListener("pagehide", flush);
        document.addEventListener("visibilitychange", onVisibility);
        return () => {
            cancelAnimationFrame(raf);
            window.removeEventListener("scroll", onScroll);
            window.removeEventListener("pagehide", flush);
            document.removeEventListener("visibilitychange", onVisibility);
        };
    }, []);

    useLayoutEffect(() => {
        const { pathname, search, hash, key, state } = location;
        const page = new URLSearchParams(search).get("page");
        const prev = prevRef.current;
        keyRef.current = key;
        prevRef.current = { pathname, page };
        cancelRef.current();
        cancelRef.current = () => {};

        if (hash) { cancelRef.current = scrollToHash(hash); return; }

        // First render of the app, or Back/Forward.
        if (!prev && isFreshVisit()) return;
        if (!prev || navType === "POP") {
            const saved = load().get(key);
            if (saved === undefined && !prev) return; // fresh visit: already at the top
            cancelRef.current = restoreTo(saved ?? 0);
            return;
        }

        if (state && state.preserveScroll) return;
        if (prev.pathname === pathname && prev.page === page) return; // filter/tab/cleanup change
        jump(0);
    }, [location, navType]);

    useEffect(() => () => cancelRef.current(), []);

    return null;
}
