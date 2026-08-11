import { useEffect, useState } from "react";
import { explainForecast, explainPersonalizationHealth } from "../../api/ai";

// Phase B3 features #13 (predictive analytics) and #14 (personalization).
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
        <div className="rounded-lg glass-strong p-4 mb-10 space-y-3">
            <p className="text-xs font-medium text-azure flex items-center gap-2">
                <span className="h-4 w-4 rounded-full bg-gradient-to-br from-azure-light to-azure-deep shrink-0" aria-hidden="true" />
                Nexora AI Copilot
            </p>
            {forecast && (
                <div className="flex items-start gap-2">
                    <span className="text-xs uppercase tracking-widest text-ash shrink-0 w-24 pt-0.5">Forecast</span>
                    <p className="text-sm text-abyss">{forecast.explanation}</p>
                </div>
            )}
            {personalization && (
                <div className="flex items-start gap-2">
                    <span className="text-xs uppercase tracking-widest text-ash shrink-0 w-24 pt-0.5">Personalization</span>
                    <p className="text-sm text-abyss">{personalization.explanation}</p>
                </div>
            )}
        </div>
    );
}
