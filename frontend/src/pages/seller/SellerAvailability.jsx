import { useEffect, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import api, { extractErrorMessage } from "../../api/client";
import AvailabilityCalendar from "../../components/AvailabilityCalendar";
import NexoraAvailabilitySuggestion from "../../components/ai/NexoraAvailabilitySuggestion";
import Button from "../../components/ui/Button";
import PageMeta from "../../components/PageMeta";
import Input from "../../components/ui/Input";
import Skeleton from "../../components/Skeleton";
import ErrorState from "../../components/ui/ErrorState";
import { useLanguage } from "../../context/LanguageContext";

// Local-date ISO (YYYY-MM-DD). toISOString() is UTC, which in East Africa
// (UTC+3) shows yesterday's date for the first hours of every day.
const toLocalIso = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
};
const todayIso = () => toLocalIso(new Date());
const addDaysIso = (iso, days) => {
    const [y, m, d] = iso.split("-").map(Number);
    return toLocalIso(new Date(y, m - 1, d + days));
};

const PRESET_KEYS = [
    { key: "7d", labelKey: "seller.availability.preset.7d", range: () => [todayIso(), addDaysIso(todayIso(), 6)] },
    { key: "30d", labelKey: "seller.availability.preset.30d", range: () => [todayIso(), addDaysIso(todayIso(), 29)] },
    {
        key: "restOfMonth",
        labelKey: "seller.availability.preset.restOfMonth",
        range: () => {
            const now = new Date();
            return [todayIso(), toLocalIso(new Date(now.getFullYear(), now.getMonth() + 1, 0))];
        }
    }
];

