import { useEffect, useState } from "react";
import { summarizeSellerAnalytics } from "../../api/ai";

// Phase B2 feature #7. seller.service.js#getAnalytics stays the single
// source of truth for every number shown elsewhere on this page - this
// only asks Nexora AI to turn the same numbers into a couple of
// readable sentences. Silently renders nothing if the call fails, since
// the rest of the analytics page already shows the real numbers either way.
export default function NexoraAnalyticsSummary() {
    const [summary, setSummary] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        summarizeSellerAnalytics()
            .then((result) => { if (!cancelled) setSummary(result.summary); })
            .catch(() => {})
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, []);

    if (loading) {
        return <div className="h-10 bg-line/40 rounded-lg animate-pulse mb-6" />;
    }
    if (!summary) return null;

    return (
        <div className="flex items-start gap-2 rounded-lg glass-strong p-3 mb-6">
            <span className="h-4 w-4 mt-0.5 rounded-full bg-gradient-to-br from-azure-light to-azure-deep shrink-0" aria-hidden="true" />
            <p className="text-sm text-abyss">{summary}</p>
        </div>
    );
}
