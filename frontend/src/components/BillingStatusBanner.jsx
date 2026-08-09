import { useEffect, useState } from "react";
import api from "../api/client";

// Trust & Monetization Communication (roadmap Section 6/Phase 7) - one
// small self-fetching banner, dropped onto the Subscription, Sponsorship
// (product/featured-store/department), and Verification pages so
// sellers/providers always know whether that specific billing stream is
// currently free, and if a future activation date is already scheduled,
// exactly when that changes. Self-fetching (calls
// GET /settings/monetization-status itself) rather than requiring every
// page to fetch and pass the status down, so adding it anywhere is a
// one-line drop-in.
//
// flagKey - one of the four monetization_* setting keys.
// label - what to call this billing stream in the banner copy, e.g.
//   "Subscriptions", "Sponsorship", "Verification".
export default function BillingStatusBanner({ flagKey, label }) {
    const [status, setStatus] = useState(null);

    useEffect(() => {
        let cancelled = false;
        api.get("/settings/monetization-status")
            .then(({ data }) => {
                if (!cancelled) setStatus(data.data?.[flagKey] || null);
            })
            .catch(() => {
                // Best-effort - if this fails, the page just doesn't show a
                // billing banner rather than blocking or erroring the page
                // itself, which still works fine without it.
            });
        return () => { cancelled = true; };
    }, [flagKey]);

    if (!status || status.enabled) return null; // billing is live - no "free" messaging to show

    const scheduled = status.scheduledAt && status.scheduledValue === true;

    return (
        <div className="rounded-lg border border-teal/30 bg-teal/5 px-4 py-3 mb-4 text-sm">
            <p className="font-medium text-teal">{label} — free during launch</p>
            {scheduled ? (
                <p className="text-ash mt-0.5">
                    Billing starts on {new Date(status.scheduledAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}.
                    We'll remind you before then.
                </p>
            ) : (
                <p className="text-ash mt-0.5">No date has been set yet — we'll notify you before this changes.</p>
            )}
        </div>
    );
}
