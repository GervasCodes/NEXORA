import { useHoliday } from "../context/HolidayContext";
import { useLanguage } from "../context/LanguageContext";

// Phase 4: lets a visitor turn the festive decorations off (and back on). The
// choice is remembered in localStorage by HolidayContext.
//
// Renders nothing unless there is something to switch: the theme must be live
// on the server and the device must allow motion (reduced motion and data
// saver already turn it off, so a switch would do nothing).
//
// Desktop (default): a plain icon button identical to ThemeToggle / the Home
// icon button. variant="row": a normal list row for the mobile drawer.

function FestiveIcon({ mode, on, className }) {
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
    return (
        <svg {...common}>
            {mode === "newyear" ? (
                <path d="M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z" />
            ) : (
                <path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9M9.5 4.5 12 7l2.5-2.5M9.5 19.5 12 17l2.5 2.5" />
            )}
            {!on && <path d="M4 4l16 16" />}
        </svg>
    );
}

export default function HolidayToggle({ variant = "nav", className = "" }) {
    const { active, mode, visible, suppressed, toggle } = useHoliday();
    const { t } = useLanguage();

    if (!active || suppressed) return null;

    const state = t(visible ? "holiday.toggle.stateOn" : "holiday.toggle.stateOff");
    const label = t(visible ? "holiday.toggle.turnOff" : "holiday.toggle.turnOn");

    if (variant === "row") {
        return (
            <button
                type="button"
                onClick={toggle}
                aria-label={label}
                className={`w-full py-3 flex items-center gap-3 text-left text-sm font-medium whitespace-nowrap transition-colors duration-150 hover:text-teal focus-ring ${className}`}
            >
                <FestiveIcon mode={mode} on={visible} className="w-[18px] h-[18px] shrink-0" />
                <span className="flex-1">{state}</span>
            </button>
        );
    }

    return (
        <button
            type="button"
            onClick={toggle}
            aria-label={label}
            className={`group relative flex items-center justify-center w-10 h-10 rounded-lg text-frost/75 hover:text-azure-light hover:bg-frost/10 transition-all duration-150 ease-out focus-ring ${className}`}
        >
            <FestiveIcon mode={mode} on={visible} className="w-5 h-5 transition-transform duration-150 ease-out group-hover:scale-110" />

            <span
                role="tooltip"
                className="pointer-events-none absolute top-full mt-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-abyss text-frost text-xs px-2 py-1
                    opacity-0 scale-95 translate-y-0.5 group-hover:opacity-100 group-hover:scale-100 group-hover:translate-y-0
                    group-focus-visible:opacity-100 group-focus-visible:scale-100 group-focus-visible:translate-y-0
                    transition-all duration-150 ease-out z-[var(--z-nav)]"
            >
                {state}
            </span>
        </button>
    );
}
