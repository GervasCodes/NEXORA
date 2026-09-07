import { useEffect, useState } from "react";
import { explainFraudQueue } from "../../api/ai";
import AssistantSparkleIcon from "./AssistantSparkleIcon";

export default function NexoraFraudExplain({ refreshToken }) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        explainFraudQueue()
            .then((result) => { if (!cancelled) setData(result); })
            .catch(() => { if (!cancelled) setData(null); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [refreshToken]);

    if (loading) {
        return (
            <div className="flex items-center gap-3 rounded-xl border border-azure/20 bg-azure/5 px-4 py-3 mb-6 animate-pulse">
                <div className="w-7 h-7 rounded-lg bg-azure/20 shrink-0" />
                <div className="flex-1 space-y-1.5">
                    <div className="h-3 w-24 bg-azure/20 rounded" />
                    <div className="h-3 w-4/5 bg-line/60 rounded" />
                </div>
            </div>
        );
    }
    if (!data || data.openCount === 0) return null;

    return (
        <div className="flex items-start gap-3 rounded-xl border border-azure/25 bg-gradient-to-r from-azure/8 to-azure/4 px-4 py-3.5 mb-6">
            {/* AI orb */}
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-azure-light to-azure-deep flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                <AssistantSparkleIcon className="w-3.5 h-3.5 text-white" />
            </div>
            <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-azure mb-1">
                    Nexora Assistant · Queue triage
                </p>
                <p className="text-sm text-ink leading-relaxed">{data.explanation}</p>
            </div>
        </div>
    );
}
