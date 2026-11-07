// Phase 8 sub-phase 3 (empty & loading states): ConversationThread used to
// swap its entire layout for the same bare <PageLoader /> ring every other
// page uses while the message history fetched - on a chat surface that reads
// as a jarring flash (header/composer disappear, a generic spinner floats
// alone, then the whole glassy thread pops in at once). This mirrors the
// actual page shell instead - back link, action row, a handful of
// alternating bubble placeholders, and the composer pill - so the loading
// moment already looks like the conversation that's about to render, the
// same "skeleton screen" treatment SkeletonList gives Orders/Bookings.
//
// Bubble widths/alignment are just illustrative filler (not derived from
// real data - there's nothing to measure yet), alternating sides so it
// reads as a two-person thread rather than a single column of bars.
const BUBBLES = [
    { mine: false, width: "58%" },
    { mine: true, width: "40%" },
    { mine: false, width: "70%" },
    { mine: true, width: "50%" },
    { mine: false, width: "35%" }
];

export default function ThreadSkeleton() {
    return (
        <div
            className="max-w-2xl lg:max-w-4xl mx-auto px-4 sm:px-6 py-6 flex flex-col h-[calc(100vh-64px)] supports-[height:100dvh]:h-[calc(100dvh-64px)]"
            role="status"
        >
            <span className="sr-only">Loading conversation</span>

            <div className="flex items-center justify-between mb-4 gap-2" aria-hidden="true">
                <div className="h-4 w-24 rounded-md skeleton animate-shimmer" />
                <div className="flex items-center gap-3">
                    <div className="h-3 w-10 rounded-md skeleton animate-shimmer" />
                    <div className="h-3 w-14 rounded-md skeleton animate-shimmer" />
                </div>
            </div>

            <div className="flex-1 space-y-3 pb-4" aria-hidden="true">
                {BUBBLES.map((b, i) => (
                    <div
                        key={i}
                        className={`flex animate-fade-in ${b.mine ? "justify-end" : "justify-start"}`}
                        style={{ animationDelay: `${i * 70}ms` }}
                    >
                        <div
                            className="h-9 rounded-[20px] skeleton animate-shimmer"
                            style={{ width: b.width, maxWidth: "75%" }}
                        />
                    </div>
                ))}
            </div>

            <div className="h-12 rounded-full skeleton animate-shimmer" aria-hidden="true" />
        </div>
    );
}
