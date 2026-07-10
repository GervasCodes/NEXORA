export default function BarChart({ data, labelKey, valueKey, formatValue }) {
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

                return (
                    <div
                        key={i}
                        className="group relative flex-1 flex flex-col justify-end h-full"
                    >
                        <div
                            className="w-full bg-azure hover:bg-azure-deep rounded-sm transition-colors"
                            style={{ height: `${heightPct}%`, minHeight: value > 0 ? "2px" : 0 }}
                        />
                        <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1 whitespace-nowrap rounded bg-ink px-2 py-1 text-xs text-white opacity-0 group-hover:opacity-100 transition-opacity z-10">
                            {display}
                            {label !== undefined && (
                                <span className="text-white/60"> · {label}</span>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}