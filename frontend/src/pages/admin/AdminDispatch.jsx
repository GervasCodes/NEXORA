import { useEffect, useMemo, useState } from "react";
import api from "../../api/client";
import { useSocket } from "../../context/SocketContext";
import { formatMoney } from "../../utils/format";

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

// Admin-only, real-time dispatch board (Phase 6). Loads an initial
// snapshot over REST (GET /admin/dispatch - see admin.service.js's
// getDispatchOverview), then layers live updates on top via the shared
// socket connection joined to the "admins" room (see socket.js) -
// dispatch:delivery_assigned / dispatch:delivery_status /
// dispatch:agent_status / dispatch:agent_position.
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

    // Live updates. Rather than patch every field of every event type in
    // by hand, a matching event just triggers a fresh REST fetch - the
    // dispatch board isn't so high-frequency (a handful of admins, a few
    // dozen active deliveries at most) that this is wasteful, and it
    // guarantees the delayed-flag/summary counts (computed server-side)
    // never drift out of sync with what actually changed.
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

    if (loading) return <p className="text-ash">Loading dispatch board…</p>;

    return (
        <div>
            <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
                <h1 className="font-display text-2xl">Dispatch dashboard</h1>
                <span className={`text-xs px-2.5 py-1 rounded-full ${connected ? "bg-teal/10 text-teal" : "bg-coral/10 text-coral"}`}>
                    {connected ? "Live" : connectionState === "reconnecting" ? "Reconnecting…" : "Offline"}
                </span>
            </div>

            {error && <p role="alert" className="text-coral text-sm mb-4">{error}</p>}

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
                <SummaryCard label="Active deliveries" value={summary?.active_deliveries ?? 0} />
                <SummaryCard label="Delayed" value={delayedCount} tone={delayedCount > 0 ? "coral" : undefined} />
                <SummaryCard label="Online agents" value={summary?.online_agents ?? 0} />
                <SummaryCard label="Idle agents" value={summary?.idle_agents ?? 0} />
            </div>

            <h2 className="font-display text-lg mb-3">Active deliveries</h2>
            {sortedDeliveries.length === 0 && <p className="text-ash text-sm mb-8">No active deliveries right now.</p>}
            {sortedDeliveries.length > 0 && (
                <ul className="divide-y divide-line border-y border-line mb-10">
                    {sortedDeliveries.map((d) => (
                        <li key={d.id} className="py-3 flex flex-wrap items-center gap-3">
                            <div className="min-w-0 flex-1">
                                <p className="price text-sm font-medium">{d.order_number}</p>
                                <p className="text-xs text-ash truncate">
                                    {d.agent_first_name} {d.agent_last_name} · {d.shipping_city || d.shipping_region || "—"}
                                </p>
                            </div>

                            <span className={`text-xs font-medium px-2.5 py-1 rounded-full capitalize ${statusStyles[d.status] || "bg-line text-ash"}`}>
                                {statusLabels[d.status] || d.status}
                            </span>

                            <p className="text-xs text-ash w-24 text-right">Assigned {timeSince(d.assigned_at)}</p>

                            {d.is_delayed ? (
                                <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-coral text-white">Delayed</span>
                            ) : (
                                <span className="text-xs text-ash w-16 text-right">On time</span>
                            )}

                            <p className="price text-sm font-medium w-20 text-right">{formatMoney(d.delivery_fee)}</p>
                        </li>
                    ))}
                </ul>
            )}

            <h2 className="font-display text-lg mb-3">Online agents</h2>
            {agents.length === 0 && <p className="text-ash text-sm">No agents online right now.</p>}
            {agents.length > 0 && (
                <ul className="divide-y divide-line border-y border-line">
                    {agents.map((a) => (
                        <li key={a.id} className="py-3 flex flex-wrap items-center gap-3">
                            <div className="min-w-0 flex-1">
                                <p className="price text-sm font-medium">{a.first_name} {a.last_name}</p>
                                <p className="text-xs text-ash truncate capitalize">{a.vehicle_type || "—"}</p>
                            </div>

                            <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${Number(a.active_delivery_count) > 0 ? "bg-mango/20 text-mango-dark" : "bg-teal/10 text-teal"}`}>
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

function SummaryCard({ label, value, tone }) {
    return (
        <div className="glass border border-line rounded-lg px-4 py-3">
            <p className="text-xs text-ash mb-1">{label}</p>
            <p className={`font-display text-2xl ${tone === "coral" && value > 0 ? "text-coral" : ""}`}>{value}</p>
        </div>
    );
}
