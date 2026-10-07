import { useLanguage } from "../context/LanguageContext";

// Payment methods shown on Home. Mirrors what checkout offers (see
// pages/Checkout.jsx). Text badges, not provider logos, so no third-party
// assets are fetched. Edit this list if checkout's methods change.
const METHOD_KEYS = [
    "home.payMobileMoney",
    "home.payCashOnDelivery",
    "home.payPayPal",
    "home.payCard",
];

export default function PaymentTrustBar() {
    const { t } = useLanguage();
    return (
        <section aria-labelledby="home-payments" className="mb-10">
            <h2 id="home-payments" className="text-xs uppercase tracking-widest text-ash mb-3">{t("home.paymentsTitle")}</h2>
            <ul className="flex flex-wrap gap-2">
                {METHOD_KEYS.map((key) => (
                    <li key={key} className="h-9 px-3 inline-flex items-center rounded-md border border-line text-sm text-ash">
                        {t(key)}
                    </li>
                ))}
            </ul>
        </section>
    );
}
