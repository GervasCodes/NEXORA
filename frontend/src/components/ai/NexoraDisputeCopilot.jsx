import { useEffect, useState } from "react";
import { summarizeDispute, suggestDisputeResolution } from "../../api/ai";
import { SparkleIcon } from "./NexoraFraudExplain";

// Spinner for inline loading states
function Spinner() {
    return (
        <svg className="w-3.5 h-3.5 animate-spin text-azure" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
        </svg>
    );
}

export default function NexoraDisputeCopilot({ disputeId, onApply }) {
    const [summary, setSummary] = useState(null);
    const [summaryLoading, setSummaryLoading] = useState(true);

    const [suggestOpen, setSuggestOpen] = useState(false);
    const [suggestLoading, setSuggestLoading] = useState(false);
    const [suggestion, setSuggestion] = useState(null);
    const [suggestError, setSuggestError] = useState("");

    useEffect(() => {
        let cancelled = false;
        summarizeDispute(disputeId)
            .then((result) => { if (!cancelled) setSummary(result.summary); })
            .catch(() => {})
            .finally(() => { if (!cancelled) setSummaryLoading(false); });
        return () => { cancelled = true; };
    }, [disputeId]);

    const handleSuggest = async () => {
        setSuggestOpen(true);
        setSuggestLoading(true);
        setSuggestError("");
        try {
            const result = await suggestDisputeResolution(disputeId);
            setSuggestion(result);
        } catch {
            setSuggestError("Nexora AI is temporarily unavailable — please try again in a moment.");
        } finally {
            setSuggestLoading(false);
        }
    };

    const canApply = suggestion?.suggestedResolution && suggestion.suggestedResolution !== "no_action";

    const handleUse = () => {
        if (!canApply) return;
        onApply(suggestion.suggestedResolution, suggestion.suggestedNote || "");
    };

    // Summary skeleton while loading
    const showSummarySkeleton = summaryLoading;

    return (
        <div className="rounded-xl border border-azure/25 bg-gradient-to-br from-azure/6 to-azure/3 overflow-hidden mb-2">
            {/* Header bar */}
            <div className="flex items-center gap-2.5 px-4 py-2.5 border-b border-azure/15">
                <div className="w-6 h-6 rounded-md bg-gradient-to-br from-azure-light to-azure-deep flex items-center justify-center shrink-0">
                    <SparkleIcon className="w-3 h-3 text-white" />
                </div>
                <span className="text-[11px] font-semibold uppercase tracking-widest text-azure">
                    Nexora AI Copilot
                </span>
            </div>

            <div className="px-4 py-3 space-y-3">
                {/* AI summary */}
                {showSummarySkeleton ? (
                    <div className="space-y-1.5 animate-pulse">
                        <div className="h-3 w-20 bg-azure/20 rounded" />
                        <div className="h-3 w-full bg-line/50 rounded" />
                        <div className="h-3 w-3/4 bg-line/50 rounded" />
                    </div>
                ) : summary ? (
                    <div>
                        <p className="text-[10px] font-semibold uppercase tracking-widest text-azure/70 mb-1">
                            Case summary
                        </p>
                        <p className="text-sm text-ink leading-relaxed">{summary}</p>
                    </div>
                ) : null}

                {/* Suggest resolution section */}
                {!suggestOpen ? (
                    <button
                        type="button"
                        onClick={handleSuggest}
                        className="flex items-center gap-2 text-xs font-medium text-azure hover:text-azure-deep transition-colors py-0.5"
                    >
                        <SparkleIcon className="w-3.5 h-3.5" />
                        Suggest a resolution
                    </button>
                ) : (
                    <div className="rounded-lg bg-azure/8 border border-azure/15 px-3 py-2.5 space-y-2.5">
                        <p className="text-[10px] font-semibold uppercase tracking-widest text-azure/70">
                            AI suggestion
                        </p>

                        {suggestLoading && (
                            <div className="flex items-center gap-2 text-sm text-ash">
                                <Spinner />
                                <span>Reviewing case and past precedent…</span>
                            </div>
                        )}

                        {suggestError && (
                            <p className="text-xs text-coral">{suggestError}</p>
                        )}

                        {suggestion && (
                            <div className="space-y-2">
                                {suggestion.suggestedResolution ? (
                                    <div className="flex items-center gap-2">
                                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold bg-azure/15 text-azure px-2 py-0.5 rounded-full">
                                            <span className="w-1.5 h-1.5 rounded-full bg-azure inline-block" />
                                            {suggestion.suggestedResolution.replace(/_/g, " ")}
                                        </span>
                                    </div>
                                ) : (
                                    <p className="text-xs text-ash">Not enough history for a confident suggestion.</p>
                                )}

                                {suggestion.suggestedNote && (
                                    <p className="text-sm text-ink leading-relaxed">{suggestion.suggestedNote}</p>
                                )}

                                {canApply && (
                                    <button
                                        type="button"
                                        onClick={handleUse}
                                        className="flex items-center gap-1.5 text-xs font-medium bg-azure text-white px-3 py-1.5 rounded-md hover:bg-azure-deep transition-colors"
                                    >
                                        Use this suggestion
                                    </button>
                                )}

                                {suggestion.suggestedResolution === "no_action" && (
                                    <p className="text-xs text-ash leading-relaxed">
                                        "No action" maps to the Reject flow below, not the Resolve dropdown.
                                    </p>
                                )}

                                <p className="text-[11px] text-ash/80 pt-1 border-t border-azure/10">
                                    Draft only — Nexora AI never resolves a dispute on its own.
                                </p>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
