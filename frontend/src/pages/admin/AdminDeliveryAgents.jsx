import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api, { extractErrorMessage } from "../../api/client";
import { formatDate } from "../../utils/format";
import PageLoader from "../../components/PageLoader";
import Button from "../../components/ui/Button";
import PageMeta from "../../components/PageMeta";
import { useToast } from "../../context/ToastContext";
import EmptyState from "../../components/ui/EmptyState";

// Modeled directly on AdminSellers.jsx - the Trust & safety group had a
// roster page for Sellers but nothing equivalent for Delivery agents;
// agents only ever surfaced indirectly (dashboard counters, live
// dispatch, the shared verification queue). This is the missing
// first-class "browse every agent, see their status, act on it" view.
//
// Unlike a seller, an agent has no separate profile table - vehicle
// info and verification status live directly on their users row (see
// admin.repository.js#findAllDeliveryAgents) - so there's no
// profile_id here, just the user id.
//
// Verification itself (approve/reject a pending agent) already has a
// dedicated flow in the shared seller+agent queue at
// /admin/account-verifications - this page doesn't duplicate that
// action, it's for the ongoing roster view and account-level
// suspend/unsuspend, reusing the same generic user-suspend endpoint
// AdminUsers.jsx already uses.
const verificationStyles = {
    approved: "bg-teal/10 text-teal",
    pending: "bg-mango/20 text-mango-dark",
    rejected: "bg-coral/10 text-coral"
};

export default function AdminDeliveryAgents() {
    const [agents, setAgents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [busyId, setBusyId] = useState(null);
    const toast = useToast();

    const load = () => {
        api.get("/admin/delivery-agents").then(({ data }) => setAgents(data.data)).finally(() => setLoading(false));
    };

    useEffect(load, []);

    const handleSuspend = async (agent) => {
        const reason = window.prompt(
            `Why are you suspending ${agent.first_name} ${agent.last_name}? This is shown to the agent and kept on record.`
        );
        if (reason === null) return;
        if (!reason.trim()) {
            toast?.error("A reason is required to suspend an account.");
            return;
        }

        setBusyId(agent.id);
        try {
            await api.put(`/admin/users/${agent.id}/suspend`, { reason: reason.trim() });
            toast?.success(`${agent.first_name} ${agent.last_name} has been suspended.`);
            load();
        } catch (err) {
            toast?.error(extractErrorMessage(err));
        } finally {
            setBusyId(null);
        }
    };

    const handleUnsuspend = async (agent) => {
        setBusyId(agent.id);
        try {
            await api.put(`/admin/users/${agent.id}/unsuspend`);
            toast?.success(`${agent.first_name} ${agent.last_name} has been unsuspended.`);
            load();
        } catch (err) {
            toast?.error(extractErrorMessage(err));
        } finally {
            setBusyId(null);
        }
    };

    if (loading) return <PageLoader />;

    return (
        <div>
            <PageMeta title="Delivery agents" noIndex />
            <h1 className="font-display text-2xl mb-1">Delivery agents</h1>
            <p className="text-sm text-ash mb-6">
                Pending verification requests are handled from{" "}
                <Link to="/admin/account-verifications" className="text-teal hover:underline">Verifications</Link>.
                This is the full roster.
            </p>

            {agents.length === 0 && <EmptyState title="No delivery agents yet." />}

            <ul className="divide-y divide-line border-y border-line">
                {agents.map((a) => (
                    <li key={a.id} className="py-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                        <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">{a.first_name} {a.last_name}</p>
                            <p className="text-xs text-ash truncate">{a.email}{a.phone ? ` · ${a.phone}` : ""}</p>
                            {(a.vehicle_type || a.vehicle_plate_number) && (
                                <p className="text-xs text-ash capitalize">
                                    {[a.vehicle_type, a.vehicle_plate_number].filter(Boolean).join(" · ")}
                                </p>
                            )}
                            {a.suspended_at && (
                                <p className="text-xs text-coral">
                                    Suspended {formatDate(a.suspended_at)}
                                    {a.suspension_reason && ` — "${a.suspension_reason}"`}
                                </p>
                            )}
                        </div>

                        <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
                            <span className={`text-xs font-medium px-2 py-1 rounded-full capitalize ${verificationStyles[a.account_verification_status] || "bg-line text-ash"}`}>
                                {a.account_verification_status}
                            </span>

                            <span className={`text-xs font-medium px-2 py-1 rounded-full ${a.is_online ? "bg-teal/10 text-teal" : "bg-line text-ash"}`}>
                                {a.is_online ? "Online" : "Offline"}
                            </span>

                            <span className={`text-xs font-medium px-2 py-1 rounded-full ${a.is_active ? "bg-teal/10 text-teal" : "bg-coral/10 text-coral"}`}>
                                {a.is_active ? "Active account" : "Deactivated"}
                            </span>

                            <Button
                                onClick={() => (a.is_active ? handleSuspend(a) : handleUnsuspend(a))}
                                disabled={busyId === a.id}
                                variant="secondary"
                                size="sm"
                                className="w-full sm:w-auto"
                            >
                                {a.is_active ? "Suspend" : "Unsuspend"}
                            </Button>
                        </div>
                    </li>
                ))}
            </ul>
        </div>
    );
}
