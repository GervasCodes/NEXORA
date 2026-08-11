import { useEffect, useState } from "react";
import { explainDeliveryRoute } from "../../api/ai";

// Phase B2 feature #10. Stop order is computed rule-based on the
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
        <div className="flex items-start gap-2 rounded-lg glass-strong p-3 mb-4">
            <span className="h-4 w-4 mt-0.5 rounded-full bg-gradient-to-br from-azure-light to-azure-deep shrink-0" aria-hidden="true" />
            <p className="text-sm text-abyss">{suggestion}</p>
        </div>
    );
}