export default function SellerAvailability() {
    const { t } = useLanguage();
    const { profile } = useOutletContext();
    const isProvider = profile?.merchant_type === "service" || profile?.merchant_type === "hybrid";

    const [services, setServices] = useState([]);
    const [loadingServices, setLoadingServices] = useState(true);
    const [servicesError, setServicesError] = useState("");
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

    const loadServices = () => {
        setLoadingServices(true);
        setServicesError("");
        api.get("/services/mine/list")
            .then(({ data }) => {
                setServices(data.data);
                if (data.data.length > 0) setServiceId((current) => current || String(data.data[0].id));
            })
            .catch((err) => setServicesError(extractErrorMessage(err)))
            .finally(() => setLoadingServices(false));
    };

    useEffect(() => {
        if (!isProvider) {
            setLoadingServices(false);
            return;
        }
        loadServices();
        // eslint-disable-next-line react-hooks/exhaustive-deps -- loadServices only closes over setters
    }, [isProvider]);

    const onStartChange = (value) => {
        setStartDate(value);
        // Keep the range valid: pushing the start past the end drags the end along.
        if (value && endDate && value > endDate) setEndDate(value);
    };

    const applyPreset = (preset) => {
        const [from, to] = preset.range();
        setStartDate(from);
        setEndDate(to);
        setMessage("");
        setError("");
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!serviceId) return;

        setMessage("");
        setError("");

        if (endDate < startDate) {
            setError(t("seller.availability.error.endBeforeStart"));
            return;
        }
        if (Number(availableUnits) < 0 || !Number.isFinite(Number(availableUnits))) {
            setError(t("seller.availability.error.unitsInvalid"));
            return;
        }
        setSaving(true);

        try {
            const { data } = await api.put(`/services/${serviceId}/availability`, {
                startDate,
                endDate,
                availableUnits: Number(availableUnits),
                price: price === "" ? null : Number(price),
                status
            });
            setMessage(t("seller.availability.updated", { count: data.data.datesUpdated }));
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
                <h1 className="font-display text-2xl mb-2">{t("seller.availability.title")}</h1>
                <p className="text-ash text-sm mb-4">
                    {t("seller.availability.providersOnly")}
                </p>
                <Link to="/seller/services" className="text-teal hover:underline text-sm">{t("seller.availability.goToServices")}</Link>
            </div>
        );
    }

    if (loadingServices) {
        return (
            <div className="animate-fade-in" aria-busy="true" aria-label={t("seller.availability.loadingAria")}>
                <Skeleton className="h-7 w-36 mb-6" />
                <div className="grid md:grid-cols-[1fr_320px] gap-8">
                    <div>
                        <Skeleton className="h-10 w-full mb-6" />
                        <Skeleton className="h-72 w-full" />
                    </div>
                    <Skeleton className="h-80 w-full" />
                </div>
            </div>
        );
    }

    if (servicesError) return <ErrorState title={t("seller.availability.loadError")} hint={servicesError} onRetry={loadServices} />;

    if (services.length === 0) {
        return (
            <div>
                <h1 className="font-display text-2xl mb-2">{t("seller.availability.title")}</h1>
                <p className="text-ash text-sm mb-4">{t("seller.availability.needService")}</p>
                <Link to="/seller/services/new" className="text-teal hover:underline text-sm">{t("seller.availability.createService")}</Link>
            </div>
        );
    }

    return (
        <div>
            <PageMeta title={t("seller.availability.title")} noIndex />
            <h1 className="font-display text-2xl mb-6">{t("seller.availability.title")}</h1>

            <div className="grid md:grid-cols-[1fr_320px] gap-8">
                <div>
                    <label htmlFor="availability-service" className="block text-sm text-ash mb-1">{t("seller.availability.serviceLabel")}</label>
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
                    <p className="text-sm font-medium mb-3">{t("seller.availability.rangeFormTitle")}</p>

                    <div className="flex flex-wrap gap-1.5 mb-4">
                        {PRESET_KEYS.map((preset) => (
                            <button
                                key={preset.key}
                                type="button"
                                onClick={() => applyPreset(preset)}
                                className="text-xs border border-line px-2.5 py-1 rounded-full hover:border-ink transition-colors"
                            >
                                {t(preset.labelKey)}
                            </button>
                        ))}
                    </div>

                    {message && <p role="status" className="text-teal text-xs mb-3">{message}</p>}
                    {error && <p role="alert" className="text-coral text-xs mb-3">{error}</p>}

                    <div className="grid grid-cols-2 gap-3 mb-3">
                        <div>
                            <label htmlFor="availability-start" className="block text-xs text-ash mb-1">{t("seller.availability.startDate")}</label>
                            <Input
                                id="availability-start"
                                type="date"
                                required
                                autoComplete="off"
                                value={startDate}
                                onChange={(e) => onStartChange(e.target.value)}
                            />
                        </div>
                        <div>
                            <label htmlFor="availability-end" className="block text-xs text-ash mb-1">{t("seller.availability.endDate")}</label>
                            <Input
                                id="availability-end"
                                type="date"
                                required
                                autoComplete="off"
                                min={startDate}
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="mb-3">
                        <label htmlFor="availability-units" className="block text-xs text-ash mb-1">{t("seller.availability.units")}</label>
                        <Input
                            id="availability-units"
                            type="number"
                            inputMode="numeric"
                            min={0}
                            required
                            value={availableUnits}
                            onChange={(e) => setAvailableUnits(e.target.value)}
                        />
                    </div>

                    <div className="mb-3">
                        <label htmlFor="availability-price" className="block text-xs text-ash mb-1">{t("seller.availability.priceOverride")}</label>
                        <Input
                            id="availability-price"
                            type="number"
                            inputMode="decimal"
                            min={0}
                            step="0.01"
                            placeholder={t("seller.availability.priceOverridePlaceholder")}
                            value={price}
                            onChange={(e) => setPrice(e.target.value)}
                        />
                    </div>

                    <div className="mb-4">
                        <label htmlFor="availability-status" className="block text-xs text-ash mb-1">{t("seller.availability.status")}</label>
                        <select
                            id="availability-status"
                            value={status}
                            onChange={(e) => setStatus(e.target.value)}
                            className="w-full border border-line rounded-md px-2 py-1.5 text-sm focus-ring bg-paper"
                        >
                            <option value="open">{t("seller.availability.status.open")}</option>
                            <option value="closed">{t("seller.availability.status.closed")}</option>
                        </select>
                    </div>

                    <Button
                        type="submit"
                        disabled={saving}
                        fullWidth
                    >
                        {saving ? t("seller.availability.saving") : t("seller.availability.update")}
                    </Button>
                </form>
            </div>
        </div>
    );
}
