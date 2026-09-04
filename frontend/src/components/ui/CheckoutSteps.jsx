/**
 * Shared CheckoutSteps component - Phase 0 (UI/UX remediation).
 *
 * Replaces the static "Step 1 · Delivery" / "Step 2 · Payment" /
 * "Step 3 · Review" text labels in Checkout.jsx with a visual
 * numbered-circle progress stepper.
 *
 * NEXORA's checkout is a single-page form (all three sections are always
 * visible and editable together, not a gated wizard) rather than a
 * click-through multi-step flow, so this is a wayfinding indicator of
 * how far along the buyer's inputs are, not a navigation control - there
 * are no click handlers here and steps don't gate visibility of anything.
 * `currentIndex` (0-based) marks the step currently being decided; every
 * step before it is shown as complete, every step after as upcoming.
 *
 * Generic on purpose ("steps", not "checkout steps") so any other
 * multi-stage flow in the app (e.g. seller verification) could reuse it.
 */
export default function CheckoutSteps({ steps = [], currentIndex = 0 }) {
    if (!steps.length) return null;

    return (
        <ol className="flex items-center gap-2 mb-6" aria-label="Progress">
            {steps.map((label, i) => {
                const complete = i < currentIndex;
                const current = i === currentIndex;
                return (
                    <li key={label} className="flex items-center gap-2 flex-1 last:flex-initial">
                        <div className="flex items-center gap-2 shrink-0">
                            <span
                                aria-current={current ? "step" : undefined}
                                className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0 transition-colors
                                    ${complete ? "bg-teal text-white" : current ? "bg-ink text-paper" : "bg-line text-ash"}`}
                            >
                                {complete ? (
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3 h-3">
                                        <path d="M20 6 9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                ) : (
                                    i + 1
                                )}
                            </span>
                            <span className={`text-xs font-semibold uppercase tracking-wide whitespace-nowrap ${current ? "text-ink" : "text-ash"}`}>
                                {label}
                            </span>
                        </div>
                        {i < steps.length - 1 && (
                            <span aria-hidden="true" className={`h-px flex-1 ${complete ? "bg-teal" : "bg-line"}`} />
                        )}
                    </li>
                );
            })}
        </ol>
    );
}
