import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api, { extractErrorMessage } from "../../api/client";
import { formatMoney, formatDate } from "../../utils/format";
import NexoraFraudExplain from "../../components/ai/NexoraFraudExplain";
import PageMeta from "../../components/PageMeta";

const SEVERITY_CONFIG = {
    high: {
        pill: "bg-coral/12 text-coral border border-coral/25",
        bar: "bg-coral",
        icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-3 h-3">
                <path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
        )
    },
    medium: {
        pill: "bg-mango/12 text-mango-dark border border-mango/25",
        bar: "bg-mango",
        icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-3 h-3">
                <circle cx="12" cy="12" r="10" /><path d="M12 8v4m0 4h.01" />
            </svg>
        )
    },
    low: {
        pill: "bg-line/60 text-ash border border-line",
        bar: "bg-ash/40",
        icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-3 h-3">
                <circle cx="12" cy="12" r="10" /><path d="M12 16v-4m0-4h.01" />
            </svg>
        )
    }
};

function FlagCard({ flag, busy, onResolve }) {
    const cfg = SEVERITY_CONFIG[flag.severity] ?? SEVERITY_CONFIG.low;
    const isOrder = flag.entity_type === "order";

    return (
        <li className="rounded-xl border border-line bg-paper hover:border-line/80 transition-colors overflow-hidden">
            {/* Severity accent bar */}
            <div className={`h-0.5 w-full ${cfg.bar}`} />

            <div className="p-4">
                <div className="flex items-start justify-between gap-4 mb-3">
                    <div className="min-w-0">
                        {/* Severity pill */}
                        <span className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full mb-2 ${cfg.pill}`}>
                            {cfg.icon}
                            {flag.severity}
                        </span>

                        {/* Entity label */}
                        <p className="text-sm font-semibold text-ink">
                            {isOrder ? (
                                <>
                                    Order {flag.order_number}
                                    <span className="ml-1.5 font-normal text-ash text-xs">
                                        {formatMoney(flag.order_amount)}
                                    </span>
                                </>
                            ) : (
                                "Seller withdrawal"
                            )}
                        </p>

                        {/* Person */}
                        <p className="text-xs text-ash mt-0.5 truncate">
                            {flag.person_first_name} {flag.person_last_name}
                            <span className="mx-1.5 opacity-40">·</span>
                            {flag.person_email}
                        </p>
                    </div>

                    <time className="text-[11px] text-ash whitespace-nowrap shrink-0 mt-0.5">
                        {formatDate(flag.created_at)}
                    </time>
                </div>

                {/* Reason */}
                <p className="text-sm text-ink/90 leading-relaxed mb-4 py-2.5 px-3 bg-line/20 rounded-lg border-l-2 border-ash/30">
                    {flag.reason}
                </p>

                {/* Actions */}
                <div className="flex items-center gap-2 flex-wrap">
                    {isOrder && (
                        <Link
                            to="/admin/orders"
                            className="text-xs text-azure hover:underline flex items-center gap-1 mr-1"
                        >
                            View order
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-3 h-3">
                                <path d="m9 18 6-6-6-6" />
                            </svg>
                        </Link>
                    )}

                    <button
                        onClick={() => onResolve(flag.id, "dismissed")}
                        disabled={busy}
                        className="text-xs px-3 py-1.5 rounded-lg border border-line hover:border-ink/40 hover:bg-line/30 transition-all disabled:opacity-50"
                    >
                        {busy ? "Working…" : "Dismiss"}
                    </button>

                    <button
                        onClick={() => onResolve(flag.id, "confirmed")}
                        disabled={busy}
                        className="text-xs px-3 py-1.5 rounded-lg bg-coral text-white hover:opacity-90 active:scale-95 transition-all disabled:opacity-50 font-medium"
                    >
                        {busy ? "Working…" : "Confirm fraud"}
                    </button>
                </div>
            </div>
        </li>
    );
}

export default function AdminFraud() {
    const [flags, setFlags] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [busyId, setBusyId] = useState(null);
    const [aiRefresh, setAiRefresh] = useState(0);

    const load = () => {
        api.get("/admin/fraud-flags")
            .then(({ data }) => setFlags(data.data))
            .catch(() => setError("Couldn't load fraud flags."))
            .finally(() => setLoading(false));
    };

    useEffect(load, []);

    const resolve = async (id, status) => {
        setBusyId(id);
        try {
            await api.put(`/admin/fraud-flags/${id}/resolve`, { status });
            setFlags((prev) => prev.filter((f) => f.id !== id));
            setAiRefresh((n) => n + 1);
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setBusyId(null);
        }
    };

    const highCount = flags.filter((f) => f.severity === "high").length;
    const medCount = flags.filter((f) => f.severity === "medium").length;

    return (
        <div>
            <PageMeta title="Fraud Review" noIndex />

            {/* Page header */}
            <div className="mb-6">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <h1 className="font-display text-2xl mb-1">Fraud review</h1>
                        <p className="text-ash text-sm leading-relaxed max-w-xl">
                            Rule-based flags using explainable heuristics — first-order size, order velocity,
                            withdrawal outliers. Every flag has a plain-English reason attached.
                        </p>
                    </div>

                    {/* Stats chips */}
                    {!loading && flags.length > 0 && (
                        <div className="flex items-center gap-2 shrink-0">
                            {highCount > 0 && (
                                <span className="text-xs font-semibold bg-coral/10 text-coral border border-coral/25 px-2.5 py-1 rounded-full">
                                    {highCount} high
                                </span>
                            )}
                            {medCount > 0 && (
                                <span className="text-xs font-semibold bg-mango/10 text-mango-dark border border-mango/25 px-2.5 py-1 rounded-full">
                                    {medCount} medium
                                </span>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* AI queue summary */}
            {!loading && <NexoraFraudExplain refreshToken={aiRefresh} />}

            {/* States */}
            {loading && (
                <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                        <div key={i} className="rounded-xl border border-line h-28 animate-pulse bg-line/20" />
                    ))}
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

            {!loading && flags.length === 0 && !error && (
                <div className="text-center py-16 text-ash">
                    <div className="w-12 h-12 rounded-full bg-teal/10 flex items-center justify-center mx-auto mb-3">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="w-6 h-6 text-teal">
                            <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    </div>
                    <p className="font-medium text-ink mb-1">All clear</p>
                    <p className="text-sm">No open fraud flags right now.</p>
                </div>
            )}

            <ul className="space-y-3">
                {flags.map((flag) => (
                    <FlagCard
                        key={flag.id}
                        flag={flag}
                        busy={busyId === flag.id}
                        onResolve={resolve}
                    />
                ))}
            </ul>
        </div>
    );
}
