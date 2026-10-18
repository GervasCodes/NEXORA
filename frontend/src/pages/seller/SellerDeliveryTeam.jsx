import { useEffect, useState } from "react";
import api, { extractErrorMessage } from "../../api/client";
import PageLoader from "../../components/PageLoader";
import Button from "../../components/ui/Button";
import PageMeta from "../../components/PageMeta";
import { useToast } from "../../context/ToastContext";
import EmptyState from "../../components/ui/EmptyState";
import Avatar from "../../components/ui/Avatar";
import Input from "../../components/ui/Input";
import { useLanguage } from "../../context/LanguageContext";

export default function SellerDeliveryTeam() {
    const { t } = useLanguage();
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
            <PageMeta title={t("seller.deliveryTeam.title")} noIndex />
            <h1 className="font-display text-2xl mb-2">{t("seller.deliveryTeam.title")}</h1>
            <p className="text-sm text-ash mb-6">
                {t("seller.deliveryTeam.intro")}
            </p>

            <form onSubmit={handleAdd} className="flex gap-2 mb-8">
                <div className="flex-1">
                    <Input
                        type="email"
                        required
                        placeholder="agent@email.com"
                        aria-label={t("seller.deliveryTeam.emailAria")}
                        autoComplete="email"
                        inputMode="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                    />
                </div>
                <Button
                    type="submit"
                    disabled={submitting}
                >
                    {submitting ? t("seller.deliveryTeam.adding") : t("seller.deliveryTeam.add")}
                </Button>
            </form>


            {roster.length === 0 ? (
                <EmptyState title={t("seller.deliveryTeam.empty")} />
            ) : (
                <ul className="divide-y divide-line border-y border-line">
                    {roster.map((agent) => (
                        <li key={agent.id} className="py-3 flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3">
                                <Avatar firstName={agent.first_name} lastName={agent.last_name} src={agent.photo_url} size="sm" />
                                <div>
                                    <p className="text-sm font-medium">{agent.first_name} {agent.last_name}</p>
                                    <p className="text-xs text-ash">{agent.email}</p>
                                </div>
                            </div>
                            <button
                                onClick={() => handleRemove(agent.agent_id)}
                                disabled={busyId === agent.agent_id}
                                aria-label={t("seller.deliveryTeam.removeAria", { name: `${agent.first_name} ${agent.last_name}` })}
                                className="text-xs text-coral hover:underline disabled:opacity-50"
                            >
                                {t("seller.deliveryTeam.remove")}
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
