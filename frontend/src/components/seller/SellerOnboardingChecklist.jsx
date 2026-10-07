import { useState } from "react";
import { Link } from "react-router-dom";
import { CheckIcon } from "../Icons";
import { useLanguage } from "../../context/LanguageContext";

// Phase 6 (New UI/UX & Imagery Additions, item 21): the seller
// onboarding checklist referenced in the original audit but deferred
// until this phase, since it needs the same imagery pass as
// OnboardingTour.jsx. No illustration/photography has been supplied
// for this either, so each item gets a small clearly-marked
// placeholder icon image under /public/images/checklist/ with the same
// onError-hide fallback pattern used elsewhere (Home.jsx, OnboardingTour.jsx)
// - flagging that real assets are needed here too.
//
// Dismissible once per seller account (localStorage), same pattern as
// OnboardingTour's "shown once per account" key - a shared device
// logging in as a different seller should still see it.
const STORAGE_PREFIX = "nexora_seller_checklist_dismissed_";
const CELEBRATED_PREFIX = "nexora_seller_checklist_celebrated_";

export default function SellerOnboardingChecklist({ userId, profile, hasProducts, hasServices, merchantType }) {
    const { t } = useLanguage();
    const [dismissed, setDismissed] = useState(
        () => localStorage.getItem(`${STORAGE_PREFIX}${userId}`) === "1"
    );
    const [celebrated, setCelebrated] = useState(
        () => localStorage.getItem(`${CELEBRATED_PREFIX}${userId}`) === "1"
    );

    const showListingStep = merchantType === "service" ? hasServices : hasProducts || hasServices;

    const items = [
        {
            icon: "/images/checklist/verify.png",
            label: "Verify your store",
            done: !!profile.is_verified,
            to: "/seller/verification"
        },
        {
            icon: "/images/checklist/logo.png",
            label: "Add a store logo",
            done: !!profile.store_logo,
            to: "/seller/store"
        },
        {
            icon: "/images/checklist/listing.png",
            label: merchantType === "service" ? "List your first service" : "List your first product",
            done: showListingStep,
            to: merchantType === "service" ? "/seller/services/new" : "/seller/products/new"
        }
    ];

    const remaining = items.filter((item) => !item.done).length;

    if (dismissed) return null;

    if (remaining === 0) {
        if (celebrated) return null;
        const closeCelebration = () => {
            localStorage.setItem(`${CELEBRATED_PREFIX}${userId}`, "1");
            setCelebrated(true);
        };
        return (
            <div role="status" className="border border-teal/30 bg-teal/5 rounded-lg p-4 mb-8 flex items-center justify-between gap-3">
                <div>
                    <p className="font-display text-lg">🎉 {t("seller.checklist.doneTitle")}</p>
                    <p className="text-sm text-ash">{t("seller.checklist.doneBody")}</p>
                </div>
                <button type="button" onClick={closeCelebration} className="text-xs text-ash hover:text-ink shrink-0">
                    {t("seller.checklist.close")}
                </button>
            </div>
        );
    }

    const doneCount = items.length - remaining;

    const dismiss = () => {
        localStorage.setItem(`${STORAGE_PREFIX}${userId}`, "1");
        setDismissed(true);
    };

    return (
        <div className="border border-line rounded-lg p-4 mb-8">
            <div className="flex items-center justify-between mb-3">
                <p className="font-display text-lg">{t("seller.checklist.title")}</p>
                <button type="button" onClick={dismiss} className="text-xs text-ash hover:text-ink">
                    {t("seller.checklist.dismiss")}
                </button>
            </div>
            <div className="mb-4">
                <div
                    className="h-1.5 rounded-full bg-line overflow-hidden"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={items.length}
                    aria-valuenow={doneCount}
                >
                    <div className="h-full bg-teal transition-all" style={{ width: `${(doneCount / items.length) * 100}%` }} />
                </div>
                <p className="text-xs text-ash mt-1">{t("seller.checklist.progress", { done: doneCount, total: items.length })}</p>
            </div>
            <ul className="space-y-2">
                {items.map((item) => (
                    <li key={item.label}>
                        <Link
                            to={item.to}
                            className={`flex items-center gap-3 rounded-md px-2 py-2 -mx-2 transition-colors ${
                                item.done ? "" : "hover:bg-line/20"
                            }`}
                        >
                            <span className="w-8 h-8 rounded-full bg-line/30 flex items-center justify-center shrink-0 overflow-hidden">
                                <img
                                    src={item.icon}
                                    alt=""
                                    className="w-5 h-5 object-contain"
                                    onError={(e) => { e.currentTarget.style.display = "none"; }}
                                />
                            </span>
                            <span className={`text-sm flex-1 ${item.done ? "text-ash line-through" : "text-ink"}`}>
                                {item.label}
                            </span>
                            <span className={`text-xs inline-flex items-center gap-1 ${item.done ? "text-teal" : "text-ash"}`}>
                                {item.done ? (<><CheckIcon className="w-3 h-3" /> Done</>) : "To do"}
                            </span>
                        </Link>
                    </li>
                ))}
            </ul>
        </div>
    );
}
