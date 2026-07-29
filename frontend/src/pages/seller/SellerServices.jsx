import { useEffect, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import api, { extractErrorMessage } from "../../api/client";
import { formatMoney } from "../../utils/format";

// Shown when the seller's merchant_type is still 'product' - Nexora
// Services (migration 062) is opt-in, so nothing changes for an existing
// seller until they choose one of these.
function MerchantTypeGate({ onSwitch, switching, error }) {
    return (
        <div>
            <h1 className="font-display text-2xl mb-2">Services</h1>
            <p className="text-ash text-sm mb-6 max-w-md">
                Offer bookable services - accommodation, transportation, tours,
                event spaces and more - from the same NEXORA account you already
                sell products from.
            </p>

            {error && <p role="alert" className="text-coral text-sm mb-4">{error}</p>}

            <div className="grid sm:grid-cols-2 gap-4 max-w-xl">
                <button
                    type="button"
                    disabled={switching}
                    onClick={() => onSwitch("hybrid")}
                    className="text-left border border-line rounded-lg p-4 hover:border-ink transition-colors disabled:opacity-60"
                >
                    <p className="font-medium text-sm mb-1">Add Services</p>
                    <p className="text-xs text-ash">Keep selling products, and start offering services too.</p>
                </button>

                <button
                    type="button"
                    disabled={switching}
                    onClick={() => onSwitch("service")}
                    className="text-left border border-line rounded-lg p-4 hover:border-ink transition-colors disabled:opacity-60"
                >
                    <p className="font-medium text-sm mb-1">Switch to Services only</p>
                    <p className="text-xs text-ash">Your store becomes a service provider instead of a product seller.</p>
                </button>
            </div>
        </div>
    );
}

export default function SellerServices() {
    const { profile, refreshProfile } = useOutletContext();

    const [services, setServices] = useState([]);
    const [loading, setLoading] = useState(true);
    const [busyId, setBusyId] = useState(null);
    const [switching, setSwitching] = useState(false);
    const [switchError, setSwitchError] = useState("");

    const isProvider = profile?.merchant_type === "service" || profile?.merchant_type === "hybrid";

    const load = () => {
        if (!isProvider) {
            setLoading(false);
            return;
        }
        setLoading(true);
        api.get("/services/mine/list").then(({ data }) => setServices(data.data)).finally(() => setLoading(false));
    };

    useEffect(load, [isProvider]);

    const handleSwitch = async (merchantType) => {
        setSwitching(true);
        setSwitchError("");
        try {
            await api.put("/seller/merchant-type", { merchant_type: merchantType });
            await refreshProfile?.();
        } catch (err) {
            setSwitchError(extractErrorMessage(err));
        } finally {
            setSwitching(false);
        }
    };

    const togglePublish = async (service) => {
        setBusyId(service.id);
        try {
            await api.put(`/services/${service.id}/${service.status === "published" ? "unpublish" : "publish"}`);
            load();
        } catch (err) {
            setSwitchError(extractErrorMessage(err));
        } finally {
            setBusyId(null);
        }
    };

    const toggleActive = async (service) => {
        setBusyId(service.id);
        try {
            await api.put(`/services/${service.id}/${service.is_active ? "deactivate" : "activate"}`);
            load();
        } finally {
            setBusyId(null);
        }
    };

    if (!isProvider) {
        return <MerchantTypeGate onSwitch={handleSwitch} switching={switching} error={switchError} />;
    }

    if (loading) return <p className="text-ash">Loading services…</p>;

    return (
        <div>
            <div className="flex items-center justify-between mb-6">
                <h1 className="font-display text-2xl">Your services</h1>
                <Link to="/seller/services/new" className="bg-mango text-abyss px-4 py-2 rounded-md text-sm font-medium hover:bg-mango-dark transition-colors">
                    + New service
                </Link>
            </div>

            {switchError && <p role="alert" className="text-coral text-sm mb-4">{switchError}</p>}

            {services.length === 0 && (
                <p className="text-ash text-sm">You haven't listed any services yet.</p>
            )}

            <ul className="divide-y divide-line border-y border-line">
                {services.map((s) => (
                    <li key={s.id} className="py-4 flex items-center gap-4">
                        <div className="w-14 h-14 bg-line/40 rounded-md overflow-hidden shrink-0">
                            {s.image_url && <img src={s.image_url} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />}
                        </div>

                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{s.title}</p>
                            <p className="price text-xs text-ash">{formatMoney(s.discount_price || s.base_price)}</p>
                        </div>

                        <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                            s.status === "published" ? "bg-teal/10 text-teal" : "bg-line text-ash"
                        }`}>
                            {s.status === "published" ? "Published" : "Draft"}
                        </span>

                        {!s.is_active && (
                            <span className="text-xs font-medium px-2 py-1 rounded-full bg-coral/10 text-coral">Inactive</span>
                        )}

                        <Link to={`/seller/services/${s.id}/edit`} className="text-xs text-teal hover:underline">
                            Edit
                        </Link>

                        <button
                            onClick={() => togglePublish(s)}
                            disabled={busyId === s.id}
                            className="text-xs text-ash hover:text-ink disabled:opacity-50"
                        >
                            {s.status === "published" ? "Unpublish" : "Publish"}
                        </button>

                        <button
                            onClick={() => toggleActive(s)}
                            disabled={busyId === s.id}
                            className="text-xs text-ash hover:text-ink disabled:opacity-50"
                        >
                            {s.is_active ? "Deactivate" : "Activate"}
                        </button>
                    </li>
                ))}
            </ul>
        </div>
    );
}
