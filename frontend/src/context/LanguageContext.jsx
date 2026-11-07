import { createContext, useContext, useState, useCallback, useMemo, useEffect, useRef } from "react";
import { setFormatLocale } from "../utils/format";
import { detectDefaultLanguage } from "../utils/detectLanguage";
import { LANG_PARAM, readLangParam } from "../utils/seo";
import en from "../i18n/en";

const LanguageContext = createContext(null);

const STORAGE_KEY = "nexora_language";
export const LANGUAGES = [
    { code: "en", label: "English" },
    { code: "sw", label: "Kiswahili" }
];

// Phase 9 (first-impression performance): the two dictionaries used to
// live in one ~5,300-line DICTIONARY object here, so every visitor's
// very first JS payload carried both the English AND the Swahili
// strings no matter which language they'd actually see. English is
// kept as a plain static import (src/i18n/en.js) because t() below
// always falls back to it when a key is missing from the active
// dictionary, so it has to be available synchronously from the first
// render. Swahili (src/i18n/sw.js) is only ever requested with a
// dynamic import() - its own Vite chunk - the moment it's actually
// needed: on mount for a Swahili-default visitor (see
// loadStoredLanguage/detectDefaultLanguage), or when someone flips the
// SW|EN toggle. A pure-English session never fetches it at all.
const SUPPORTED_LANGUAGES = new Set(LANGUAGES.map((l) => l.code));
let swDictPromise = null;
const loadSwDictionary = () => {
    if (!swDictPromise) {
        swDictPromise = import("../i18n/sw").then((mod) => mod.default);
    }
    return swDictPromise;
};

const readStored = () => {
    try { return localStorage.getItem(STORAGE_KEY); } catch { return null; }
};

// An explicit ?lang=sw|en in the URL wins over everything (that is what
// makes the Kiswahili pages crawlable and shareable - see PageMeta's
// hreflang). It is applied for this visit only and is not written to
// localStorage, so opening someone's shared link never changes the
// visitor's own saved preference.
const readUrlLanguage = () => {
    try {
        const fromUrl = readLangParam(window.location.search);
        return fromUrl && SUPPORTED_LANGUAGES.has(fromUrl) ? fromUrl : null;
    } catch {
        return null;
    }
};

// Keeps an existing ?lang= in the address bar in step with the language
// toggle so the canonical/hreflang never describe the wrong language.
const syncUrlLanguage = (next) => {
    try {
        const url = new URL(window.location.href);
        if (!url.searchParams.has(LANG_PARAM)) return;
        if (next === "en") url.searchParams.delete(LANG_PARAM);
        else url.searchParams.set(LANG_PARAM, next);
        window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    } catch { /* non-browser environment */ }
};

// Saved choice wins; otherwise Swahili for Swahili browsers / Tanzanian
// devices and English for everyone else (see utils/detectLanguage.js).
const loadStoredLanguage = () => {
    const fromUrl = readUrlLanguage();
    if (fromUrl) return fromUrl;
    const stored = readStored();
    if (SUPPORTED_LANGUAGES.has(stored)) return stored;
    const detected = detectDefaultLanguage();
    return SUPPORTED_LANGUAGES.has(detected) ? detected : "en";
};

export function LanguageProvider({ children }) {
    const [language, setLanguageState] = useState(loadStoredLanguage);

    // Swahili dictionary chunk: requested the moment it's needed (on
    // mount for a Swahili-default visitor, or on-demand when the
    // toggle is used) and cached in the module-level promise above, so
    // switching back and forth never re-fetches it. While it's in
    // flight, t() below falls back to English rather than blocking
    // render - a brief, one-time flash of English on a slow connection
    // beats delaying first paint for it.
    const [swDict, setSwDict] = useState(null);
    const requestedSw = useRef(false);
    useEffect(() => {
        if (language !== "sw" || requestedSw.current) return;
        requestedSw.current = true;
        let cancelled = false;
        loadSwDictionary().then((dict) => {
            if (!cancelled) setSwDict(dict);
        });
        return () => { cancelled = true; };
    }, [language]);

    // Phase 1 (Remediation, E4): keep utils/format.js's date formatters
    // in sync with the active language so `sw` renders dates via the
    // "sw-TZ" locale instead of always falling back to "en-GB" - see the
    // comment above setFormatLocale for why this is a module-level sync
    // rather than a formatDate(...) argument.
    useEffect(() => {
        setFormatLocale(language);
        // <html lang> follows the active language so screen readers,
        // translation prompts and crawlers that render JS see the right one.
        document.documentElement.lang = language;
    }, [language]);

    const setLanguage = useCallback((next) => {
        if (!SUPPORTED_LANGUAGES.has(next)) return;
        try { localStorage.setItem(STORAGE_KEY, next); } catch { /* storage unavailable */ }
        syncUrlLanguage(next);
        setLanguageState(next);
    }, []);

    const syncFromProfile = useCallback((profileLanguage) => {
        if (!SUPPORTED_LANGUAGES.has(profileLanguage)) return;
        if (readStored()) return;
        setLanguage(profileLanguage);
    }, [setLanguage]);


    const t = useCallback((key, params) => {
        const activeDict = language === "en" ? en : (swDict || en);
        const template = activeDict[key] || en[key] || key;
        if (!params) return template;
        return template.replace(/\{(\w+)\}/g, (match, k) => (
            params[k] !== undefined && params[k] !== null ? String(params[k]) : ""
        ));
    }, [language, swDict]);

    const value = useMemo(
        () => ({ language, setLanguage, syncFromProfile, t }),
        [language, setLanguage, syncFromProfile, t]
    );

    return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export const useLanguage = () => useContext(LanguageContext);
