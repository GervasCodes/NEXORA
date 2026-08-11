import { useEffect, useState } from "react";
import { suggestAvailability } from "../../api/ai";

// Phase B2 feature #9. Ranking of which dates matter (closed dates,
// busiest weekday) is computed rule-based on the backend
// (ai.service.js#suggestAvailability) from real availability/booking
// data - this only shows the resulting phrasing. Purely advisory: it
// never calls the availability-setting endpoint itself, the provider
// still uses the form next to this panel to actually open a date.
export default function NexoraAvailabilitySuggestion({ serviceId, refreshToken }) {
    const [suggestion, setSuggestion] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!serviceId) { setLoading(false); return; }
        let cancelled = false;
        setLoading(true);
        setSuggestion(null);
        suggestAvailability(serviceId)
            .then((result) => { if (!cancelled) setSuggestion(result); })
            .catch(() => {})
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [serviceId, refreshToken]);

    if (!serviceId || loading) return null;
    if (!suggestion) return null;

    return (
        <div className="flex items-start gap-2 rounded-lg glass-strong p-3 mb-6">
            <span className="h-4 w-4 mt-0.5 rounded-full bg-gradient-to-br from-azure-light to-azure-deep shrink-0" aria-hidden="true" />
            <p className="text-sm text-abyss">{suggestion.suggestion}</p>
        </div>
    );
}
