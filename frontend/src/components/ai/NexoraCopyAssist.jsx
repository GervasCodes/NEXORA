import { useState } from "react";
import { generateListingDraft, generateMarketingCopy } from "../../api/ai";

// Phase B2 features #6 (listing/description generator) and #8 (AI
// marketing assistant) share this one control - both are "type a few
// details, get a draft back, review/edit before it goes anywhere".
// `onApply` is only called when the seller explicitly clicks "Use this
// draft" - nothing here writes to the product/service form on its own,
// and nothing here ever calls a create/update/publish endpoint.
export default function NexoraCopyAssist({ mode, name, category, onApply }) {
    const [open, setOpen] = useState(false);
    const [keyPoints, setKeyPoints] = useState("");
    const [audience, setAudience] = useState("");
    const [loading, setLoading] = useState(false);
    const [draft, setDraft] = useState(null);
    const [error, setError] = useState("");
    const [copied, setCopied] = useState(false);

    const isMarketing = mode === "marketing";

    const handleGenerate = async () => {
        if (!name?.trim()) {
            setError("Add a name first so Nexora AI has something to work with.");
            return;
        }
        setLoading(true);
        setError("");
        try {
            const result = isMarketing
                ? await generateMarketingCopy({ name, audience, keyPoints })
                : await generateListingDraft({ type: mode === "service" ? "service" : "product", name, category, keyFeatures: keyPoints });
            setDraft(isMarketing ? result.copy : result.description);
        } catch {
            setError("Nexora AI is temporarily unavailable - please try again in a moment.");
        } finally {
            setLoading(false);
        }
    };

    const handleUseOrCopy = async () => {
        if (isMarketing) {
            try {
                await navigator.clipboard?.writeText(draft);
                setCopied(true);
            } catch {
                // Clipboard access can fail/be unavailable - the draft
                // text is still shown on screen either way, so this is
                // never a dead end, just no auto-copy.
            }
            return;
        }
        onApply(draft);
        setOpen(false);
        setDraft(null);
    };

    if (!open) {
        return (
            <button
                type="button"
                onClick={() => setOpen(true)}
                className="text-xs font-medium text-azure hover:underline flex items-center gap-1"
            >
                <span className="h-3.5 w-3.5 rounded-full bg-gradient-to-br from-azure-light to-azure-deep inline-block" />
                {isMarketing ? "Draft marketing copy with Nexora AI" : "Draft with Nexora AI"}
            </button>
        );
    }

    return (
        <div className="mt-2 rounded-lg glass-strong p-3 space-y-2">
            <p className="text-xs text-ash">
                {isMarketing ? "A few key points to promote, and Nexora AI will draft a short blurb." : "A few key features, and Nexora AI will draft a description."}
            </p>
            {isMarketing && (
                <input
                    type="text"
                    value={audience}
                    onChange={(e) => setAudience(e.target.value)}
                    placeholder="Who is this for? (optional)"
                    className="w-full border border-line rounded-md px-2 py-1.5 text-sm focus-ring"
                />
            )}
            <input
                type="text"
                value={keyPoints}
                onChange={(e) => setKeyPoints(e.target.value)}
                placeholder={isMarketing ? "Key points to highlight" : "Key features or details"}
                className="w-full border border-line rounded-md px-2 py-1.5 text-sm focus-ring"
            />
            <button
                type="button"
                onClick={handleGenerate}
                disabled={loading}
                className="text-xs font-medium rounded-full bg-gradient-to-br from-azure-light to-azure-deep text-white px-3 py-1.5 disabled:opacity-50"
            >
                {loading ? "Drafting…" : "Generate draft"}
            </button>
            {error && <p className="text-xs text-coral">{error}</p>}
            {draft && (
                <div className="border border-line/60 rounded-md p-2 bg-white/60">
                    <p className="text-sm whitespace-pre-wrap">{draft}</p>
                    <div className="flex gap-3 mt-2">
                        <button
                            type="button"
                            onClick={handleUseOrCopy}
                            className="text-xs font-medium text-azure hover:underline"
                        >
                            {isMarketing ? (copied ? "Copied!" : "Copy to clipboard") : "Use this draft"}
                        </button>
                        <button type="button" onClick={() => { setDraft(null); setCopied(false); }} className="text-xs text-ash hover:underline">
                            Discard
                        </button>
                    </div>
                    <p className="text-[11px] text-ash mt-1">
                        {isMarketing
                            ? "Review before posting anywhere - Nexora AI drafts never publish on their own."
                            : "Review and edit before saving - Nexora AI drafts never publish on their own."}
                    </p>
                </div>
            )}
        </div>
    );
}
