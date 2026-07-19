import { useLanguage } from "../context/LanguageContext";

export default function OrderTimeline({ status }) {
    const { t } = useLanguage();

    const STEPS = [
        { key: "pending", label: t("orderTimeline.placed") },
        { key: "processing", label: t("orderTimeline.processing") },
        { key: "shipped", label: t("orderTimeline.shipped") },
        { key: "delivered", label: t("orderTimeline.delivered") }
    ];

    if (status === "cancelled") {
        return (
            <div className="flex items-center gap-2 text-sm text-coral bg-coral/10 rounded-md px-3 py-2 mb-8 animate-slide-down">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 shrink-0">
                    <circle cx="12" cy="12" r="10" /><path d="m15 9-6 6M9 9l6 6" />
                </svg>
                {t("orderTimeline.cancelled")}
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
                                        done ? "bg-teal text-paper scale-100" : "bg-line text-ash scale-90"
                                    }`}
                                >
                                    {done ? "✓" : i + 1}
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
