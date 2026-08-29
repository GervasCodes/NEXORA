import { useEffect, useMemo, useState } from "react";
import api from "../../api/client";
import { useSocket } from "../../context/SocketContext";
import { formatMoney } from "../../utils/format";
import Skeleton, { SkeletonList } from "../../components/Skeleton";
import AdminDispatchMap from "../../components/AdminDispatchMap";
import AdminCoverageHeatmap from "../../components/AdminCoverageHeatmap";
import PageMeta from "../../components/PageMeta";

const statusStyles = {
    assigned: "bg-line text-ash",
    picked_up: "bg-mango/20 text-mango-dark",
    in_transit: "bg-teal/10 text-teal"
};

const statusLabels = {
    assigned: "Assigned",
    picked_up: "Picked up",
    in_transit: "In transit"
};

const timeSince = (isoString) => {
    if (!isoString) return "—";
    const minutes = Math.max(0, Math.round((Date.now() - new Date(isoString).getTime()) / 60000));
    if (minutes < 60) return `${minutes}m ago`;
    return `${Math.floor(minutes / 60)}h ${minutes % 60}m ago`;
};

// Phase 3 (Admin Manual Override & Ops Visibility) - same "Nm ago" shape
// as timeSince above, but for a plain minute count (admin.service.js
// already computes minutes_waiting server-side via TIMESTAMPDIFF, so
// there's no timestamp to diff against here).
const minutesLabel = (minutes) => {
    const m = Number(minutes) || 0;
    if (m < 60) return `${m}m`;
    return `${Math.floor(m / 60)}h ${m % 60}m`;
};


