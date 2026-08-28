import { useLanguage } from "../context/LanguageContext";
import { CheckIcon } from "./Icons";

// Phase 6 (Checkout & Order Timeline UX): `searching` (order.status ===
// "shipped" but dispatch hasn't found a rider yet - see
// utils/orderStatusModel.js's ORDER_STATE.SEARCHING) swaps the "Shipped"
// label for "Finding a rider" instead. Before this, the timeline claimed
// the order had shipped at the exact moment TrackingWidget/OrderDetail
// were telling the same buyer dispatch was still searching for someone
// to hand it to - two components on the same page contradicting each
// other about whether anything had actually left the shop yet.
export default function OrderTimeline({ status, searching = false }) {
    const { t } = useLanguage();

    const STEPS = [
        { key: "pending", label: t("orderTimeline.placed") },
        { key: "processing", label: t("orderTimeline.processing") },
        { key: "shipped", label: searching ? t("orderTimeline.searching") : t("orderTimeline.shipped") },
        { key: "delivered", label: t("orderTimeline.delivered") }
    ];

    if (status === "cancelled") {
        return (
            <div className="flex flex-col items-center text-center bg-coral/5 border border-coral/20 rounded-xl px-4 py-6 mb-8 animate-fade-in">
                <div className="relative mb-3 w-14 h-14">
                    <span className="absolute inset-0 rounded-full bg-coral/15 animate-pulse" />
                    <div className="absolute inset-0 m-auto w-10 h-10 rounded-full bg-coral/20 flex items-center justify-center animate-pop-in">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5 text-coral">
                            <circle cx="12" cy="12" r="10" /><path d="m15 9-6 6M9 9l6 6" />
                        </svg>
                    </div>
                </div>
                <p className="text-sm font-medium text-coral animate-slide-up">{t("orderTimeline.cancelled")}</p>
            </div>
        );
    }

    const currentIndex = STEPS.findIndex((s) => s.key === status);
    // "delivered" is a resting end state, not an in-progress one - only
    // pulse the current step while there's still something to wait for.
    const isLive = currentIndex >= 0 && currentIndex < STEPS.length - 1;

    return (
        <div className="flex items-center mb-8 animate-fade-in">
            {STEPS.map((step, i) => {
                const done = i <= currentIndex;
                const isCurrent = i === currentIndex && isLive;
                const isLast = i === STEPS.length - 1;
                return (
                    <div key={step.key} className={`flex items-center ${isLast ? "" : "flex-1"}`}>
                        <div className="flex flex-col items-center shrink-0">
                            <div className="relative">
                                {isCurrent && (
                                    <span className="absolute inset-0 rounded-full bg-teal/40 animate-ping" />
                                )}
                                <div
                                    className={`relative w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-all duration-500 ${
                                        done ? "bg-teal text-frost scale-100" : "bg-line text-ash scale-90"
                                    }`}
                                >
                                    {done ? <CheckIcon className="w-3 h-3" /> : i + 1}
                                </div>
                            </div>
                            <p className={`text-[11px] mt-1.5 whitespace-nowrap transition-colors duration-500 ${done ? "text-ink font-medium" : "text-ash"}`}>
                                {step.label}
                            </p>
                        </div>
                        {!isLast && (
                            <div className="flex-1 h-0.5 mx-1.5 mb-4 bg-line overflow-hidden rounded-full">
                                <div
                                    className="h-full bg-teal transition-transform duration-700 ease-out origin-left"
                                    style={{ transform: `scaleX(${i < currentIndex ? 1 : 0})` }}
                                />
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
