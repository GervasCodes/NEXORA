import { useLanguage } from "../../context/LanguageContext";
import { getStatusMeta } from "../../utils/statusMeta";

// Tone -> Tailwind classes. Kept here (not in statusMeta.jsx) so the
// literal class strings Tailwind's JIT scanner needs to see are in a
// .jsx file next to where they're used, same reasoning as every other
// static-class-map component in this codebase.
const TONE_CLASSES = {
    neutral: "bg-line text-ash",
    teal: "bg-teal/10 text-teal",
    "teal-solid": "bg-teal text-white",
    mango: "bg-mango/20 text-mango-dark",
    coral: "bg-coral/10 text-coral",
    azure: "bg-azure/10 text-azure",
    abyss: "bg-abyss/10 text-abyss"
};

/**
 * StatusBadge (Phase 4 remediation) - the one place an order/booking/
 * dispute/return/group-buy status becomes a colored, iconed, translated
 * pill. `domain` picks the status vocabulary (see utils/statusMeta.jsx);
 * `status` is the raw backend value.
 *
 * Falls back to the raw status string (capitalized) if no translation
 * exists yet for it, same safety net the pre-existing
 * BookingStatusBadge had, so a new backend status value shows up
 * untranslated rather than blank.
 */
export default function StatusBadge({ domain, status, size = "md" }) {
    const { t } = useLanguage();
    if (!status) return null;

    const { style, icon, translationKey } = getStatusMeta(domain, status);
    const toneClass = TONE_CLASSES[style] || TONE_CLASSES.neutral;
    const sizeClass = size === "sm" ? "text-[11px] px-2 py-0.5" : "text-xs px-2.5 py-1";
    const translated = t(translationKey);
    const label = translated === translationKey ? status.replace(/_/g, " ") : translated;

    return (
        <span className={`inline-flex items-center gap-1 font-medium rounded-full shrink-0 capitalize whitespace-nowrap transition-colors ${sizeClass} ${toneClass}`}>
            {icon}
            {label}
        </span>
    );
}
