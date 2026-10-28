import { useLanguage } from "../context/LanguageContext";

// Phase 1: a one-tap SW | EN switch for visitors who aren't signed in (the
// only other language control lives in Account settings). Shows both codes
// with the active one highlighted; the whole control is one button so it
// stays a 44px touch target.
export default function LanguageToggle({ className = "" }) {
    const { language, setLanguage, t } = useLanguage();
    const next = language === "sw" ? "en" : "sw";
    const label = t("language.switchTo", { language: next === "sw" ? "Kiswahili" : "English" });

    return (
        <button
            type="button"
            onClick={() => setLanguage?.(next)}
            aria-label={label}
            title={label}
            className={`h-11 min-w-[44px] px-2.5 rounded-full inline-flex items-center justify-center gap-1 border border-line text-xs font-semibold tracking-wide hover:border-ink transition-colors focus-ring ${className}`}
        >
            <span className={language === "sw" ? "text-ink" : "text-ash"}>SW</span>
            <span aria-hidden="true" className="text-ash">|</span>
            <span className={language === "sw" ? "text-ash" : "text-ink"}>EN</span>
        </button>
    );
}
