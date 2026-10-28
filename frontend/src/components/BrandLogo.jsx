import { useState } from "react";

// Phase 3: one keyed map of brand marks, so every logo in the app (footer,
// payment rows, checkout, wallet, social links, share buttons) comes from
// the same place and is easy to swap.
//
// Files live in /public/brand/<file>. The nine marks below ship with the
// app (glyphs from the Simple Icons set, CC0) and the four Tanzanian
// mobile-money logos supplied by the owner (.webp). Confirm you have
// permission from each network to display its logo. If a file is missing
// or fails to load, a neutral text chip with the brand name is shown.
export const BRANDS = {
    whatsapp: { label: "WhatsApp", file: "whatsapp.svg" },
    instagram: { label: "Instagram", file: "instagram.svg" },
    facebook: { label: "Facebook", file: "facebook.svg" },
    tiktok: { label: "TikTok", file: "tiktok.svg" },
    youtube: { label: "YouTube", file: "youtube.svg" },
    x: { label: "X", file: "x.svg" },
    paypal: { label: "PayPal", file: "paypal.svg" },
    visa: { label: "Visa", file: "visa.svg" },
    mastercard: { label: "Mastercard", file: "mastercard.svg" },
    // Supplied by the owner (artwork in /public/brand/):
    mpesa: { label: "M-Pesa", file: "mpesa.webp" },
    airtel_money: { label: "Airtel Money", file: "airtel-money.webp" },
    mixx: { label: "Mixx by Yas", file: "mixx-by-yas.webp" },
    halopesa: { label: "HaloPesa", file: "halopesa.webp" }
};

// Official WhatsApp glyph path (Simple Icons, CC0) for places that need
// it inline in currentColor, e.g. inside a green share button.
export const WHATSAPP_PATH =
    "M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z";

// Logo on a small white chip so every mark is legible on both the dark
// footer and light pages. height is the chip height in px.
export default function BrandLogo({ name, height = 20, chip = true, className = "" }) {
    const brand = BRANDS[name];
    const [failed, setFailed] = useState(false);
    if (!brand) return null;

    const pad = Math.max(2, Math.round(height * 0.18));
    const common = {
        style: { height, minWidth: height }
    };

    if (failed) {
        return (
            <span
                role="img"
                aria-label={brand.label}
                data-brand-placeholder={name}
                className={`inline-flex items-center justify-center rounded bg-white/90 px-1.5 text-[9px] font-bold leading-none text-slate-700 ${className}`}
                {...common}
            >
                {brand.label}
            </span>
        );
    }

    return (
        <span
            className={`inline-flex items-center justify-center rounded ${chip ? "bg-white/95" : ""} ${className}`}
            {...common}
        >
            <img
                src={`/brand/${brand.file}`}
                alt={brand.label}
                loading="lazy"
                decoding="async"
                draggable="false"
                onError={() => setFailed(true)}
                style={{ height: height - pad * 2, width: "auto", maxWidth: height * 2.4, margin: `0 ${pad}px` }}
            />
        </span>
    );
}
