import { useEffect, useMemo, useState } from "react";
import api from "../../api/client";
import { useSocket } from "../../context/SocketContext";
import { formatMoney } from "../../utils/format";
import Skeleton, { SkeletonList } from "../../components/Skeleton";
import AdminDispatchMap from "../../components/AdminDispatchMap";
import PageMeta from "../../components/PageMeta";
import EmptyState from "../../components/ui/EmptyState";

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


export default function AdminDispatch() {
    const { socket, connected, connectionState } = useSocket();
    const [deliveries, setDeliveries] = useState([]);
    const [agents, setAgents] = useState([]);
    const [summary, setSummary] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const loadOverview = () => {
        setLoading(true);
        api
            .get("/admin/dispatch")
            .then(({ data }) => {
                setDeliveries(data.data.deliveries);
                setAgents(data.data.agents);
                setSummary(data.data.summary);
                setError(null);
            })
            .catch(() => setError("Couldn't load the dispatch board. Try refreshing."))
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        loadOverview();
    }, []);

    
    useEffect(() => {
        if (!socket || !connected) return;

        const refresh = () => loadOverview();
        const handlePosition = ({ agentId, lat, lng }) => {
            setAgents((prev) =>
                prev.map((a) => (a.id === agentId ? { ...a, current_lat: lat, current_lng: lng } : a))
            );
        };

        socket.on("dispatch:delivery_assigned", refresh);
        socket.on("dispatch:delivery_status", refresh);
        socket.on("dispatch:agent_status", refresh);
        socket.on("dispatch:agent_position", handlePosition);

        return () => {
            socket.off("dispatch:delivery_assigned", refresh);
            socket.off("dispatch:delivery_status", refresh);
            socket.off("dispatch:agent_status", refresh);
            socket.off("dispatch:agent_position", handlePosition);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [socket, connected]);

    const delayedCount = summary?.delayed_deliveries ?? 0;
    const sortedDeliveries = useMemo(
        () => [...deliveries].sort((a, b) => (b.is_delayed ? 1 : 0) - (a.is_delayed ? 1 : 0)),
        [deliveries]
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
                    {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="border border-line rounded-lg p-4">
                            <Skeleton className="h-3 w-20 mb-2" />
                            <Skeleton className="h-7 w-12" />
                        </div>
                    ))}
                </div>

                <h2 className="font-display text-lg mb-3">Live map</h2>
                <Skeleton className="w-full h-72 mb-10" />

                <h2 className="font-display text-lg mb-3">Active deliveries</h2>
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
            </div>

            <h2 className="font-display text-lg mb-3">Live map</h2>
            <div className="mb-10">
                <AdminDispatchMap deliveries={sortedDeliveries} agents={agents} />
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

            <h2 className="font-display text-lg mb-3">Online agents</h2>
            {agents.length === 0 && <EmptyState title="No agents online right now." />}
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
