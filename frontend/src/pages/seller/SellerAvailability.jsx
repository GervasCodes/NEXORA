import { useEffect, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import api, { extractErrorMessage } from "../../api/client";
import AvailabilityCalendar from "../../components/AvailabilityCalendar";
import NexoraAvailabilitySuggestion from "../../components/ai/NexoraAvailabilitySuggestion";
import Button from "../../components/ui/Button";
import PageMeta from "../../components/PageMeta";

const todayIso = () => new Date().toISOString().slice(0, 10);

export default function SellerAvailability() {
    const { profile } = useOutletContext();
    const isProvider = profile?.merchant_type === "service" || profile?.merchant_type === "hybrid";

    const [services, setServices] = useState([]);
    const [loadingServices, setLoadingServices] = useState(true);
    const [serviceId, setServiceId] = useState("");

    const [startDate, setStartDate] = useState(todayIso());
    const [endDate, setEndDate] = useState(todayIso());
    const [availableUnits, setAvailableUnits] = useState(1);
    const [price, setPrice] = useState("");
    const [status, setStatus] = useState("open");

    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");
    const [refreshToken, setRefreshToken] = useState(0);

    useEffect(() => {
        if (!isProvider) {
            setLoadingServices(false);
            return;
        }
        api.get("/services/mine/list")
            .then(({ data }) => {
                setServices(data.data);
                if (data.data.length > 0) setServiceId(String(data.data[0].id));
            })
            .finally(() => setLoadingServices(false));
    }, [isProvider]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!serviceId) return;

        setSaving(true);
        setMessage("");
        setError("");

        try {
            const { data } = await api.put(`/services/${serviceId}/availability`, {
                startDate,
                endDate,
                availableUnits: Number(availableUnits),
                price: price === "" ? null : Number(price),
                status
            });
            setMessage(`Updated ${data.data.datesUpdated} date(s).`);
            setRefreshToken((t) => t + 1);
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setSaving(false);
        }
    };

    if (!isProvider) {
        return (
            <div>
                <h1 className="font-display text-2xl mb-2">Availability</h1>
                <p className="text-ash text-sm mb-4">
                    Availability management is for service providers. Add services to your store first.
                </p>
                <Link to="/seller/services" className="text-teal hover:underline text-sm">Go to Services</Link>
            </div>
        );
    }

    if (loadingServices) return <p className="text-ash">Loading your services…</p>;

    if (services.length === 0) {
        return (
            <div>
                <h1 className="font-display text-2xl mb-2">Availability</h1>
                <p className="text-ash text-sm mb-4">You need at least one service listing before you can open dates for booking.</p>
                <Link to="/seller/services/new" className="text-teal hover:underline text-sm">Create a service</Link>
            </div>
        );
    }

    return (
        <div>
            <PageMeta title="Availability" noIndex />
            <h1 className="font-display text-2xl mb-6">Availability</h1>

            <div className="grid md:grid-cols-[1fr_320px] gap-8">
                <div>
                    <label htmlFor="availability-service" className="block text-sm text-ash mb-1">Service</label>
                    <select
                        id="availability-service"
                        value={serviceId}
                        onChange={(e) => setServiceId(e.target.value)}
                        className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring bg-paper mb-6"
                    >
                        {services.map((s) => (
                            <option key={s.id} value={s.id}>{s.title}</option>
                        ))}
                    </select>

                    {serviceId && (
                        <>
                            <NexoraAvailabilitySuggestion serviceId={serviceId} refreshToken={refreshToken} />
                            <AvailabilityCalendar serviceId={serviceId} refreshToken={refreshToken} />
                        </>
                    )}
                </div>

                <form onSubmit={handleSubmit} className="border border-line rounded-lg p-4 h-fit">
                    <p className="text-sm font-medium mb-4">Set availability for a date range</p>

                    {message && <p className="text-teal text-xs mb-3">{message}</p>}
                    {error && <p role="alert" className="text-coral text-xs mb-3">{error}</p>}

                    <div className="grid grid-cols-2 gap-3 mb-3">
                        <div>
                            <label htmlFor="availability-start" className="block text-xs text-ash mb-1">Start date</label>
                            <input
                                id="availability-start"
                                type="date"
                                required
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                className="w-full border border-line rounded-md px-2 py-1.5 text-sm focus-ring bg-paper"
                            />
                        </div>
                        <div>
                            <label htmlFor="availability-end" className="block text-xs text-ash mb-1">End date</label>
                            <input
                                id="availability-end"
                                type="date"
                                required
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                                className="w-full border border-line rounded-md px-2 py-1.5 text-sm focus-ring bg-paper"
                            />
                        </div>
                    </div>

                    <div className="mb-3">
                        <label htmlFor="availability-units" className="block text-xs text-ash mb-1">Available units</label>
                        <input
                            id="availability-units"
                            type="number"
                            min={0}
                            required
                            value={availableUnits}
                            onChange={(e) => setAvailableUnits(e.target.value)}
                            className="w-full border border-line rounded-md px-2 py-1.5 text-sm focus-ring bg-paper"
                        />
                    </div>

                    <div className="mb-3">
                        <label htmlFor="availability-price" className="block text-xs text-ash mb-1">Price override (optional)</label>
                        <input
                            id="availability-price"
                            type="number"
                            min={0}
                            step="0.01"
                            placeholder="Use listing price"
                            value={price}
                            onChange={(e) => setPrice(e.target.value)}
                            className="w-full border border-line rounded-md px-2 py-1.5 text-sm focus-ring bg-paper"
                        />
                    </div>

                    <div className="mb-4">
                        <label htmlFor="availability-status" className="block text-xs text-ash mb-1">Status</label>
                        <select
                            id="availability-status"
                            value={status}
                            onChange={(e) => setStatus(e.target.value)}
                            className="w-full border border-line rounded-md px-2 py-1.5 text-sm focus-ring bg-paper"
                        >
                            <option value="open">Open</option>
                            <option value="closed">Closed</option>
                        </select>
                    </div>

                    <Button
                        type="submit"
                        disabled={saving}
                        fullWidth
                    >
                        {saving ? "Saving…" : "Update availability"}
                    </Button>
                </form>
            </div>
        </div>
    );
}
