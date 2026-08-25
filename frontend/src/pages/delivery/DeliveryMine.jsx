import { useEffect, useState } from "react";
import api, { extractErrorMessage } from "../../api/client";
import PageLoader from "../../components/PageLoader";
import Button from "../../components/ui/Button";
import NexoraRouteAssist from "../../components/ai/NexoraRouteAssist";
import PageMeta from "../../components/PageMeta";
import { useLanguage } from "../../context/LanguageContext";
import { useToast } from "../../context/ToastContext";

const NEXT_STATUS = {
    assigned: [{ value: "picked_up", labelKey: "delivery.agent.mine.markPickedUp" }, { value: "failed", labelKey: "delivery.agent.mine.reportFailed" }],
    picked_up: [{ value: "in_transit", labelKey: "delivery.agent.mine.markInTransit" }, { value: "failed", labelKey: "delivery.agent.mine.reportFailed" }],
    in_transit: [{ value: "delivered", labelKey: "delivery.agent.mine.markDelivered" }, { value: "failed", labelKey: "delivery.agent.mine.reportFailed" }]
};

const statusStyles = {
    assigned: "bg-line text-ash",
    picked_up: "bg-mango/20 text-mango-dark",
    in_transit: "bg-teal/10 text-teal",
    delivered: "bg-teal text-white",
    failed: "bg-coral/10 text-coral"
};

export default function DeliveryMine() {
    const { t } = useLanguage();
    const [deliveries, setDeliveries] = useState([]);
    const [loading, setLoading] = useState(true);
    const [busyId, setBusyId] = useState(null);
    const toast = useToast();
    const [routeRefresh, setRouteRefresh] = useState(0);

    const load = () => {
        api.get("/delivery/my/list").then(({ data }) => setDeliveries(data.data)).finally(() => setLoading(false));
    };

    useEffect(load, []);

    const updateStatus = async (orderId, status) => {
        setBusyId(orderId);
        try {
            await api.put(`/delivery/${orderId}/status`, { status });
            load();
            setRouteRefresh((t) => t + 1);
        } catch (err) {
            toast?.error(extractErrorMessage(err));
        } finally {
            setBusyId(null);
        }
    };

    if (loading) return <PageLoader />;

    if (deliveries.length === 0) {
        return <p className="text-ash text-sm">{t("delivery.agent.mine.empty")}</p>;
    }

    return (
        <div>
            <PageMeta title="My Deliveries" noIndex />

            <NexoraRouteAssist refreshToken={routeRefresh} />

            <ul className="space-y-4">
                {deliveries.map((d) => (
                    <li key={d.id} className="border border-line rounded-lg p-4">
                        <div className="flex items-center justify-between gap-3 mb-2">
                            <p className="price text-sm font-medium">{d.order_number}</p>
                            <span className={`text-xs font-medium px-2 py-1 rounded-full capitalize ${statusStyles[d.status] || "bg-line text-ash"}`}>
                                {d.status.replace("_", " ")}
                            </span>
                        </div>

                        <p className="text-sm text-ink/80 mb-1">
                            {d.shipping_address}, {d.shipping_city}, {d.shipping_region}
                        </p>
                        <p className="text-xs text-ash mb-3">{t("delivery.agent.mine.contact")}: {d.shipping_phone}</p>

                        <div className="flex gap-2">
                            {(NEXT_STATUS[d.status] || []).map((next) => (
                                <Button
                                    key={next.value}
                                    onClick={() => updateStatus(d.order_id, next.value)}
                                    disabled={busyId === d.order_id}
                                    variant="secondary"
                                    size="sm"
                                >
                                    {t(next.labelKey)}
                                </Button>
                            ))}
                        </div>
                    </li>
                ))}
            </ul>
        </div>
    );
}
