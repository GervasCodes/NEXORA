import { Link } from "react-router-dom";
import { useLanguage } from "../context/LanguageContext";
import useSellerAccess from "../hooks/useSellerAccess";

// Seller trial banner. Self-fetching (GET /subscriptions/access) so the
// seller layouts only drop it in.
//
//  - during the 7-day trial: days left + everything is unlocked;
//  - after it ends with no paid plan: "Trial ended - choose a plan";
//  - with a paid plan: nothing.
//
// Best-effort: if the request fails the page simply has no banner.
export default function TrialBanner({ plansPath = "/seller/subscription" }) {
    const { t } = useLanguage();
    const access = useSellerAccess();

    if (!access || access.hasPaidPlan) return null;

    const link = (
        <Link to={plansPath} className="font-semibold text-azure hover:underline whitespace-nowrap">
            {t("trial.banner.choosePlan")}
        </Link>
    );

    if (access.inTrial) {
        const days = Number(access.daysLeft) || 1;
        return (
            <div role="status" className="rounded-lg border border-teal/30 bg-teal/5 px-4 py-3 mb-4 text-sm flex flex-wrap items-center justify-between gap-2">
                <div>
                    <p className="font-medium text-teal">
                        {days === 1 ? t("trial.banner.daysLeftOne") : t("trial.banner.daysLeft", { days })}
                    </p>
                    <p className="text-ash mt-0.5">{t("trial.banner.unlocked")}</p>
                </div>
                {link}
            </div>
        );
    }

    if (!access.trialUsed) return null;

    return (
        <div role="status" className="rounded-lg border border-mango/40 bg-mango/10 px-4 py-3 mb-4 text-sm flex flex-wrap items-center justify-between gap-2">
            <div>
                <p className="font-medium text-ink">{t("trial.banner.endedTitle")}</p>
                <p className="text-ash mt-0.5">{t("trial.banner.endedBody")}</p>
            </div>
            {link}
        </div>
    );
}
