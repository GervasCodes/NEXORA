import { Link } from "react-router-dom";
import { LEGAL_DOC_LIST } from "../data/legalDocs";
import { useLanguage } from "../context/LanguageContext";
import { SocialIcon } from "./SocialIcon";
import useInstallPrompt from "../hooks/useInstallPrompt";

// Round 6: real, brand-colored payment network badges instead of 4 generic
// category icons. These are stylized marks (brand color + a short text
// label or, for Mastercard, the two-circle device) rather than a pixel
// trace of each network's official logo artwork - trademarked wordmarks
// (Visa's script, the exact M-Pesa/Airtel/Yas logotypes) aren't reproduced
// verbatim, but the network itself is named and color-matched so a buyer
// recognizes it at a glance. Tanzania's three leading mobile money
// networks plus HaloPesa (TCRA market-share reporting, 2026) are shown
// under "Mobile Money"; Visa + Mastercard under "Card" - matching what
// Checkout.jsx actually offers (see PAYMENT_METHODS_BEFORE_CARDS/AFTER_CARDS
// and the dynamic card-provider list there).
function TextBadge({ bg, fg = "#fff", children, title }) {
    return (
        <span
            role="img"
            title={title}
            aria-label={title}
            className="inline-flex items-center h-5 px-1.5 rounded text-[9px] font-sans font-bold tracking-tight leading-none"
            style={{ backgroundColor: bg, color: fg }}
        >
            {children}
        </span>
    );
}

function MastercardBadge() {
    return (
        <span role="img" title="Mastercard" aria-label="Mastercard" className="inline-flex items-center justify-center w-7 h-5 rounded bg-white/90">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 14" className="w-4 h-3">
                <circle cx="9" cy="7" r="6.2" fill="#EB001B" />
                <circle cx="15" cy="7" r="6.2" fill="#F79E1B" />
                <path d="M12 2.3a6.2 6.2 0 0 1 0 9.4 6.2 6.2 0 0 1 0-9.4Z" fill="#FF5F00" />
            </svg>
        </span>
    );
}

function PayPalBadge() {
    return (
        <span role="img" title="PayPal" aria-label="PayPal" className="inline-flex items-center justify-center w-6 h-5 rounded bg-white/90">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="#0070BA" strokeWidth="1.6">
                <path d="M7 3h8a4 4 0 0 1 4 4c0 3-2 5-5 5H9l-1 6H4l2.5-15Z" />
            </svg>
        </span>
    );
}

function CashOnDeliveryBadge() {
    return (
        <span role="img" title="Cash on Delivery" aria-label="Cash on Delivery" className="flex items-center justify-center w-7 h-5 border border-frost/15 rounded text-frost/60">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3.5 h-3.5" aria-hidden="true">
                <path d="M3 7h18v10H3zM3 10a3 3 0 0 0 3-3M21 10a3 3 0 0 1-3-3M3 14a3 3 0 0 1 3 3M21 14a3 3 0 0 0-3 3M12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z" />
            </svg>
        </span>
    );
}

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
            aria-label="Install the NEXORA app"
            title="Install the NEXORA app"
            className="flex items-center gap-1.5 text-frost/60 hover:text-frost transition-colors"
        >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-4 h-4 shrink-0">
                <path d="M12 3v12m0 0-4-4m4 4 4-4" />
                <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
            </svg>
            <span className="hidden md:inline text-xs">Install app</span>
        </button>
    );
}

export default function Footer() {
    const { t } = useLanguage();

    // Compact layout: brand/tagline + payment icons + install + social
    // share one row (wrapping on narrow screens), and the legal nav row
    // carries the copyright at its end. The legal links themselves
    // (status + every LEGAL_DOC_LIST entry) render exactly as before -
    // compliance-required, so only their container's neighbors changed.
    //
    // Round 6: the explore-nav row is trimmed to the links not already
    // reachable from the header/drawer on every screen size (Guides,
    // Group buys and Live selling moved to Header.jsx's own nav-link list
    // a few phases back and show up in the drawer / ToolsMenu already -
    // nothing is lost, just no longer duplicated here).
    return (
        <footer className="glass-dark text-frost/70 mt-24">
            <div className="max-w-6xl mx-auto px-6 pt-8 pb-8 flex flex-col gap-4 text-sm">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-baseline gap-x-3 gap-y-1 flex-wrap">
                        <span className="font-display italic text-frost text-lg">NEXORA</span>
                        <p className="text-frost/60">{t("footer.tagline")}</p>
                    </div>

                    <div className="flex items-center gap-x-4 gap-y-3 flex-wrap">
                        <div className="flex items-center gap-1">
                            <span className="text-[10px] uppercase tracking-wide text-frost/40 mr-0.5">Mobile money</span>
                            <TextBadge bg="#43A047" title="M-Pesa">M-Pesa</TextBadge>
                            <TextBadge bg="#FDB913" fg="#1a1a1a" title="Mixx by Yas">Mixx</TextBadge>
                            <TextBadge bg="#ED1C24" title="Airtel Money">Airtel</TextBadge>
                            <TextBadge bg="#F7941D" title="HaloPesa">Halo</TextBadge>
                            <span className="text-[10px] uppercase tracking-wide text-frost/40 mx-0.5">Card</span>
                            <TextBadge bg="#1A1F71" title="Visa">VISA</TextBadge>
                            <MastercardBadge />
                            <PayPalBadge />
                            <CashOnDeliveryBadge />
                        </div>

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
                                    className="w-7 h-7 rounded-full overflow-hidden flex items-center justify-center hover:opacity-80 transition-opacity"
                                >
                                    <SocialIcon name={link.key} colored />
                                </a>
                            ))}
                        </div>
                    </div>
                </div>

                <nav aria-label="Explore NEXORA" className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-frost/10 pt-4 text-frost/60">
                    <Link to="/about" className="hover:text-frost hover:underline">
                        About NEXORA
                    </Link>
                    <Link to="/feed" className="hover:text-frost hover:underline">
                        Shop all products
                    </Link>
                    <Link to="/services" className="hover:text-frost hover:underline">
                        Book services
                    </Link>
                    <Link to="/sell" className="hover:text-frost hover:underline">
                        {t("footer.sell")}
                    </Link>
                    <Link to="/how-it-works" className="hover:text-frost hover:underline">
                        {t("footer.howItWorks")}
                    </Link>
                    <Link to="/contact" className="hover:text-frost hover:underline">
                        {t("footer.contact")}
                    </Link>
                </nav>

                <nav aria-label="Legal and platform information" className="flex flex-wrap items-center gap-x-5 gap-y-2 text-frost/60">
                    <Link to="/status" className="hover:text-frost hover:underline">
                        {t("footer.status")}
                    </Link>
                    {LEGAL_DOC_LIST.map((d) => (
                        <Link key={d.slug} to={`/legal/${d.slug}`} className="hover:text-frost hover:underline">
                            {d.shortTitle}
                        </Link>
                    ))}
                    <span className="text-frost/40 lg:ml-auto">&copy; {new Date().getFullYear()} NEXORA</span>
                </nav>
            </div>
        </footer>
    );
}
