import { useEffect, useState } from "react";
import { explainForecast, explainPersonalizationHealth } from "../../api/ai";
import AssistantSparkleIcon from "./AssistantSparkleIcon";

// features #13 (predictive analytics) and #14 (personalization).
// admin.service.js#getAnalytics's linear-regression forecast and
// recommendation.service.js's rule-based "for you" ranking are both
// completely unchanged by this component - it only asks Nexora AI to
// phrase what those real, already-computed numbers already show.
// Silently renders nothing on failure, since the real charts/stats
// elsewhere on this page are shown either way.
export default function NexoraAdminInsights() {
    const [forecast, setForecast] = useState(null);
    const [personalization, setPersonalization] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        Promise.allSettled([explainForecast("products"), explainPersonalizationHealth()])
            .then(([forecastResult, personalizationResult]) => {
                if (cancelled) return;
                if (forecastResult.status === "fulfilled") setForecast(forecastResult.value);
                if (personalizationResult.status === "fulfilled") setPersonalization(personalizationResult.value);
            })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, []);

    if (loading) {
        return <div className="h-16 bg-line/40 rounded-lg animate-pulse mb-10" />;
    }
    if (!forecast && !personalization) return null;

    return (
        <div className="flex items-start gap-3 rounded-xl border border-azure/20 bg-gradient-to-r from-azure/6 to-transparent px-4 py-3.5 mb-10">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-azure-light to-azure-deep flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                <AssistantSparkleIcon className="w-3.5 h-3.5 text-white" />
            </div>
            <div className="min-w-0 flex-1 space-y-3">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-azure">
                    Nexora Assistant · Copilot
                </p>
                {forecast && (
                    <div className="flex items-start gap-2">
                        <span className="text-xs uppercase tracking-widest text-ash shrink-0 min-w-[6rem] pt-0.5">Forecast</span>
                        <p className="text-sm text-abyss">{forecast.explanation}</p>
                    </div>
                )}
                {personalization && (
                    <div className="flex items-start gap-2">
                        <span className="text-xs uppercase tracking-widest text-ash shrink-0 min-w-[6rem] pt-0.5">Personalization</span>
                        <p className="text-sm text-abyss">{personalization.explanation}</p>
                    </div>
                )}
            </div>
        </div>
    );
}
