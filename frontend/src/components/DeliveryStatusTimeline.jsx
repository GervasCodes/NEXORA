import { useLanguage } from "../context/LanguageContext";
import { formatDate } from "../utils/format";

const STEPS = ["assigned", "picked_up", "in_transit", "delivered"];

// Real timestamps per step (migration 037 added picked_up_at/in_transit_at
// alongside the existing assigned_at/delivered_at) - so unlike
// OrderTimeline (which only knows the *current* order status), this
// shows *when* each delivery step actually happened, wherever that data
// exists. A delivery created before the migration simply won't have
// picked_up_at/in_transit_at - its step still marks as done, just
// without a time underneath.
export default function DeliveryStatusTimeline({ delivery }) {
    const { t } = useLanguage();

    if (delivery.status === "failed") {
        return (
            <div className="flex items-center gap-2 text-sm text-coral bg-coral/10 rounded-md px-3 py-2 animate-slide-down">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 shrink-0">
                    <circle cx="12" cy="12" r="10" /><path d="m15 9-6 6M9 9l6 6" />
                </svg>
                {t("delivery.tracking.timeline.failed")}
            </div>
        );
    }

    const currentIndex = STEPS.indexOf(delivery.status);
    const timestamps = {
        assigned: delivery.assigned_at,
        picked_up: delivery.picked_up_at,
        in_transit: delivery.in_transit_at,
        delivered: delivery.delivered_at
    };

    return (
        <div>
            <p className="text-xs uppercase tracking-widest text-ash mb-3">
                {t("delivery.tracking.timeline.title")}
            </p>
            <ol className="space-y-4">
                {STEPS.map((step, i) => {
                    const done = i <= currentIndex;
                    const isCurrent = i === currentIndex && currentIndex < STEPS.length - 1;
                    const ts = timestamps[step];
                    return (
                        <li key={step} className="flex items-start gap-3">
                            <div className="relative shrink-0 mt-0.5">
                                {isCurrent && (
                                    <span className="absolute inset-0 rounded-full bg-teal/40 animate-ping" />
                                )}
                                <div
                                    className={`relative w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold transition-all duration-500 ${
                                        done ? "bg-teal text-paper" : "bg-line text-ash"
                                    }`}
                                >
                                    {done ? "✓" : i + 1}
                                </div>
                            </div>
                            <div>
                                <p className={`text-sm transition-colors duration-500 ${done ? "text-ink font-medium" : "text-ash"}`}>
                                    {t(`delivery.tracking.timeline.${step}`)}
                                </p>
                                {ts && <p className="text-xs text-ash mt-0.5">{formatDate(ts)}</p>}
                            </div>
                        </li>
                    );
                })}
            </ol>
        </div>
    );
}
