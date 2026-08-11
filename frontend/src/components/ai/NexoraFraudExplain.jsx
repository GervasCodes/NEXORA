import { useEffect, useState } from "react";
import { explainFraudQueue } from "../../api/ai";

// Phase B3 feature #12. fraud.service.js's rule engine stays the single
// source of truth for which flags exist and their severity/ordering -
// this only asks Nexora AI to phrase a queue-level triage note on top
// of those real, already-computed flags. Silently renders nothing if
// the call fails or refreshCount hasn't loaded yet, since the real
// flag list on this page is shown either way.
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
        return <div className="h-10 bg-line/40 rounded-lg animate-pulse mb-6" />;
    }
    if (!data || data.openCount === 0) return null;

    return (
        <div className="flex items-start gap-2 rounded-lg glass-strong p-3 mb-6">
            <span className="h-4 w-4 mt-0.5 rounded-full bg-gradient-to-br from-azure-light to-azure-deep shrink-0" aria-hidden="true" />
            <div>
                <p className="text-xs font-medium text-azure mb-0.5">Nexora AI</p>
                <p className="text-sm text-abyss">{data.explanation}</p>
            </div>
        </div>
    );
}
