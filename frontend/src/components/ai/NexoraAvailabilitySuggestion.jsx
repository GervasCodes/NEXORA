import { useEffect, useState } from "react";
import { suggestAvailability } from "../../api/ai";
import { SparkleIcon } from "./NexoraFraudExplain";

// Phase B2 — seller availability AI suggestion. Rule-based on the backend;
// purely advisory, never sets availability itself.
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
        <div className="flex items-start gap-3 rounded-xl border border-azure/20 bg-gradient-to-r from-azure/6 to-transparent px-4 py-3.5 mb-6">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-azure-light to-azure-deep flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                <SparkleIcon className="w-3.5 h-3.5 text-white" />
            </div>
            <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-azure mb-1">
                    Nexora AI · Availability tip
                </p>
                <p className="text-sm text-ink leading-relaxed">{suggestion.suggestion}</p>
            </div>
        </div>
    );
}
