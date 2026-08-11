import { useEffect, useState } from "react";
import { summarizeDispute, suggestDisputeResolution } from "../../api/ai";

// Phase B3 features #11 (plain-language dispute summary) and #15
// (agentic dispute-resolution suggestion workflow). Admin-only - mounted
// from DisputeDetail.jsx only when isAdmin.
//
// The summary auto-fetches on mount and silently renders nothing on
// failure (the real dispute details below are shown either way).
//
// The "Suggest a resolution" control is the agentic workflow: it chains
// a real dispute-facts fetch with a real historical-precedent lookup on
// the backend (dispute.repository.js#getResolutionStatsForSellerAndType)
// before asking Nexora AI to phrase a suggestion on top of both. The
// result is a DRAFT only (requiresReview: true) - clicking "Use this
// suggestion" only pre-fills the existing Resolve form's dropdown/note
// via onApply, it never calls the resolve endpoint itself. The admin
// still has to review the pre-filled form and submit it themselves,
// exactly as before this phase.
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
            setSuggestError("Nexora AI is temporarily unavailable - please try again in a moment.");
        } finally {
            setSuggestLoading(false);
        }
    };

    // "no_action" isn't one of the Resolve form's own dropdown options
    // (that outcome goes through the separate Reject flow instead) - so
    // it's a valid suggestion to show/read, but not one this control can
    // pre-fill into the resolution dropdown.
    const canApply = suggestion?.suggestedResolution && suggestion.suggestedResolution !== "no_action";

    const handleUse = () => {
        if (!canApply) return;
        onApply(suggestion.suggestedResolution, suggestion.suggestedNote || "");
    };

    return (
        <div className="space-y-2 mb-4">
            {!summaryLoading && summary && (
                <div className="flex items-start gap-2 rounded-lg glass-strong p-3">
                    <span className="h-4 w-4 mt-0.5 rounded-full bg-gradient-to-br from-azure-light to-azure-deep shrink-0" aria-hidden="true" />
                    <div>
                        <p className="text-xs font-medium text-azure mb-0.5">Nexora AI summary</p>
                        <p className="text-sm text-abyss">{summary}</p>
                    </div>
                </div>
            )}

            {!suggestOpen ? (
                <button
                    type="button"
                    onClick={handleSuggest}
                    className="text-xs font-medium text-azure hover:underline flex items-center gap-1"
                >
                    <span className="h-3.5 w-3.5 rounded-full bg-gradient-to-br from-azure-light to-azure-deep inline-block" />
                    Suggest a resolution with Nexora AI
                </button>
            ) : (
                <div className="rounded-lg glass-strong p-3 space-y-2">
                    {suggestLoading && <p className="text-xs text-ash">Reviewing this case and past precedent…</p>}
                    {suggestError && <p className="text-xs text-coral">{suggestError}</p>}
                    {suggestion && (
                        <>
                            <p className="text-xs text-ash">
                                {suggestion.suggestedResolution
                                    ? `Suggested: ${suggestion.suggestedResolution.replace("_", " ")}`
                                    : "No suggestion - not enough history for this case."}
                            </p>
                            <p className="text-sm">{suggestion.suggestedNote}</p>
                            {canApply && (
                                <button
                                    type="button"
                                    onClick={handleUse}
                                    className="text-xs font-medium text-azure hover:underline"
                                >
                                    Use this suggestion
                                </button>
                            )}
                            {suggestion.suggestedResolution === "no_action" && (
                                <p className="text-xs text-ash">
                                    "No action" isn't a Resolve option here - use Reject below if that's the right call.
                                </p>
                            )}
                            <p className="text-[11px] text-ash">
                                Review before resolving - Nexora AI suggestions never submit a resolution on their own.
                            </p>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
