import { useTheme } from "../context/ThemeContext";
import { useLanguage } from "../context/LanguageContext";

// Cycles System -> Light -> Dark. Defaults to System for everyone, so guests
// follow their device setting until they choose otherwise.
//
// Desktop (default): a plain icon button identical in size, radius and hover
// to the Home / Browse icon buttons in the header, with the same tooltip.
// variant="row": a normal list row for the mobile drawer.
const ORDER = ["system", "light", "dark"];
const LABEL_KEYS = { system: "theme.system", light: "theme.light", dark: "theme.dark" };

function ThemeIcon({ theme, className }) {
    const common = {
        xmlns: "http://www.w3.org/2000/svg",
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: 1.8,
        strokeLinecap: "round",
        strokeLinejoin: "round",
        className,
        "aria-hidden": true
    };
    if (theme === "light") {
        return (<svg {...common}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>);
    }
    if (theme === "dark") {
        return (<svg {...common}><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" /></svg>);
    }
    return (<svg {...common}><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /></svg>);
}

export default function ThemeToggle({ variant = "nav", className = "" }) {
    const { theme, setTheme } = useTheme();
    const { t } = useLanguage();
    const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length];
    const current = t(LABEL_KEYS[theme] || "theme.system");
    const label = t("theme.toggleLabel", { mode: current });

    if (variant === "row") {
        return (
            <button
                type="button"
                onClick={() => setTheme(next)}
                aria-label={label}
                className={`w-full py-3 flex items-center gap-3 text-left text-sm font-medium whitespace-nowrap transition-colors duration-150 hover:text-teal focus-ring ${className}`}
            >
                <ThemeIcon theme={theme} className="w-[18px] h-[18px] shrink-0" />
                <span className="flex-1">{t("theme.label")}: {current}</span>
            </button>
        );
    }

    return (
        <button
            type="button"
            onClick={() => setTheme(next)}
            aria-label={label}
            className={`group relative flex items-center justify-center w-10 h-10 rounded-lg text-frost/75 hover:text-azure-light hover:bg-frost/10 transition-all duration-150 ease-out focus-ring ${className}`}
        >
            <ThemeIcon theme={theme} className="w-5 h-5 transition-transform duration-150 ease-out group-hover:scale-110" />

            {/* Tooltip - same as the other header icon buttons */}
            <span
                role="tooltip"
                className="pointer-events-none absolute top-full mt-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-abyss text-frost text-xs px-2 py-1
                    opacity-0 scale-95 translate-y-0.5 group-hover:opacity-100 group-hover:scale-100 group-hover:translate-y-0
                    group-focus-visible:opacity-100 group-focus-visible:scale-100 group-focus-visible:translate-y-0
                    transition-all duration-150 ease-out z-[var(--z-nav)]"
            >
                {current}
            </span>
        </button>
    );
}
