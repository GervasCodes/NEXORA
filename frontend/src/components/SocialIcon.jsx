import BrandLogo, { BRANDS } from "./BrandLogo";

// Shared between StorePage.jsx (a seller's own social links) and Footer.jsx
// (NEXORA's own company links). Phase 3: every mark now comes from
// BrandLogo's official-glyph set instead of hand-drawn lookalikes.
// `colored` renders the logo on a round white chip (footer); otherwise the
// bare coloured glyph at icon size (seller store links).
export function SocialIcon({ name, colored = false }) {
    const key = name === "twitter" ? "x" : name;
    if (!BRANDS[key]) {
        // Unknown network: neutral link glyph, never a wrong brand.
        return (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-4 h-4" aria-hidden="true">
                <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 11 18.7l1-1" strokeLinecap="round" />
            </svg>
        );
    }
    return colored
        ? <BrandLogo name={key} height={28} className="rounded-full" />
        : <BrandLogo name={key} height={16} chip={false} />;
}
