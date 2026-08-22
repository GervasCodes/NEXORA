// Line/trend chart - same data shape and props as BarChart (data,
// labelKey, valueKey, formatValue, highlightKey) so the two are
// interchangeable behind a view toggle. Rendered as a plain SVG polyline
// rather than a charting library, matching BarChart's own "no new
// dependency" approach. viewBox width is fixed at 100 units so each
// point's x coordinate doubles as its left-offset percentage, which is
// what the hover-tooltip overlay below relies on.
export default function LineChart({ data, labelKey, valueKey, formatValue, highlightKey, highlightLabel = "projected" }) {
    if (!data || data.length === 0) {
        return <p className="text-ash text-sm">No data to display.</p>;
    }

    const W = 100;
    const H = 40;
    const PAD_X = 2;
    const PAD_Y = 4;

    const values = data.map((d) => Number(d[valueKey]) || 0);
    const max = Math.max(...values, 1);
    const min = Math.min(0, ...values);
    const range = max - min || 1;

    const points = data.map((item, i) => {
        const x = data.length === 1 ? W / 2 : PAD_X + (i / (data.length - 1)) * (W - PAD_X * 2);
        const value = Number(item[valueKey]) || 0;
        const y = H - PAD_Y - ((value - min) / range) * (H - PAD_Y * 2);
        return { x, y, value, label: item[labelKey], projected: Boolean(highlightKey && item[highlightKey]) };
    });

    // Split into a solid (actual) path and a dashed (projected) path at
    // the first projected point, mirroring BarChart's highlightKey bars.
    const splitIndex = points.findIndex((p) => p.projected);
    const solid = splitIndex === -1 ? points : points.slice(0, splitIndex + 1);
    const projected = splitIndex === -1 ? [] : points.slice(splitIndex);
    const toPath = (pts) => pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" ");

    return (
        <div className="relative h-40 w-full">
            <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-full overflow-visible">
                {solid.length > 1 && (
                    <path
                        d={toPath(solid)}
                        fill="none"
                        strokeWidth="1"
                        vectorEffect="non-scaling-stroke"
                        className="stroke-azure-deep"
                    />
                )}
                {projected.length > 1 && (
                    <path
                        d={toPath(projected)}
                        fill="none"
                        strokeWidth="1"
                        strokeDasharray="3 2"
                        vectorEffect="non-scaling-stroke"
                        className="stroke-mango-dark"
                    />
                )}
                {points.map((p, i) => (
                    <circle
                        key={i}
                        cx={p.x}
                        cy={p.y}
                        r="1.1"
                        vectorEffect="non-scaling-stroke"
                        className={p.projected ? "fill-mango" : "fill-azure-deep"}
                    />
                ))}
            </svg>

            {points.map((p, i) => {
                const display = formatValue ? formatValue(p.value) : p.value;
                return (
                    <div
                        key={i}
                        className="group pointer-events-auto absolute top-0 h-full"
                        style={{ left: `${p.x}%`, width: `${100 / points.length}%`, transform: "translateX(-50%)" }}
                    >
                        <div
                            className="pointer-events-none absolute left-1/2 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded bg-ink px-2 py-1 text-xs text-paper opacity-0 transition-opacity group-hover:opacity-100 z-10"
                            style={{ top: `${(p.y / H) * 100}%`, marginTop: "-6px" }}
                        >
                            {display}
                            {p.projected && <span className="text-mango"> · {highlightLabel}</span>}
                            {p.label !== undefined && <span className="text-paper/60"> · {p.label}</span>}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
