import { useLanguage } from "../context/LanguageContext";
import { WHATSAPP_PATH } from "./BrandLogo";

// Shared share controls. Covers three call sites that used to diverge:
// - plain icon/pill WhatsApp link (product pages)
// - green-branded WhatsApp pill + native-share fallback button, in two
//   sizes (Loyalty referral card, GroupBuyDetail share row)
// WhatsApp's real brand green (#25D366) is deliberately NOT a design
// token - it's a third-party brand mark, not part of the NEXORA palette,
// so it stays as a one-off hex here rather than in tailwind.config.js.
const SIZES = {
    sm: { pad: "px-3 py-1.5 text-xs", icon: "w-3.5 h-3.5" },
    md: { pad: "px-4 py-2 text-sm", icon: "w-4 h-4" }
};

function WhatsAppIcon({ className }) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
            <path d={WHATSAPP_PATH} />
        </svg>
    );
}

// Branded green WhatsApp pill, e.g. for a referral/share row that needs
// to read as "this is specifically WhatsApp", not a generic share icon.
export function WhatsAppShareButton({ url, text, size = "md", className = "" }) {
    const { t } = useLanguage();
    const href = `https://wa.me/?text=${encodeURIComponent(text ?? url)}`;
    const { pad, icon } = SIZES[size] ?? SIZES.md;
    return (
        <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className={`flex items-center gap-1.5 bg-[#25D366] text-white rounded-md font-semibold hover:opacity-90 transition-opacity ${pad} ${className}`}
        >
            <WhatsAppIcon className={icon} />
            {t("product.shareWhatsApp")}
        </a>
    );
}

// Native share-sheet button (mobile browsers); renders nothing where
// navigator.share is unavailable, so callers can render it unconditionally.
export function NativeShareButton({ title, text, url, size = "md", className = "" }) {
    const { t } = useLanguage();
    if (typeof navigator === "undefined" || !navigator.share) return null;
    const { pad } = SIZES[size] ?? SIZES.md;
    const handleShare = async () => {
        try {
            await navigator.share({ title, text, url });
        } catch {
            // Cancelling the native share sheet throws - not an error.
        }
    };
    return (
        <button
            type="button"
            onClick={handleShare}
            className={`border border-line rounded-md font-semibold hover:border-ink transition-colors ${pad} ${className}`}
        >
            {t("share.native")}
        </button>
    );
}

// WhatsApp share link, used wherever a page offers "share this".
// Icon-only by default (44px hit area); pass `label` for a visible pill.
export default function ShareButtons({ url, title, label, className = "" }) {
    const { t } = useLanguage();
    const href = `https://wa.me/?text=${encodeURIComponent(`${title} ${url}`)}`;

    if (label) {
        return (
            <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className={`min-h-[44px] inline-flex items-center text-sm border border-line px-4 rounded-full hover:border-ink transition-colors ${className}`}
            >
                {label}
            </a>
        );
    }

    return (
        <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={t("product.shareWhatsApp")}
            className={`w-11 h-11 rounded-full border border-line flex items-center justify-center hover:border-ink transition-colors focus-ring ${className}`}
        >
            <WhatsAppIcon className="w-4 h-4" />
        </a>
    );
}
