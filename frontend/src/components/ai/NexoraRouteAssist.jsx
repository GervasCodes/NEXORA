import { useEffect, useState } from "react";
import { explainDeliveryRoute } from "../../api/ai";
import AssistantSparkleIcon from "./AssistantSparkleIcon";

// feature #10. Stop order is computed rule-based on the
// backend (ai.service.js#explainDeliveryRoute - a nearest-neighbor
// chain over real delivery coordinates) - this only shows the
// resulting summary. Purely advisory: it never updates a delivery's
// status itself, the agent still uses the normal action buttons for that.
export default function NexoraRouteAssist({ refreshToken }) {
    const [suggestion, setSuggestion] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        explainDeliveryRoute()
            .then((result) => { if (!cancelled) setSuggestion(result.suggestion); })
            .catch(() => {})
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [refreshToken]);

    if (loading || !suggestion) return null;

    return (
        <div className="flex items-start gap-3 rounded-xl border border-azure/20 bg-gradient-to-r from-azure/6 to-transparent px-4 py-3.5 mb-4">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-azure-light to-azure-deep flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                <AssistantSparkleIcon className="w-3.5 h-3.5 text-white" />
            </div>
            <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-azure mb-1">
                    Nexora Assistant · Route
                </p>
                <p className="text-sm text-abyss">{suggestion}</p>
            </div>
        </div>
    );
}
