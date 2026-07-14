import { createContext, useContext, useEffect, useState, useCallback } from "react";

const ThemeContext = createContext(null);

const STORAGE_KEY = "nexora_theme";
const VALID_THEMES = ["light", "dark", "system"];

const systemPrefersDark = () =>
    window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;

const resolveIsDark = (theme) => (theme === "system" ? systemPrefersDark() : theme === "dark");

const applyToDocument = (isDark) => {
    document.documentElement.classList.toggle("dark", isDark);
};

const loadStoredTheme = () => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return VALID_THEMES.includes(stored) ? stored : "system";
};

export function ThemeProvider({ children }) {
    const [theme, setThemeState] = useState(loadStoredTheme);

  
    useEffect(() => {
        applyToDocument(resolveIsDark(theme));
    }, [theme]);

   
    useEffect(() => {
        if (theme !== "system" || !window.matchMedia) return;

        const mql = window.matchMedia("(prefers-color-scheme: dark)");
        const handler = () => applyToDocument(resolveIsDark("system"));

        mql.addEventListener("change", handler);
        return () => mql.removeEventListener("change", handler);
    }, [theme]);

    const setTheme = useCallback((next) => {
        if (!VALID_THEMES.includes(next)) return;
        localStorage.setItem(STORAGE_KEY, next);
        setThemeState(next);
    }, []);

   
    const syncFromProfile = useCallback((profileTheme) => {
        if (!VALID_THEMES.includes(profileTheme)) return;
        if (localStorage.getItem(STORAGE_KEY)) return;
        setTheme(profileTheme);
    }, [setTheme]);

    return (
        <ThemeContext.Provider value={{ theme, setTheme, syncFromProfile, isDark: resolveIsDark(theme) }}>
            {children}
        </ThemeContext.Provider>
    );
}

export const useTheme = () => useContext(ThemeContext);
