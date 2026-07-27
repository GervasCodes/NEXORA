
export default function RatingBreakdown({ breakdown, reviewCount }) {
    if (!reviewCount) return null;

    return (
        <div className="mb-6 max-w-xs">
            {[5, 4, 3, 2, 1].map((star) => {
                const count = breakdown?.[star] || 0;
                const pct = reviewCount > 0 ? Math.round((count / reviewCount) * 100) : 0;

                return (
                    <div key={star} className="flex items-center gap-2 text-xs text-ash mb-1">
                        <span className="w-8 shrink-0">{star} ★</span>
                        <div className="flex-1 h-1.5 bg-line rounded-full overflow-hidden">
                            <div
                                className="h-full bg-mango rounded-full transition-[width] duration-700 ease-out"
                                style={{ width: `${pct}%` }}
                            />
                        </div>
                        <span className="w-6 shrink-0 text-right">{count}</span>
                    </div>
                );
            })}
        </div>
    );
}
