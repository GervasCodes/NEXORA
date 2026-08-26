import { useEffect, useState } from "react";
import api, { extractErrorMessage } from "../../api/client";
import PageLoader from "../../components/PageLoader";
import Button from "../../components/ui/Button";
import PageMeta from "../../components/PageMeta";
import { useToast } from "../../context/ToastContext";
import EmptyState from "../../components/ui/EmptyState";
import Avatar from "../../components/ui/Avatar";

export default function SellerDeliveryTeam() {
    const [roster, setRoster] = useState([]);
    const [loading, setLoading] = useState(true);
    const [email, setEmail] = useState("");
    const toast = useToast();
    const [submitting, setSubmitting] = useState(false);
    const [busyId, setBusyId] = useState(null);

    const load = () => {
        api.get("/seller/delivery-agents")
            .then(({ data }) => setRoster(data.data))
            .finally(() => setLoading(false));
    };

    useEffect(load, []);

    const handleAdd = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            await api.post("/seller/delivery-agents", { email });
            setEmail("");
            load();
        } catch (err) {
            toast?.error(extractErrorMessage(err));
        } finally {
            setSubmitting(false);
        }
    };

    const handleRemove = async (agentId) => {
        setBusyId(agentId);
        try {
            await api.delete(`/seller/delivery-agents/${agentId}`);
            load();
        } catch (err) {
            toast?.error(extractErrorMessage(err));
        } finally {
            setBusyId(null);
        }
    };

    if (loading) return <PageLoader />;

    return (
        <div className="max-w-lg">
            <PageMeta title="Delivery Team" noIndex />
            <h1 className="font-display text-2xl mb-2">Delivery team</h1>
            <p className="text-sm text-ash mb-6">
                Add your own hired delivery staff here. When you mark an order as shipped,
                you can hand it straight to one of them instead of the open platform pool
                — they still need their own NEXORA delivery agent account first.
            </p>

            <form onSubmit={handleAdd} className="flex gap-2 mb-8">
                <input
                    type="email"
                    required
                    placeholder="agent@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="flex-1 border border-line rounded-md px-3 py-2 text-sm focus-ring"
                />
                <Button
                    type="submit"
                    disabled={submitting}
                >
                    {submitting ? "Adding…" : "Add"}
                </Button>
            </form>


            {roster.length === 0 ? (
                <EmptyState title="No agents added yet." />
            ) : (
                <ul className="divide-y divide-line border-y border-line">
                    {roster.map((agent) => (
                        <li key={agent.id} className="py-3 flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3">
                                <Avatar firstName={agent.first_name} lastName={agent.last_name} size="sm" />
                                <div>
                                    <p className="text-sm font-medium">{agent.first_name} {agent.last_name}</p>
                                    <p className="text-xs text-ash">{agent.email}</p>
                                </div>
                            </div>
                            <button
                                onClick={() => handleRemove(agent.agent_id)}
                                disabled={busyId === agent.agent_id}
                                className="text-xs text-coral hover:underline disabled:opacity-50"
                            >
                                Remove
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
