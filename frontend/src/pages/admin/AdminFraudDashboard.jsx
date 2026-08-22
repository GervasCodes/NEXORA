import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api, { extractErrorMessage } from "../../api/client";
import { formatDate } from "../../utils/format";
import BarChart from "../../components/BarChart";
import LineChart from "../../components/LineChart";
import Skeleton from "../../components/Skeleton";
import PageMeta from "../../components/PageMeta";

// Phase Q9 (Admin Tools) - anomaly-detection dashboard. Everything here
// is a visualization of GET /admin/fraud-dashboard, which itself is
// plain statistics over the existing fraud_flags table (see
// fraud.service.js#getDashboardStats) - no model, nothing predicted.
// This page is the "what's happening over time" view; AdminFraud.jsx
// stays the "work the open queue" view.

const RULE_LABELS = {
    high_value_first_order: "High-value first order",
    order_velocity: "Order velocity",
    withdrawal_outlier: "Withdrawal outlier"
};

function ruleLabel(code) {
    return RULE_LABELS[code] || code;
}

function StatCard({ label, value, sub, tone }) {
    const toneClass = tone === "coral"
        ? "text-coral"
        : tone === "teal"
            ? "text-teal"
            : "text-ink";

    return (
        <div className="rounded-xl border border-line bg-paper p-4">
            <p className="text-xs text-ash uppercase tracking-wider mb-1.5">{label}</p>
            <p className={`font-display text-2xl ${toneClass}`}>{value}</p>
            {sub && <p className="text-xs text-ash mt-1">{sub}</p>}
        </div>
    );
}

function entityLink(entity) {
    if (entity.entityType === "order") {
        return <Link to="/admin/orders" className="text-azure hover:underline">Order #{entity.entityId}</Link>;
    }
    return <Link to="/admin/sellers" className="text-azure hover:underline">Seller #{entity.entityId}</Link>;
}

