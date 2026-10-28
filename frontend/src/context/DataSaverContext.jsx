import { createContext, useContext, useState, useCallback, useMemo, useEffect } from "react";

const DataSaverContext = createContext(null);

const STORAGE_KEY = "nexora_data_saver";

// Connection types treated as "slow enough that data-saver should be on
// by default". 3G is included deliberately - on typical mobile networks
// it is slow enough that autoplay video and full-size images hurt.
const SLOW_EFFECTIVE_TYPES = ["slow-2g", "2g", "3g"];

const getConnection = () => {
    if (typeof navigator === "undefined") return null;
    return navigator.connection || navigator.mozConnection || navigator.webkitConnection || null;
};

// True when the browser/OS asks for reduced data (saveData) or reports a
// 2G-3G effective connection. Browsers without the Network Information
// API (Safari, Firefox desktop) report nothing, so this stays false there.
export const detectSlowConnection = () => {
    const conn = getConnection();
    if (!conn) return false;
    return Boolean(conn.saveData) || SLOW_EFFECTIVE_TYPES.includes(conn.effectiveType);
};

// Returns "1" / "0" for an explicit choice made on this device, or null
// when the person has never touched the setting.
const loadStored = () => {
    try {
        const v = localStorage.getItem(STORAGE_KEY);
        return v === "1" || v === "0" ? v : null;
    } catch {
        return null;
    }
};

// Cloudinary supports on-the-fly transformation via URL path segments
// inserted right after "/upload/" - e.g.
// .../upload/v123/x.jpg -> .../upload/q_auto:eco,w_480,f_auto/v123/x.jpg
// No re-upload or separate asset needed; this only affects what bytes
// get downloaded to render the same image. Non-Cloudinary URLs (or
// already-transformed ones) pass through unchanged.
export const optimizeImageUrl = (url, enabled) => {
    if (!url || typeof url !== "string") return url;
    if (!url.includes("res.cloudinary.com") || !url.includes("/upload/")) return url;
    if (/\/upload\/[^/]*q_auto/.test(url)) return url; // already transformed

    // Everyone gets automatic format (WebP/AVIF where supported) and
    // automatic quality, with no resize - a visually-equivalent but much
    // smaller file than the original upload. Data-saver mode keeps its
    // stronger eco-quality, 480px-wide transform on top of that.
    return url.replace("/upload/", enabled ? "/upload/q_auto:eco,w_480,f_auto/" : "/upload/q_auto,f_auto/");
};

export function DataSaverProvider({ children }) {
    // An explicit choice on this device (stored "1"/"0") always wins.
    // Until there is one, the default follows the live connection.
    const [stored, setStored] = useState(loadStored);
    const [autoDetected, setAutoDetected] = useState(detectSlowConnection);

    useEffect(() => {
        const conn = getConnection();
        if (!conn || typeof conn.addEventListener !== "function") return undefined;
        const onChange = () => setAutoDetected(detectSlowConnection());
        conn.addEventListener("change", onChange);
        return () => conn.removeEventListener("change", onChange);
    }, []);

    const enabled = stored === null ? autoDetected : stored === "1";

    const setEnabled = useCallback((next) => {
        const value = next ? "1" : "0";
        try {
            localStorage.setItem(STORAGE_KEY, value);
        } catch {
            /* storage unavailable (private mode) - keep it in memory only */
        }
        setStored(value);
    }, []);

    // Called once after login/profile load, same shape as
    // CurrencyContext's syncFromProfile - an explicit local choice on
    // this device (someone already toggled it here) wins over whatever
    // the account's own saved preference says.
    const syncFromProfile = useCallback((profileEnabled) => {
        if (loadStored() !== null) return;
        if (profileEnabled) setEnabled(true);
    }, [setEnabled]);

    const optimize = useCallback((url) => optimizeImageUrl(url, enabled), [enabled]);

    const value = useMemo(
        () => ({ enabled, autoDetected, setEnabled, syncFromProfile, optimize }),
        [enabled, autoDetected, setEnabled, syncFromProfile, optimize]
    );

    return <DataSaverContext.Provider value={value}>{children}</DataSaverContext.Provider>;
}

export const useDataSaver = () => useContext(DataSaverContext);
