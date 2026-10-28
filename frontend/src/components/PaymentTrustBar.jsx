import { useLanguage } from "../context/LanguageContext";
import BrandLogo from "./BrandLogo";

// Payment methods shown on Home. Mirrors what checkout offers (see
// pages/Checkout.jsx). Phase 3: real network logos (BrandLogo) with the
// method name kept as text for screen readers and as the fallback.
const METHODS = [
    { key: "home.payMobileMoney", logos: ["mpesa", "mixx", "airtel_money", "halopesa"] },
    { key: "home.payCashOnDelivery", logos: [] },
    { key: "home.payPayPal", logos: ["paypal"] },
    { key: "home.payCard", logos: ["visa", "mastercard"] }
];

export default function PaymentTrustBar() {
    const { t } = useLanguage();
    return (
        <section aria-labelledby="home-payments" className="mb-10">
            <h2 id="home-payments" className="text-xs uppercase tracking-widest text-ash mb-3">{t("home.paymentsTitle")}</h2>
            <ul className="flex flex-wrap gap-2">
                {METHODS.map(({ key, logos }) => (
                    <li key={key} className="min-h-9 px-3 py-1 inline-flex items-center gap-2 rounded-md border border-line text-sm text-ash">
                        {t(key)}
                        {logos.map((l) => <BrandLogo key={l} name={l} height={20} className="border border-line" />)}
                    </li>
                ))}
            </ul>
        </section>
    );
}
