export default function BarChart({ data, labelKey, valueKey, formatValue, highlightKey }) {
    if (!data || data.length === 0) {
        return <p className="text-ash text-sm">No data to display.</p>;
    }

    const values = data.map((d) => Number(d[valueKey]) || 0);
    const max = Math.max(...values, 1);

    return (
        <div className="flex items-end gap-1 h-40">
            {data.map((item, i) => {
                const value = Number(item[valueKey]) || 0;
                const heightPct = (value / max) * 100;
                const label = item[labelKey];
                const display = formatValue ? formatValue(value) : value;
                // Optional second series marker (e.g. forecasted vs actual
                // days) - renders as a dashed/muted bar instead of solid.
                const isHighlighted = highlightKey && item[highlightKey];

                return (
                    <div
                        key={i}
                        className="group relative flex-1 flex flex-col justify-end h-full"
                    >
                        <div
                            className={`w-full rounded-sm transition-colors ${
                                isHighlighted
                                    ? "bg-mango/40 border border-dashed border-mango-dark hover:bg-mango/60"
                                    : "bg-azure hover:bg-azure-deep"
                            }`}
                            style={{ height: `${heightPct}%`, minHeight: value > 0 ? "2px" : 0 }}
                        />
                        <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1 whitespace-nowrap rounded bg-ink px-2 py-1 text-xs text-paper opacity-0 group-hover:opacity-100 transition-opacity z-10">
                            {display}
                            {isHighlighted && <span className="text-mango"> · projected</span>}
                            {label !== undefined && (
                                <span className="text-paper/60"> · {label}</span>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
