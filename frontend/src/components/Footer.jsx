import { Link } from "react-router-dom";
import { LEGAL_DOC_LIST } from "../data/legalDocs";
import { useLanguage } from "../context/LanguageContext";
import { SocialIcon } from "../pages/StorePage";
import useInstallPrompt from "../hooks/useInstallPrompt";

// (Visual Polish & Metadata): the four payment rails checkout
// actually offers (see PAYMENT_METHODS_BEFORE_CARDS/AFTER_CARDS and the
// dynamic card-provider list in Checkout.jsx) - shown here as plain
// line-icon badges rather than provider brand marks (Visa/Mastercard/etc.
// logos aren't reproduced), consistent with the rest of the app's icon
// style.
const PAYMENT_BADGES = [
    { key: "mobile_money", label: "Mobile Money", icon: "M7 2h10a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1Zm3 16h4" },
    { key: "card", label: "Card", icon: "M2 7h20M2 6h20a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Zm3 9h4" },
    { key: "cash_on_delivery", label: "Cash on Delivery", icon: "M3 7h18v10H3zM3 10a3 3 0 0 0 3-3M21 10a3 3 0 0 1-3-3M3 14a3 3 0 0 1 3 3M21 14a3 3 0 0 0-3 3M12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z" },
    { key: "paypal", label: "PayPal", icon: "M7 3h8a4 4 0 0 1 4 4c0 3-2 5-5 5H9l-1 6H4l2.5-15Z" }
];

// NEXORA's own company social handles aren't configured anywhere in the
// repo (getSocialLinks in utils/socialLinks.js is for a seller's *store*
// social links, a different thing). These are placeholder hrefs, clearly
// marked as such below, rather than fabricated URLs - flagging that real
// company social links need to be supplied before these go live.
const COMPANY_SOCIAL_LINKS = [
    { key: "instagram", label: "Instagram", href: "https://www.instagram.com/nexora.marketplace?stkn=MTNiOThzMXd0dnJ2OQ==" },
    { key: "facebook", label: "Facebook", href: "https://www.facebook.com/share/1EwieSM4VV/" },
    { key: "tiktok", label: "TikTok", href: "https://www.tiktok.com/@nexoramarketplace4?_r=1&_t=ZS-99bIB0RkMBI" },
    { key: "youtube", label: "YouTube", href: "https://www.youtube.com/@Nexoramarketplace" }
];

// Phase 2 (Legal & Consumer Trust): legal-entity disclosure block.
//
// **EVERY VALUE BELOW IS A PLACEHOLDER.** These are real business facts
// that exist nowhere in this repository - there is no settings table, env
// var, or config file holding the registered company name, BRELA
// registration number, TIN, or a physical address (checked
// backend/src/modules/settings, config/, and the .env examples). They
// have to come from the business owner before launch. Inventing
// real-looking values here would be worse than leaving the gap visible,
// so they are deliberately loud.
//
// Consumer-facing marketplaces are generally expected to disclose the
// legal entity behind the site and a way to reach it; a footer that says
// only "NEXORA" identifies no one a buyer could actually pursue.
//
// See PHASE_2_NOTES.md - this is the phase's one hard blocker on
// information only the owner can supply.
const BUSINESS_DETAILS = {
    legalName: "[BUSINESS NAME - TO BE FILLED]",
    registrationNumber: "[BRELA REG. NO. - TO BE FILLED]",
    taxId: "[TIN - TO BE FILLED]",
    address: "[REGISTERED PHYSICAL ADDRESS - TO BE FILLED]",
    supportEmail: "[SUPPORT EMAIL - TO BE FILLED]",
    supportPhone: "[SUPPORT PHONE - TO BE FILLED]"
};

function InstallCallout() {
    const { canInstall, promptInstall } = useInstallPrompt();

    // iOS Safari never fires beforeinstallprompt, so canInstall stays
    // false there and this callout just doesn't render - "Add to Home
    // Screen" is a manual Share-sheet action on iOS with no JS hook to
    // trigger it from a footer link.
    if (!canInstall) return null;

    return (
        <button
            onClick={promptInstall}
            className="flex items-center gap-2 text-frost/60 hover:text-frost transition-colors"
        >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-4 h-4 shrink-0">
                <path d="M12 3v12m0 0-4-4m4 4 4-4" />
                <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
            </svg>
            Install the NEXORA app
        </button>
    );
}

export default function Footer() {
    const { t } = useLanguage();

    return (
        <footer className="glass-dark text-frost/70 mt-24">
            <div className="max-w-6xl mx-auto px-6 pt-10 pb-28 sm:pb-10 flex flex-col gap-6 text-sm">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                        <span className="font-display italic text-frost text-lg">NEXORA</span>
                    </div>
                    <p>{t("footer.tagline")}</p>
                    <p className="text-frost/40">&copy; {new Date().getFullYear()} NEXORA</p>
                </div>

                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-t border-frost/10 pt-5">
                    <div className="flex items-center gap-3">
                        {PAYMENT_BADGES.map((badge) => (
                            <span
                                key={badge.key}
                                title={badge.label}
                                aria-label={badge.label}
                                className="flex items-center gap-1.5 border border-frost/15 rounded-md px-2.5 py-1.5 text-frost/60"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-4 h-4 shrink-0">
                                    <path d={badge.icon} />
                                </svg>
                                <span className="hidden md:inline text-xs">{badge.label}</span>
                            </span>
                        ))}
                    </div>

                    <div className="flex items-center gap-4">
                        <InstallCallout />
                        <div className="flex items-center gap-2">
                            {COMPANY_SOCIAL_LINKS.map((link) => (
                                <a
                                    key={link.key}
                                    href={link.href}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    title={link.label}
                                    aria-label={link.label}
                                    className="w-7 h-7 rounded-full border border-frost/15 flex items-center justify-center hover:border-frost/40 hover:text-frost transition-colors"
                                >
                                    <SocialIcon name={link.key} />
                                </a>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="border-t border-frost/10 pt-5 grid gap-x-8 gap-y-2 sm:grid-cols-2 text-xs text-frost/50">
                    <div className="space-y-1">
                        <p className="text-frost/70 font-medium">{BUSINESS_DETAILS.legalName}</p>
                        <p>Reg. no. {BUSINESS_DETAILS.registrationNumber}</p>
                        <p>TIN {BUSINESS_DETAILS.taxId}</p>
                    </div>
                    <div className="space-y-1">
                        <p>{BUSINESS_DETAILS.address}</p>
                        <p>
                            <span className="sr-only">Support email: </span>
                            {BUSINESS_DETAILS.supportEmail}
                        </p>
                        <p>
                            <span className="sr-only">Support phone: </span>
                            {BUSINESS_DETAILS.supportPhone}
                        </p>
                    </div>
                </div>

                <nav className="flex flex-wrap gap-x-5 gap-y-2 border-t border-frost/10 pt-5 text-frost/60">
                    <Link to="/status" className="hover:text-frost hover:underline">
                        {t("footer.status")}
                    </Link>
                    {LEGAL_DOC_LIST.map((d) => (
                        <Link key={d.slug} to={`/legal/${d.slug}`} className="hover:text-frost hover:underline">
                            {d.shortTitle}
                        </Link>
                    ))}
                </nav>
            </div>
        </footer>
    );
}
