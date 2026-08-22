import { createContext, useContext, useState, useCallback, useMemo } from "react";

const DataSaverContext = createContext(null);

const STORAGE_KEY = "nexora_data_saver";

const loadStored = () => localStorage.getItem(STORAGE_KEY) === "1";

// Cloudinary supports on-the-fly transformation via URL path segments
// inserted right after "/upload/" - e.g.
// .../upload/v123/x.jpg -> .../upload/q_auto:eco,w_480,f_auto/v123/x.jpg
// No re-upload or separate asset needed; this only affects what bytes
// get downloaded to render the same image. Non-Cloudinary URLs (or
// already-transformed ones) pass through unchanged.
export const optimizeImageUrl = (url, enabled) => {
    if (!enabled || !url || typeof url !== "string") return url;
    if (!url.includes("res.cloudinary.com") || !url.includes("/upload/")) return url;
    if (/\/upload\/[^/]*q_auto/.test(url)) return url; // already transformed

    return url.replace("/upload/", "/upload/q_auto:eco,w_480,f_auto/");
};

export function DataSaverProvider({ children }) {
    const [enabled, setEnabledState] = useState(loadStored);

    const setEnabled = useCallback((next) => {
        localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
        setEnabledState(next);
    }, []);

    // Called once after login/profile load, same shape as
    // CurrencyContext's syncFromProfile - an explicit local choice on
    // this device (someone already toggled it here) wins over whatever
    // the account's own saved preference says.
    const syncFromProfile = useCallback((profileEnabled) => {
        if (localStorage.getItem(STORAGE_KEY) !== null) return;
        if (profileEnabled) setEnabled(true);
    }, [setEnabled]);

    const optimize = useCallback((url) => optimizeImageUrl(url, enabled), [enabled]);

    const value = useMemo(
        () => ({ enabled, setEnabled, syncFromProfile, optimize }),
        [enabled, setEnabled, syncFromProfile, optimize]
    );

    return <DataSaverContext.Provider value={value}>{children}</DataSaverContext.Provider>;
}

export const useDataSaver = () => useContext(DataSaverContext);
