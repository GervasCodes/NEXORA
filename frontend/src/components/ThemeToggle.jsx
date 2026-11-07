import { useTheme } from "../context/ThemeContext";
import { useLanguage } from "../context/LanguageContext";

// Cycles System -> Light -> Dark. Defaults to System for everyone, so guests
// follow their device setting until they choose otherwise.
const ORDER = ["system", "light", "dark"];
const LABEL_KEYS = { system: "theme.system", light: "theme.light", dark: "theme.dark" };

function ThemeIcon({ theme }) {
    const common = { xmlns: "http://www.w3.org/2000/svg", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, className: "w-4 h-4", "aria-hidden": true };
    if (theme === "light") {
        return (<svg {...common}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>);
    }
    if (theme === "dark") {
        return (<svg {...common}><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" /></svg>);
    }
    return (<svg {...common}><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /></svg>);
}

export default function ThemeToggle({ className = "" }) {
    const { theme, setTheme } = useTheme();
    const { t } = useLanguage();
    const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length];
    const current = t(LABEL_KEYS[theme] || "theme.system");

    return (
        <button
            type="button"
            onClick={() => setTheme(next)}
            aria-label={t("theme.toggleLabel", { mode: current })}
            title={t("theme.toggleLabel", { mode: current })}
            className={`w-11 h-11 rounded-full flex items-center justify-center border border-line text-ash hover:border-ink hover:text-ink transition-colors ${className}`}
        >
            <ThemeIcon theme={theme} />
        </button>
    );
}
