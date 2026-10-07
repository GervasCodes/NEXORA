import { useEffect, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import api, { extractErrorMessage } from "../../api/client";
import Button from "../../components/ui/Button";
import PageMeta from "../../components/PageMeta";
import EmptyState from "../../components/ui/EmptyState";
import Input from "../../components/ui/Input";
import { useLanguage } from "../../context/LanguageContext";

const DAY_KEYS = ["day.0", "day.1", "day.2", "day.3", "day.4", "day.5", "day.6"];

// (Growth) - Dynamic Pricing. Mirrors SellerAvailability.jsx's
// shape (service picker + form + list) since both are "manage something
// per-service, standalone nav page, not linked off the services list"
// pages in this codebase. A pricing rule is the automated layer that
// sits behind SellerAvailability's manual per-date price override - see
// utils/dynamicPricing.js for the priority order between the two.
export default function SellerPricing() {
    const { t } = useLanguage();
    const { profile } = useOutletContext();
    const isProvider = profile?.merchant_type === "service" || profile?.merchant_type === "hybrid";

    const [services, setServices] = useState([]);
    const [loadingServices, setLoadingServices] = useState(true);
    const [serviceId, setServiceId] = useState("");

    const [rules, setRules] = useState([]);
    const [loadingRules, setLoadingRules] = useState(false);

    const [ruleType, setRuleType] = useState("day_of_week");
    const [dayOfWeek, setDayOfWeek] = useState("6");
    const [startDate, setStartDate] = useState("");
    const [endDate, setEndDate] = useState("");
    const [adjustmentType, setAdjustmentType] = useState("percentage");
    const [adjustmentValue, setAdjustmentValue] = useState("");
    const [label, setLabel] = useState("");

    const [saving, setSaving] = useState(false);
    const [busyId, setBusyId] = useState(null);
    const [error, setError] = useState("");

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

    const loadRules = () => {
        if (!serviceId) return;
        setLoadingRules(true);
        api.get(`/services/${serviceId}/pricing-rules`)
            .then(({ data }) => setRules(data.data))
            .catch(() => setRules([]))
            .finally(() => setLoadingRules(false));
    };

    useEffect(loadRules, [serviceId]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!serviceId) return;

        setSaving(true);
        setError("");

        try {
            await api.post(`/services/${serviceId}/pricing-rules`, {
                rule_type: ruleType,
                day_of_week: ruleType === "day_of_week" ? Number(dayOfWeek) : undefined,
                start_date: ruleType === "date_range" ? startDate : undefined,
                end_date: ruleType === "date_range" ? endDate : undefined,
                adjustment_type: adjustmentType,
                adjustment_value: Number(adjustmentValue),
                label: label || undefined
            });
            setAdjustmentValue("");
            setLabel("");
            loadRules();
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setSaving(false);
        }
    };

    const toggleRuleActive = async (rule) => {
        setBusyId(rule.id);
        try {
            await api.put(`/services/pricing-rules/${rule.id}/${rule.is_active ? "deactivate" : "activate"}`);
            loadRules();
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setBusyId(null);
        }
    };

    const deleteRule = async (rule) => {
        setBusyId(rule.id);
        try {
            await api.delete(`/services/pricing-rules/${rule.id}`);
            loadRules();
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setBusyId(null);
        }
    };

    if (!isProvider) {
        return (
            <div>
                <h1 className="font-display text-2xl mb-2">{t("seller.pricing.title")}</h1>
                <p className="text-ash text-sm mb-4">
                    {t("seller.pricing.providerOnly")}
                </p>
                <Link to="/seller/services" className="text-teal hover:underline text-sm">{t("seller.pricing.goToServices")}</Link>
            </div>
        );
    }

    if (loadingServices) return <p className="text-ash">{t("seller.pricing.loadingServices")}</p>;

    if (services.length === 0) {
        return (
            <div>
                <h1 className="font-display text-2xl mb-2">{t("seller.pricing.title")}</h1>
                <p className="text-ash text-sm mb-4">{t("seller.pricing.needService")}</p>
                <Link to="/seller/services/new" className="text-teal hover:underline text-sm">{t("seller.pricing.createService")}</Link>
            </div>
        );
    }

    return (
        <div>
            <PageMeta title="Pricing Rules" noIndex />
            <h1 className="font-display text-2xl mb-1">{t("seller.pricing.title")}</h1>
            <p className="text-ash text-sm mb-6 max-w-xl">
                {t("seller.pricing.intro")}
            </p>

            <div className="grid md:grid-cols-[1fr_360px] gap-8">
                <div>
                    <label htmlFor="pricing-service" className="block text-sm text-ash mb-1">{t("seller.pricing.service")}</label>
                    <select
                        id="pricing-service"
                        value={serviceId}
                        onChange={(e) => setServiceId(e.target.value)}
                        className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring bg-paper mb-6"
                    >
                        {services.map((s) => (
                            <option key={s.id} value={s.id}>{s.title}</option>
                        ))}
                    </select>

                    {error && <p role="alert" className="text-coral text-xs mb-3">{error}</p>}

                    {loadingRules ? (
                        <p className="text-ash text-sm">{t("seller.pricing.loadingRules")}</p>
                    ) : rules.length === 0 ? (
                        <EmptyState title={t("seller.pricing.noRules")} />
                    ) : (
                        <ul className="divide-y divide-line border-y border-line">
                            {rules.map((rule) => (
                                <li key={rule.id} className="py-3 flex flex-wrap items-center gap-3">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <p className="text-sm font-medium truncate">
                                                {rule.label || (rule.rule_type === "day_of_week"
                                                    ? t("seller.pricing.everyDay", { day: t(DAY_KEYS[rule.day_of_week]) })
                                                    : `${rule.start_date} → ${rule.end_date}`)}
                                            </p>
                                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${
                                                rule.is_active ? "bg-teal/10 text-teal" : "bg-line text-ash"
                                            }`}>
                                                {rule.is_active ? t("seller.pricing.active") : t("seller.pricing.paused")}
                                            </span>
                                        </div>
                                        <p className="text-xs text-ash">
                                            {rule.adjustment_type === "percentage"
                                                ? `${rule.adjustment_value > 0 ? "+" : ""}${rule.adjustment_value}%`
                                                : `${rule.adjustment_value > 0 ? "+" : ""}${rule.adjustment_value} ${t("seller.pricing.flatSuffix")}`}
                                        </p>
                                    </div>

                                    <div className="flex items-center gap-3 shrink-0">
                                        <button
                                            onClick={() => toggleRuleActive(rule)}
                                            disabled={busyId === rule.id}
                                            className="text-xs text-ash hover:text-ink disabled:opacity-50"
                                        >
                                            {rule.is_active ? t("seller.pricing.pause") : t("seller.pricing.resume")}
                                        </button>

                                        <button
                                            onClick={() => deleteRule(rule)}
                                            disabled={busyId === rule.id}
                                            className="text-xs text-coral hover:underline disabled:opacity-50"
                                        >
                                            {t("seller.pricing.remove")}
                                        </button>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                <form onSubmit={handleSubmit} className="border border-line rounded-lg p-4 h-fit">
                    <p className="text-sm font-medium mb-4">{t("seller.pricing.addRule")}</p>

                    <div className="mb-3">
                        <label htmlFor="pricing-rule-type" className="block text-xs text-ash mb-1">{t("seller.pricing.appliesTo")}</label>
                        <select
                            id="pricing-rule-type"
                            value={ruleType}
                            onChange={(e) => setRuleType(e.target.value)}
                            className="w-full border border-line rounded-md px-2 py-1.5 text-sm focus-ring bg-paper"
                        >
                            <option value="day_of_week">{t("seller.pricing.dayOfWeek")}</option>
                            <option value="date_range">{t("seller.pricing.dateRange")}</option>
                        </select>
                    </div>

                    {ruleType === "day_of_week" ? (
                        <div className="mb-3">
                            <label htmlFor="pricing-day" className="block text-xs text-ash mb-1">{t("seller.pricing.day")}</label>
                            <select
                                id="pricing-day"
                                value={dayOfWeek}
                                onChange={(e) => setDayOfWeek(e.target.value)}
                                className="w-full border border-line rounded-md px-2 py-1.5 text-sm focus-ring bg-paper"
                            >
                                {DAY_KEYS.map((dayKey, index) => (
                                    <option key={dayKey} value={index}>{t(dayKey)}</option>
                                ))}
                            </select>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 gap-3 mb-3">
                            <div>
                                <label htmlFor="pricing-start" className="block text-xs text-ash mb-1">{t("seller.pricing.startDate")}</label>
                                <Input
                                    id="pricing-start"
                                    type="date"
                                    required
                                    value={startDate}
                                    onChange={(e) => setStartDate(e.target.value)}
                                />
                            </div>
                            <div>
                                <label htmlFor="pricing-end" className="block text-xs text-ash mb-1">{t("seller.pricing.endDate")}</label>
                                <Input
                                    id="pricing-end"
                                    type="date"
                                    required
                                    value={endDate}
                                    onChange={(e) => setEndDate(e.target.value)}
                                />
                            </div>
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-3 mb-3">
                        <div>
                            <label htmlFor="pricing-adjustment-type" className="block text-xs text-ash mb-1">{t("seller.pricing.adjustment")}</label>
                            <select
                                id="pricing-adjustment-type"
                                value={adjustmentType}
                                onChange={(e) => setAdjustmentType(e.target.value)}
                                className="w-full border border-line rounded-md px-2 py-1.5 text-sm focus-ring bg-paper"
                            >
                                <option value="percentage">{t("seller.pricing.percentage")}</option>
                                <option value="fixed">{t("seller.pricing.fixedAmount")}</option>
                            </select>
                        </div>
                        <div>
                            <label htmlFor="pricing-adjustment-value" className="block text-xs text-ash mb-1">
                                {adjustmentType === "percentage" ? t("seller.pricing.percentChange") : t("seller.pricing.amount")}
                            </label>
                            <Input
                                id="pricing-adjustment-value"
                                type="number"
                                step="0.01"
                                required
                                placeholder={adjustmentType === "percentage" ? t("seller.pricing.percentPlaceholder") : t("seller.pricing.amountPlaceholder")}
                                value={adjustmentValue}
                                onChange={(e) => setAdjustmentValue(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="mb-4">
                        <label htmlFor="pricing-label" className="block text-xs text-ash mb-1">{t("seller.pricing.labelOptional")}</label>
                        <Input
                            id="pricing-label"
                            type="text"
                            maxLength={100}
                            placeholder={t("seller.pricing.labelPlaceholder")}
                            value={label}
                            onChange={(e) => setLabel(e.target.value)}
                        />
                    </div>

                    <Button
                        type="submit"
                        disabled={saving}
                        fullWidth
                    >
                        {saving ? t("seller.pricing.saving") : t("seller.pricing.addRuleSubmit")}
                    </Button>
                </form>
            </div>
        </div>
    );
}