export default function AdminFraudDashboard() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [chartView, setChartView] = useState("line");

    useEffect(() => {
        api.get("/admin/fraud-dashboard")
            .then(({ data }) => setData(data.data))
            .catch((err) => setError(extractErrorMessage(err)))
            .finally(() => setLoading(false));
    }, []);

    return (
        <div>
            <PageMeta title="Fraud & Abuse Dashboard" noIndex />

            <div className="mb-6 flex items-start justify-between gap-4">
                <div>
                    <h1 className="font-display text-2xl mb-1">Fraud &amp; abuse dashboard</h1>
                    <p className="text-ash text-sm leading-relaxed max-w-2xl">
                        Visualized flag volume and simple statistical spike detection over the past{" "}
                        {data ? data.dailySeries.length : 30} days. A day or rule is flagged as a spike when it sits
                        well above its own recent baseline - not a prediction, just the platform's own history as the
                        yardstick.
                    </p>
                </div>
                <Link
                    to="/admin/fraud"
                    className="text-xs px-3 py-1.5 rounded-lg border border-line hover:border-ink/40 hover:bg-line/30 transition-all whitespace-nowrap shrink-0"
                >
                    Open queue →
                </Link>
            </div>

            {loading && (
                <div className="space-y-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-20" />)}
                    </div>
                    <Skeleton className="h-48" />
                </div>
            )}

            {error && (
                <div className="flex items-center gap-2 text-sm text-coral bg-coral/8 border border-coral/20 rounded-lg px-4 py-3 mb-4">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-4 h-4 shrink-0">
                        <circle cx="12" cy="12" r="10" /><path d="M12 8v4m0 4h.01" />
                    </svg>
                    {error}
                </div>
            )}

            {!loading && data && (
                <>
                    {/* Stat cards */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                        <StatCard label="Open flags" value={data.summary.openTotal} />
                        <StatCard
                            label="Flags, last 7 days"
                            value={data.summary.last7DayCount}
                            sub={`vs ~${data.summary.baselineWeeklyAvg}/week baseline`}
                            tone={data.summary.percentChangeVsBaseline > 50 ? "coral" : undefined}
                        />
                        <StatCard
                            label="7-day change"
                            value={`${data.summary.percentChangeVsBaseline > 0 ? "+" : ""}${data.summary.percentChangeVsBaseline}%`}
                            sub="vs trailing baseline"
                            tone={data.summary.percentChangeVsBaseline > 50 ? "coral" : undefined}
                        />
                        <StatCard
                            label="Confirmed rate"
                            value={data.summary.confirmedRate === null ? "—" : `${data.summary.confirmedRate}%`}
                            sub={`${data.summary.confirmedCount} confirmed · ${data.summary.dismissedCount} dismissed (30d)`}
                            tone="teal"
                        />
                    </div>

                    {/* Anomaly banner */}
                    {data.anomalyDays.length > 0 ? (
                        <div className="mb-6 rounded-xl border border-coral/25 bg-coral/8 p-4">
                            <p className="text-sm font-semibold text-coral mb-2 flex items-center gap-1.5">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-4 h-4">
                                    <path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                                </svg>
                                {data.anomalyDays.length} day{data.anomalyDays.length > 1 ? "s" : ""} above the normal range
                            </p>
                            <ul className="space-y-1">
                                {data.anomalyDays.map((a) => (
                                    <li key={a.day} className="text-sm text-ink/90">{a.reason}</li>
                                ))}
                            </ul>
                        </div>
                    ) : (
                        <div className="mb-6 rounded-xl border border-teal/20 bg-teal/8 px-4 py-3 text-sm text-ink/90 flex items-center gap-2">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="w-4 h-4 text-teal shrink-0">
                                <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            No days in the past week fall outside the normal range.
                        </div>
                    )}

                    {/* Daily trend */}
                    <div className="rounded-xl border border-line bg-paper p-4 mb-6">
                        <div className="flex items-center justify-between mb-3">
                            <h2 className="font-display text-lg">Flags raised per day</h2>
                            <div className="flex items-center gap-1 text-xs">
                                <button
                                    onClick={() => setChartView("bar")}
                                    className={`px-2.5 py-1 rounded-lg border transition-colors ${chartView === "bar" ? "border-ink/40 bg-line/30" : "border-line"}`}
                                >
                                    Bar
                                </button>
                                <button
                                    onClick={() => setChartView("line")}
                                    className={`px-2.5 py-1 rounded-lg border transition-colors ${chartView === "line" ? "border-ink/40 bg-line/30" : "border-line"}`}
                                >
                                    Line
                                </button>
                            </div>
                        </div>
                        {chartView === "bar" ? (
                            <BarChart data={data.dailySeries} labelKey="day" valueKey="count" highlightKey="isAnomaly" />
                        ) : (
                            <LineChart data={data.dailySeries} labelKey="day" valueKey="count" highlightKey="isAnomaly" />
                        )}
                        <p className="text-xs text-ash mt-2">Dashed/highlighted points mark days flagged as spikes.</p>
                    </div>

                    <div className="grid md:grid-cols-2 gap-6">
                        {/* Rule breakdown */}
                        <div className="rounded-xl border border-line bg-paper p-4">
                            <h2 className="font-display text-lg mb-3">By rule, last 7 days</h2>
                            {data.ruleBreakdown.length === 0 ? (
                                <p className="text-ash text-sm">No flags raised in the past week.</p>
                            ) : (
                                <ul className="space-y-2.5">
                                    {data.ruleBreakdown.map((r) => (
                                        <li key={r.ruleCode} className="flex items-center justify-between gap-3">
                                            <div className="min-w-0">
                                                <p className="text-sm text-ink font-medium truncate">{ruleLabel(r.ruleCode)}</p>
                                                <p className="text-xs text-ash">baseline ~{r.baselineWeeklyRate}/week</p>
                                            </div>
                                            <span className={`text-xs font-semibold px-2 py-1 rounded-full shrink-0 ${
                                                r.isSpike
                                                    ? "bg-coral/12 text-coral border border-coral/25"
                                                    : "bg-line/40 text-ash border border-line"
                                            }`}>
                                                {r.recentCount} {r.isSpike && "· spike"}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>

                        {/* Open severity breakdown */}
                        <div className="rounded-xl border border-line bg-paper p-4">
                            <h2 className="font-display text-lg mb-3">Open queue by severity</h2>
                            {data.severityBreakdown.length === 0 ? (
                                <p className="text-ash text-sm">No open flags right now.</p>
                            ) : (
                                <ul className="space-y-2.5">
                                    {data.severityBreakdown.map((s) => (
                                        <li key={s.severity} className="flex items-center justify-between">
                                            <span className="text-sm text-ink capitalize">{s.severity}</span>
                                            <span className="text-sm font-semibold text-ink">{s.count}</span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </div>

                    {/* Top flagged entities */}
                    <div className="rounded-xl border border-line bg-paper p-4 mt-6">
                        <h2 className="font-display text-lg mb-3">Most-flagged entities (all time)</h2>
                        {data.topFlaggedEntities.length === 0 ? (
                            <p className="text-ash text-sm">No flags have been raised yet.</p>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="text-left text-xs text-ash uppercase tracking-wider border-b border-line">
                                            <th className="pb-2 pr-4 font-medium">Entity</th>
                                            <th className="pb-2 pr-4 font-medium">Who</th>
                                            <th className="pb-2 pr-4 font-medium">Flags</th>
                                            <th className="pb-2 pr-4 font-medium">Confirmed</th>
                                            <th className="pb-2 font-medium">Last flagged</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data.topFlaggedEntities.map((e) => (
                                            <tr key={`${e.entityType}-${e.entityId}`} className="border-b border-line/60 last:border-0">
                                                <td className="py-2 pr-4">{entityLink(e)}</td>
                                                <td className="py-2 pr-4 text-ash">
                                                    {e.personName || "—"}
                                                    {e.personEmail && <span className="text-ash/70"> · {e.personEmail}</span>}
                                                </td>
                                                <td className="py-2 pr-4 font-medium text-ink">{e.flagCount}</td>
                                                <td className="py-2 pr-4">{e.confirmedCount}</td>
                                                <td className="py-2 text-ash">{formatDate(e.lastFlaggedAt)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}