export default function AdminDispatch() {
    const { socket, connected, connectionState } = useSocket();
    const [deliveries, setDeliveries] = useState([]);
    const [agents, setAgents] = useState([]);
    const [unmatchedOrders, setUnmatchedOrders] = useState([]);
    const [summary, setSummary] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Phase 3 (Admin Manual Override & Ops Visibility) - toggles the
    // unmatched-orders list between "everything waiting" and "only the
    // ones past the stalled threshold" (see admin.service.js's
    // STALLED_ORDER_MINUTES), same is_stalled flag the map's stalled
    // pins already key off.
    const [showStalledOnly, setShowStalledOnly] = useState(false);
    // Per-order selected agent id for the manual-assign dropdown, and
    // per-order in-flight/result state - same shape AdminOrders.jsx uses
    // for its release-escrow action (a plain id->value map, not a
    // single global "assigning" flag, so acting on one row doesn't
    // disable the others).
    const [selectedAgentByOrder, setSelectedAgentByOrder] = useState({});
    const [assigningOrderId, setAssigningOrderId] = useState(null);
    const [assignMessages, setAssignMessages] = useState({});

    // `silent` skips the loading flag entirely - used for socket-triggered
    // refreshes below so they update state in place instead of re-showing
    // the full-page skeleton (see comment above the `if (loading)` block).
    const loadOverview = (silent = false) => {
        if (!silent) setLoading(true);
        api
            .get("/admin/dispatch")
            .then(({ data }) => {
                setDeliveries(data.data.deliveries);
                setAgents(data.data.agents);
                setUnmatchedOrders(data.data.unmatchedOrders || []);
                setSummary(data.data.summary);
                setError(null);
            })
            .catch(() => setError("Couldn't load the dispatch board. Try refreshing."))
            .finally(() => {
                if (!silent) setLoading(false);
            });
    };

    useEffect(() => {
        loadOverview();
    }, []);

    
    useEffect(() => {
        if (!socket || !connected) return;

        const refresh = () => loadOverview(true);
        const handlePosition = ({ agentId, lat, lng }) => {
            setAgents((prev) =>
                prev.map((a) => (a.id === agentId ? { ...a, current_lat: lat, current_lng: lng } : a))
            );
        };

        socket.on("dispatch:delivery_assigned", refresh);
        socket.on("dispatch:delivery_status", refresh);
        socket.on("dispatch:agent_status", refresh);
        socket.on("dispatch:agent_position", handlePosition);
        // Phase 3: an order widening its search radius or exhausting
        // every radius step (see delivery.service.js's
        // offerToNextCandidate) doesn't change who's assigned to what,
        // but it can move an order into/out of the manual pool this
        // board now shows - worth a refresh same as the others above.
        socket.on("dispatch:still_searching", refresh);

        return () => {
            socket.off("dispatch:delivery_assigned", refresh);
            socket.off("dispatch:delivery_status", refresh);
            socket.off("dispatch:agent_status", refresh);
            socket.off("dispatch:agent_position", handlePosition);
            socket.off("dispatch:still_searching", refresh);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [socket, connected]);

    // Phase 3 (Admin Manual Override) - assigns the order to whichever
    // agent is currently selected in that row's dropdown. Mirrors
    // AdminOrders.jsx's releaseEscrow: per-row loading flag + a
    // dismissable inline result/error message under that row, not a
    // page-wide toast.
    const assignOrder = async (orderId) => {
        const agentId = selectedAgentByOrder[orderId];
        if (!agentId) {
            setAssignMessages((msgs) => ({ ...msgs, [orderId]: "Pick an agent first." }));
            return;
        }

        setAssigningOrderId(orderId);
        setAssignMessages((msgs) => ({ ...msgs, [orderId]: "" }));
        try {
            await api.put(`/admin/dispatch/${orderId}/assign`, { agentId });
            setUnmatchedOrders((prev) => prev.filter((o) => o.order_id !== orderId));
            loadOverview(true);
        } catch (err) {
            setAssignMessages((msgs) => ({
                ...msgs,
                [orderId]: err.response?.data?.message || "Couldn't assign this order."
            }));
        } finally {
            setAssigningOrderId(null);
        }
    };

    const delayedCount = summary?.delayed_deliveries ?? 0;
    const sortedDeliveries = useMemo(
        () => [...deliveries].sort((a, b) => (b.is_delayed ? 1 : 0) - (a.is_delayed ? 1 : 0)),
        [deliveries]
    );
    const visibleUnmatchedOrders = useMemo(
        () => (showStalledOnly ? unmatchedOrders.filter((o) => o.is_stalled) : unmatchedOrders),
        [unmatchedOrders, showStalledOnly]
    );

    // Skeleton mirrors the real page's shape (header, 4 summary cards,
    // map, 2 lists) rather than a full-page blocking spinner - Phase 8
    // UX Polish ("heavy dashboards" / "Admin Dispatch Map" call-outs).
    // Live-updates via the socket connection below don't touch `loading`
    // again after the first load, so this only ever shows once per page
    // visit, not on every real-time refresh.
    if (loading) {
        return (
            <div className="animate-fade-in">
                <div className="flex items-center justify-between mb-6">
                    <h1 className="font-display text-2xl">Dispatch dashboard</h1>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
                    {Array.from({ length: 6 }).map((_, i) => (
                        <div key={i} className="border border-line rounded-lg p-4">
                            <Skeleton className="h-3 w-20 mb-2" />
                            <Skeleton className="h-7 w-12" />
                        </div>
                    ))}
                </div>

                <h2 className="font-display text-lg mb-3">Live map</h2>
                <Skeleton className="w-full h-72 mb-10" />

                <h2 className="font-display text-lg mb-3">Coverage forecast</h2>
                <Skeleton className="w-full h-64 mb-10" />

                <h2 className="font-display text-lg mb-3">Active deliveries</h2>
                <SkeletonList rows={3} />

                <h2 className="font-display text-lg mt-10 mb-3">Unmatched orders</h2>
                <SkeletonList rows={3} />

                <h2 className="font-display text-lg mt-10 mb-3">Online agents</h2>
                <SkeletonList rows={3} />
            </div>
        );
    }

    return (
        <div className="animate-fade-in">
            <PageMeta title="Dispatch" noIndex />
            <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
                <h1 className="font-display text-2xl">Dispatch dashboard</h1>
                <span className={`text-xs px-2.5 py-1 rounded-full flex items-center gap-1.5 transition-colors ${connected ? "bg-teal/10 text-teal" : "bg-coral/10 text-coral"}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${connected ? "bg-teal animate-pulse" : "bg-coral"}`} />
                    {connected ? "Live" : connectionState === "reconnecting" ? "Reconnecting…" : "Offline"}
                </span>
            </div>

            {error && <p role="alert" className="text-coral text-sm mb-4 animate-slide-down">{error}</p>}

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
                <SummaryCard label="Active deliveries" value={summary?.active_deliveries ?? 0} delay={0} />
                <SummaryCard label="Delayed" value={delayedCount} tone={delayedCount > 0 ? "coral" : undefined} delay={40} />
                <SummaryCard label="Online agents" value={summary?.online_agents ?? 0} delay={80} />
                <SummaryCard label="Idle agents" value={summary?.idle_agents ?? 0} delay={120} />
                <SummaryCard label="Unmatched orders" value={summary?.unmatched_orders ?? 0} delay={160} />
                <SummaryCard
                    label="Stalled"
                    value={summary?.stalled_orders ?? 0}
                    tone={(summary?.stalled_orders ?? 0) > 0 ? "coral" : undefined}
                    delay={200}
                />
            </div>

            <h2 className="font-display text-lg mb-3">Live map</h2>
            <div className="mb-10">
                <AdminDispatchMap deliveries={sortedDeliveries} agents={agents} unmatchedOrders={unmatchedOrders} />
            </div>

            {/* Roadmap Phase 4 (Predictive Coverage Dashboard for Ops) -
                separate read-only historical view; doesn't touch the
                live map/socket state above it at all. */}
            <h2 className="font-display text-lg mb-3">Coverage forecast</h2>
            <div className="mb-10">
                <AdminCoverageHeatmap />
            </div>

            <h2 className="font-display text-lg mb-3">Active deliveries</h2>
            {sortedDeliveries.length === 0 && <p className="text-ash text-sm mb-8">No active deliveries right now.</p>}
            {sortedDeliveries.length > 0 && (
                <ul className="divide-y divide-line border-y border-line mb-10">
                    {sortedDeliveries.map((d) => (
                        <li key={d.id} className="py-3 flex flex-wrap items-center gap-3 px-2 -mx-2 rounded-md transition-colors hover:bg-line/30">
                            <div className="min-w-0 flex-1">
                                <p className="price text-sm font-medium">{d.order_number}</p>
                                <p className="text-xs text-ash truncate">
                                    {d.agent_first_name} {d.agent_last_name} · {d.shipping_city || d.shipping_region || "—"}
                                </p>
                            </div>

                            <span className={`text-xs font-medium px-2.5 py-1 rounded-full capitalize transition-colors ${statusStyles[d.status] || "bg-line text-ash"}`}>
                                {statusLabels[d.status] || d.status}
                            </span>

                            <p className="text-xs text-ash w-24 text-right">Assigned {timeSince(d.assigned_at)}</p>

                            {d.is_delayed ? (
                                <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-coral text-white animate-pulse">Delayed</span>
                            ) : (
                                <span className="text-xs text-ash w-16 text-right">On time</span>
                            )}

                            <p className="price text-sm font-medium w-20 text-right">{formatMoney(d.delivery_fee)}</p>
                        </li>
                    ))}
                </ul>
            )}

            <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
                <h2 className="font-display text-lg">Unmatched orders</h2>
                <button
                    type="button"
                    onClick={() => setShowStalledOnly((v) => !v)}
                    className={`text-xs font-medium px-2.5 py-1 rounded-full transition-colors ${showStalledOnly ? "bg-coral text-white" : "bg-line text-ash"}`}
                >
                    {showStalledOnly ? "Showing stalled only" : "Show stalled only"}
                </button>
            </div>
            {visibleUnmatchedOrders.length === 0 && (
                <p className="text-ash text-sm mb-8">
                    {showStalledOnly ? "No stalled orders right now." : "No unmatched orders right now."}
                </p>
            )}
            {visibleUnmatchedOrders.length > 0 && (
                <ul className="divide-y divide-line border-y border-line mb-10">
                    {visibleUnmatchedOrders.map((o) => (
                        <li key={o.order_id} className="py-3 flex flex-wrap items-center gap-3 px-2 -mx-2 rounded-md transition-colors hover:bg-line/30">
                            <div className="min-w-0 flex-1">
                                <p className="price text-sm font-medium">{o.order_number}</p>
                                <p className="text-xs text-ash truncate">
                                    {o.shipping_city || o.shipping_region || "—"} · Waiting {minutesLabel(o.minutes_waiting)}
                                </p>
                            </div>

                            {o.is_stalled ? (
                                <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-coral text-white">Stalled</span>
                            ) : (
                                <span className="text-xs text-ash">Waiting</span>
                            )}

                            <p className="price text-sm font-medium w-20 text-right">{formatMoney(o.total_amount)}</p>

                            <select
                                value={selectedAgentByOrder[o.order_id] || ""}
                                onChange={(e) =>
                                    setSelectedAgentByOrder((prev) => ({ ...prev, [o.order_id]: e.target.value }))
                                }
                                className="text-xs border border-line rounded-md px-2 py-1.5 bg-white"
                            >
                                <option value="">Assign to…</option>
                                {agents.map((a) => (
                                    <option key={a.id} value={a.id}>
                                        {a.first_name} {a.last_name}
                                        {Number(a.active_delivery_count) > 0 ? ` (busy · ${a.active_delivery_count})` : " (idle)"}
                                    </option>
                                ))}
                            </select>

                            <button
                                type="button"
                                onClick={() => assignOrder(o.order_id)}
                                disabled={assigningOrderId === o.order_id}
                                className="text-xs font-medium px-3 py-1.5 rounded-md bg-teal text-white disabled:opacity-50 transition-opacity"
                            >
                                {assigningOrderId === o.order_id ? "Assigning…" : "Assign"}
                            </button>

                            {assignMessages[o.order_id] && (
                                <p className="text-xs text-coral w-full">{assignMessages[o.order_id]}</p>
                            )}
                        </li>
                    ))}
                </ul>
            )}

            <h2 className="font-display text-lg mb-3">Online agents</h2>
            {agents.length === 0 && <p className="text-ash text-sm">No agents online right now.</p>}
            {agents.length > 0 && (
                <ul className="divide-y divide-line border-y border-line">
                    {agents.map((a) => (
                        <li key={a.id} className="py-3 flex flex-wrap items-center gap-3 px-2 -mx-2 rounded-md transition-colors hover:bg-line/30">
                            <div className="min-w-0 flex-1">
                                <p className="price text-sm font-medium">{a.first_name} {a.last_name}</p>
                                <p className="text-xs text-ash truncate capitalize">{a.vehicle_type || "—"}</p>
                            </div>

                            <span className={`text-xs font-medium px-2.5 py-1 rounded-full transition-colors ${Number(a.active_delivery_count) > 0 ? "bg-mango/20 text-mango-dark" : "bg-teal/10 text-teal"}`}>
                                {Number(a.active_delivery_count) > 0 ? `Busy · ${a.active_delivery_count}` : "Idle"}
                            </span>

                            <p className="text-xs text-ash w-28 text-right">
                                {a.current_lat != null ? `${Number(a.current_lat).toFixed(3)}, ${Number(a.current_lng).toFixed(3)}` : "No location"}
                            </p>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

function SummaryCard({ label, value, tone, delay = 0 }) {
    return (
        <div
            className="glass border border-line rounded-lg px-4 py-3 animate-slide-up hover:-translate-y-0.5 hover:shadow-md transition-all"
            style={{ animationDelay: `${delay}ms` }}
        >
            <p className="text-xs text-ash mb-1">{label}</p>
            <p className={`font-display text-2xl ${tone === "coral" && value > 0 ? "text-coral" : ""}`}>{value}</p>
        </div>
    );
}
