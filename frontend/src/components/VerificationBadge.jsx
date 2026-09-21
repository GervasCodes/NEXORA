import CornerBadge from "./ui/CornerBadge";
import { useLanguage } from "../context/LanguageContext";
import { getVerificationTier, VERIFICATION_LABEL_KEYS } from "../utils/verificationTier";

const SHIELD_PATH = "M12 2 4 5v6c0 5.5 3.4 9.7 8 11 4.6-1.3 8-5.5 8-11V5l-8-3Zm-1.2 14.2-3.5-3.5 1.4-1.4 2.1 2.1 5.1-5.1 1.4 1.4-6.5 6.5Z";

const TONES = {
    seller: { fill: "bg-teal text-frost", text: "text-teal" },
    business: { fill: "bg-azure text-frost", text: "text-azure" }
};

// Renders the right one of the two verification badges for a seller /
// product / service / store row, or nothing if the row has neither.
//
// variant:
//  - "corner": tag pinned to a relatively-positioned image corner
//    (ProductCard, ServiceCard); `compact` collapses it to icon-only
//  - "icon": just the shield, colored by tier, label in title/aria-label
//    (dense rows such as FeaturedStoreCard)
export default function VerificationBadge({ entity, variant = "corner", corner = "top-left", compact = false }) {
    const { t } = useLanguage();
    const tier = getVerificationTier(entity);

    if (!tier) {
        return null;
    }

    const label = t(VERIFICATION_LABEL_KEYS[tier]);
    const icon = (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={variant === "icon" ? "w-3.5 h-3.5" : "w-2.5 h-2.5"}>
            <path d={SHIELD_PATH} />
        </svg>
    );

    if (variant === "icon") {
        return (
            <span className={`${TONES[tier].text} shrink-0 inline-flex`} title={label} aria-label={label} role="img">
                {icon}
            </span>
        );
    }

    return <CornerBadge corner={corner} tone={TONES[tier].fill} compact={compact} label={label} icon={icon} />;
}
