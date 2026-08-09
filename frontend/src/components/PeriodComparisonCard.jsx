// Small stat card for a single period-over-period comparison (this week
// vs last week, or the 30-day rolling "month" equivalent) - shared by
// AdminDashboard and SellerAnalytics so the "up/down vs prior period"
// treatment looks and behaves the same in both places.
export default function PeriodComparisonCard({ label, current, previous, growthPercent, formatValue, transactionLabel = "transactions" }) {
    const isUp = growthPercent > 0;
    const isDown = growthPercent < 0;

    return (
        <div className="border border-line rounded-lg p-5">
            <p className="text-xs uppercase tracking-widest text-ash mb-3">{label}</p>
            <div className="flex items-baseline gap-2 mb-1">
                <p className="text-2xl font-medium price">{formatValue(current.gmv)}</p>
                <span
                    className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                        isUp ? "text-teal bg-teal/10" : isDown ? "text-coral bg-coral/10" : "text-ash bg-line/40"
                    }`}
                >
                    {isUp ? "▲" : isDown ? "▼" : "–"} {Math.abs(growthPercent)}%
                </span>
            </div>
            <p className="text-xs text-ash mb-3">
                vs {formatValue(previous.gmv)} in the prior period
            </p>
            <div className="flex justify-between text-xs text-ash">
                <span>{current.transactionCount} {transactionLabel}</span>
                <span>prior: {previous.transactionCount}</span>
            </div>
        </div>
    );
}
