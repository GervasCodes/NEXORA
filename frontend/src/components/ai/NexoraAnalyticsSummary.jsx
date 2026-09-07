import { useEffect, useState } from "react";
import { summarizeSellerAnalytics } from "../../api/ai";
import AssistantSparkleIcon from "./AssistantSparkleIcon";

// feature #7. seller.service.js#getAnalytics stays the single
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
        <div className="flex items-start gap-3 rounded-xl border border-azure/20 bg-gradient-to-r from-azure/6 to-transparent px-4 py-3.5 mb-6">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-azure-light to-azure-deep flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                <AssistantSparkleIcon className="w-3.5 h-3.5 text-white" />
            </div>
            <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-azure mb-1">
                    Nexora Assistant · Analytics
                </p>
                <p className="text-sm text-abyss">{summary}</p>
            </div>
        </div>
    );
}
