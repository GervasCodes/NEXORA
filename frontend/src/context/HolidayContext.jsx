import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import api from "../api/client";
import { useDataSaver } from "./DataSaverContext";

// Phase 4: tells the storefront whether to draw the Christmas / New Year
// theme. The on/off decision is made on the server (admin switch + dates +
// HOLIDAY_THEME_FORCE_OFF, see backend/src/modules/holidayTheme) and read
// from the public GET /holiday-theme endpoint, which returns only
// { active, mode }.
//
// This file stays tiny on purpose: it is in the first-load bundle, while
// everything that draws (HolidayLayer, header lights, the logo hat) is a
// separate lazy chunk that is only requested when `visible` is true.
//
// `visible` is what the UI should act on. It is false when:
//   - the server says the theme is off (or the request failed),
//   - the visitor turned it off (remembered in localStorage),
//   - the device asks for reduced motion, or
//   - data saver is on.

const MODES = new Set(["christmas", "newyear"]);
const DISMISS_KEY = "nexora_holiday_dismissed";
const REFRESH_AFTER_MS = 15 * 60 * 1000;
const OFF = { active: false, mode: null };

// The year shown in the New Year greeting. From Dec 27 the greeting looks
// forward ("Happy New Year 2027"); from Jan 1 it is already that year.
export const seasonYear = (mode, now = new Date()) =>
    mode === "newyear" && now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear();

// A dismissal belongs to one season, so turning off Christmas does not hide
// New Year, and does not hide next year's Christmas either.
export const seasonKey = (mode, now = new Date()) => `${mode}:${seasonYear(mode, now)}`;

const readDismissed = () => {
    try {
        return localStorage.getItem(DISMISS_KEY);
    } catch {
        return null;
    }
};

const writeDismissed = (value) => {
    try {
        if (value) localStorage.setItem(DISMISS_KEY, value);
        else localStorage.removeItem(DISMISS_KEY);
    } catch {
        /* storage unavailable (private mode): the choice lasts until reload */
    }
};

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

const readReducedMotion = () => {
    try {
        return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(REDUCED_MOTION_QUERY).matches;
    } catch {
        return false;
    }
};

function usePrefersReducedMotion() {
    const [reduced, setReduced] = useState(readReducedMotion);
    useEffect(() => {
        if (typeof window === "undefined" || typeof window.matchMedia !== "function") return undefined;
        const mql = window.matchMedia(REDUCED_MOTION_QUERY);
        const onChange = () => setReduced(mql.matches);
        onChange();
        mql.addEventListener?.("change", onChange);
        return () => mql.removeEventListener?.("change", onChange);
    }, []);
    return reduced;
}

const idle = (fn) => {
    if (typeof window.requestIdleCallback === "function") {
        const id = window.requestIdleCallback(fn, { timeout: 3000 });
        return () => window.cancelIdleCallback?.(id);
    }
    const id = setTimeout(fn, 1200);
    return () => clearTimeout(id);
};

const noop = () => {};
const DEFAULT_VALUE = {
    active: false,
    mode: null,
    year: new Date().getFullYear(),
    dismissed: false,
    suppressed: false,
    visible: false,
    dismiss: noop,
    restore: noop,
    toggle: noop
};

const HolidayContext = createContext(DEFAULT_VALUE);

export function HolidayProvider({ children }) {
    const [status, setStatus] = useState(OFF);
    const [dismissedKey, setDismissedKey] = useState(readDismissed);
    const reducedMotion = usePrefersReducedMotion();
    const dataSaver = Boolean(useDataSaver()?.enabled);

    // Ask the server once the browser is idle (never competes with the first
    // paint), and again when the tab comes back after a while so a theme an
    // admin switched on or off reaches long-open tabs.
    useEffect(() => {
        let cancelled = false;
        let lastFetch = 0;

        const load = async () => {
            lastFetch = Date.now();
            try {
                const res = await api.get("/holiday-theme");
                const data = res?.data?.data;
                if (cancelled) return;
                setStatus(data?.active && MODES.has(data.mode) ? { active: true, mode: data.mode } : OFF);
            } catch {
                /* decorative feature: keep whatever we had (off on first load) */
            }
        };

        const cancelIdle = idle(load);
        const onVisible = () => {
            if (document.visibilityState === "visible" && lastFetch && Date.now() - lastFetch > REFRESH_AFTER_MS) load();
        };
        document.addEventListener("visibilitychange", onVisible);

        return () => {
            cancelled = true;
            cancelIdle();
            document.removeEventListener("visibilitychange", onVisible);
        };
    }, []);

    const { active, mode } = status;
    const year = seasonYear(mode);
    const dismissed = active && dismissedKey === seasonKey(mode);
    const suppressed = reducedMotion || dataSaver;
    const visible = active && !dismissed && !suppressed;

    const dismiss = useCallback(() => {
        if (!mode) return;
        const key = seasonKey(mode);
        writeDismissed(key);
        setDismissedKey(key);
    }, [mode]);

    const restore = useCallback(() => {
        writeDismissed(null);
        setDismissedKey(null);
    }, []);

    const toggle = useCallback(() => {
        if (visible) dismiss();
        else restore();
    }, [visible, dismiss, restore]);

    const value = useMemo(
        () => ({ active, mode, year, dismissed, suppressed, visible, dismiss, restore, toggle }),
        [active, mode, year, dismissed, suppressed, visible, dismiss, restore, toggle]
    );

    return <HolidayContext.Provider value={value}>{children}</HolidayContext.Provider>;
}

export const useHoliday = () => useContext(HolidayContext);
