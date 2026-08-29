import { useEffect, useState } from "react";
import api from "../api/client";
import Skeleton from "./Skeleton";

// Roadmap Phase 4 (Predictive Coverage Dashboard for Ops) - a zone x
// hour-of-day matrix, not a react-leaflet map like AdminDispatchMap.jsx.
// The backend aggregates by orders.shipping_region (see
// admin.repository.js#findHistoricalOrderVolumeByZoneHour) rather than
// a lat/lng grid, since that's the existing zone field the roadmap's
// own instructions allow reusing ("existing city/zone field if one
// exists in the schema") - and a region name has no coordinates to plot
// on a tile layer. A grid/matrix heatmap is the standard way to show
// exactly this shape of data (one category axis, one time axis, one
// intensity value) and needed no new geocoding step.
//
// Self-fetching (unlike AdminDispatchMap, which is handed data as
// props) since this is an independent, read-only reporting panel with
// its own loading/error lifecycle - AdminDispatch.jsx just drops it in.
export default function AdminCoverageHeatmap() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        api
            .get("/admin/dispatch/coverage-heatmap")
            .then(({ data }) => setData(data.data))
            .catch(() => setError("Couldn't load the coverage heatmap. Try refreshing."))
            .finally(() => setLoading(false));
    }, []);

    if (loading) {
        return <Skeleton className="w-full h-64" />;
    }

    if (error) {
        return <p role="alert" className="text-coral text-sm">{error}</p>;
    }

    const grid = data?.grid || [];
    if (grid.length === 0) {
        return <p className="text-ash text-sm">Not enough order history yet to show a coverage forecast.</p>;
    }

    const zones = [...new Set(grid.map((c) => c.zone))].sort();
    const cellsByKey = new Map(grid.map((c) => [`${c.zone}|${c.hourBucket}`, c]));
    const maxGap = Math.max(1, ...grid.map((c) => c.gap));

    // Shortage (gap > 0) shades coral, the same tone the live map's
    // stalled-order marker and dispatch board's "Stalled" summary card
    // already use for "needs attention" - covered/surplus cells stay a
    // flat neutral background rather than a second color scale, since
    // the actionable signal here is specifically where demand is
    // outrunning historical coverage, not how comfortably covered the
    // rest is.
    // CSS custom properties in this codebase store "R G B" triples (see
    // index.css's --color-coral/--color-line), consumed via
    // rgb(var(--color-x) / alpha) - same convention tailwind.config.js's
    // withOpacity() helper uses for the "coral"/"line" utility classes,
    // reused directly here since Tailwind's static classes can't express
    // a value that varies per-cell.
    const cellStyle = (cell) => {
        if (!cell || cell.gap <= 0) {
            return { backgroundColor: "rgb(var(--color-line))" };
        }
        const intensity = Math.min(1, cell.gap / maxGap);
        return { backgroundColor: `rgb(var(--color-coral) / ${0.15 + intensity * 0.65})` };
    };

    return (
        <div>
            <p className="text-ash text-xs mb-3">
                Avg. orders vs. agents historically offered a delivery, by region and hour of day
                (last {data.windowDays} days). Darker cells mean demand has historically outpaced coverage.
            </p>

            <div className="overflow-x-auto border border-line rounded-lg">
                <table className="border-collapse text-xs w-full">
                    <thead>
                        <tr>
                            <th className="sticky left-0 bg-paper text-left px-3 py-2 border-b border-line font-medium text-ash">
                                Region
                            </th>
                            {Array.from({ length: 24 }, (_, hour) => (
                                <th key={hour} className="px-1 py-2 border-b border-line font-medium text-ash whitespace-nowrap">
                                    {hour}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {zones.map((zone) => (
                            <tr key={zone}>
                                <td className="sticky left-0 bg-paper px-3 py-1.5 border-b border-line whitespace-nowrap font-medium">
                                    {zone}
                                </td>
                                {Array.from({ length: 24 }, (_, hour) => {
                                    const cell = cellsByKey.get(`${zone}|${hour}`);
                                    return (
                                        <td
                                            key={hour}
                                            className="border-b border-line text-center"
                                            style={{ width: 28, height: 28, ...cellStyle(cell) }}
                                            title={
                                                cell
                                                    ? `${zone}, ${hour}:00 — ~${cell.avgOrders} orders/day vs ~${cell.avgAgentsOffered} agents offered/day (gap ${cell.gap})`
                                                    : `${zone}, ${hour}:00 — no history`
                                            }
                                        />
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
