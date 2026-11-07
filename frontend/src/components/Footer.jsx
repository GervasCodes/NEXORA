import { Link } from "react-router-dom";
import { useLanguage } from "../context/LanguageContext";
import { SocialIcon } from "./SocialIcon";
import BrandLogo from "./BrandLogo";

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

const PAYMENT_LOGOS = ["mpesa", "mixx", "airtel_money", "halopesa", "visa", "mastercard", "paypal"];

export default function Footer() {
    const { t } = useLanguage();

    // Phase 3 layout: brand + tagline, one row of real payment logos,
    // social icons, one Help group, ONE Terms & Conditions link (all the
    // legal documents live inside /terms), copyright. Links already in the
    // header/drawer (shop, services, sell) and the install prompt are gone.
    return (
        <footer className="glass-dark text-frost/70 mt-24">
            <div className="max-w-6xl mx-auto px-6 pt-8 pb-8 flex flex-col gap-4 text-sm">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-baseline gap-x-3 gap-y-1 flex-wrap">
                        <span className="font-display italic text-frost text-lg">NEXORA</span>
                        <p className="text-frost/60">{t("footer.tagline")}</p>
                    </div>

                    <div className="flex items-center gap-x-4 gap-y-3 flex-wrap">
                        <ul aria-label={t("footer.paymentsLabel")} className="flex items-center gap-1.5 flex-wrap">
                            {PAYMENT_LOGOS.map((name) => (
                                <li key={name}><BrandLogo name={name} height={28} /></li>
                            ))}
                        </ul>

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

                <nav aria-label={t("footer.helpLabel")} className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-frost/10 pt-4 text-frost/60">
                    <Link to="/about" className="hover:text-frost hover:underline">{t("footer.about")}</Link>
                    <Link to="/how-it-works" className="hover:text-frost hover:underline">{t("footer.howItWorks")}</Link>
                    <Link to="/contact" className="hover:text-frost hover:underline">{t("footer.contact")}</Link>
                    <Link to="/status" className="hover:text-frost hover:underline">{t("footer.status")}</Link>
                    <Link to="/terms" className="hover:text-frost hover:underline">{t("footer.terms")}</Link>
                    <span className="text-frost/70 lg:ml-auto">&copy; {new Date().getFullYear()} NEXORA</span>
                </nav>
            </div>
        </footer>
    );
}
