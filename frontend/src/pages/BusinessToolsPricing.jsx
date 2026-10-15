import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/client";
import { formatMoney } from "../utils/format";
import PageMeta from "../components/PageMeta";
import Skeleton from "../components/Skeleton";
import ErrorState from "../components/ui/ErrorState";
import { useLanguage } from "../context/LanguageContext";

// Public pricing page for the "Business tools only" tier (migration 146).
// Deliberately separate from the seller-subscription pricing page: commission
// cuts and sponsorship credits mean nothing to an account that doesn't sell
// on the marketplace, so this tier is sold on its own.
export default function BusinessToolsPricing() {
    const { t } = useLanguage();
    const [plans, setPlans] = useState(null);
    const [failed, setFailed] = useState(false);

    const load = () => {
        setFailed(false);
        api.get("/subscriptions/plans", { params: { audience: "business_tools" } })
            .then(({ data }) => setPlans(data.data))
            .catch(() => setFailed(true));
    };
    useEffect(load, []);

    return (
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
            <PageMeta title={t("business.pricingTitle")} description={t("business.pricingSubtitle")} />
            <h1 className="font-display text-3xl mb-2">{t("business.pricingTitle")}</h1>
            <p className="text-ash mb-8">{t("business.pricingSubtitle")}</p>

            {failed ? (
                <ErrorState title={t("business.pricingLoadError")} onRetry={load} />
            ) : !plans ? (
                <Skeleton className="h-48 w-full" />
            ) : (
                <div className="grid sm:grid-cols-2 gap-4">
                    {plans.map((plan) => (
                        <div key={plan.code} className="glass-strong rounded-lg p-5 flex flex-col">
                            <p className="font-display text-xl mb-1">{plan.name}</p>
                            <p className="text-3xl font-semibold price mb-2">
                                {formatMoney(plan.price)}
                                <span className="text-sm text-ash font-normal">
                                    {plan.billingCycle === "annual" ? t("business.perYear") : t("business.perMonth")}
                                </span>
                            </p>
                            {plan.description && <p className="text-sm text-ash mb-3">{plan.description}</p>}
                            <ul className="text-sm text-ash space-y-1 mb-5 flex-1">
                                {(plan.features || []).map((f, i) => <li key={i}>• {f}</li>)}
                            </ul>
                            <Link
                                to="/register?mode=business_tools"
                                className="block text-center bg-ink text-white px-4 py-2 rounded-md text-sm font-semibold hover:opacity-90 transition-opacity"
                            >
                                {t("business.pricingCta")}
                            </Link>
                        </div>
                    ))}
                </div>
            )}

            <p className="text-sm text-ash mt-8">{t("business.pricingUpgradeNote")}</p>
            <p className="text-sm text-ash mt-2">
                {t("business.pricingSellerNote")}{" "}
                <Link to="/pricing" className="text-azure hover:underline">{t("business.pricingSellerLink")}</Link>
            </p>
        </div>
    );
}
