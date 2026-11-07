import { useEffect, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import api, { extractErrorMessage } from "../api/client";
import PageMeta from "../components/PageMeta";
import { useCurrency } from "../context/CurrencyContext";
import { useLanguage } from "../context/LanguageContext";
import PageLoader from "../components/PageLoader";
import Spinner from "../components/ui/Spinner";
import Input from "../components/ui/Input";
import Select from "../components/ui/Select";
import useFormErrors from "../hooks/useFormErrors";
import { rules, validateFields } from "../utils/formErrors";

const REASON_KEYS = [
    "damaged_item",
    "wrong_item",
    "defective_product",
    "not_as_described",
    "changed_mind",
    "other"
];

// Per-field rules (Phase 6 form-error pattern). The item picker and the
// details box are optional.
const RETURN_RULES = {
    reason: [rules.requiredChoice("return.error.reasonRequired")]
};

export default function NewReturn() {
    const { format } = useCurrency();
    const { t } = useLanguage();
    const [searchParams] = useSearchParams();
    const orderId = searchParams.get("order_id");
    const navigate = useNavigate();

    const [order, setOrder] = useState(null);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState("");

    const [form, setForm] = useState({
        order_item_id: "",
        reason: "",
        description: ""
    });
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");
    const { formRef, errors: fieldErrors, showErrors, clearError, hasErrors } = useFormErrors();

    useEffect(() => {
        if (!orderId) {
            setLoadError(t("return.new.noOrderSpecified"));
            setLoading(false);
            return;
        }
        api.get(`/orders/${orderId}`)
            .then(({ data }) => setOrder(data.data))
            .catch((err) => setLoadError(extractErrorMessage(err)))
            .finally(() => setLoading(false));
    }, [orderId, t]);

    const setField = (field) => (e) => {
        clearError(field);
        setForm((prev) => ({ ...prev, [field]: e.target.value }));
    };

    const submit = async (e) => {
        e.preventDefault();
        setError("");

        const problems = validateFields(RETURN_RULES, form, t);
        showErrors(problems);
        if (Object.keys(problems).length > 0) return;

        setSubmitting(true);
        try {
            const { data } = await api.post("/returns", {
                order_id: Number(orderId),
                order_item_id: form.order_item_id ? Number(form.order_item_id) : undefined,
                reason: form.reason,
                description: form.description
            });
            navigate(`/returns/${data.data.id}`);
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) return <PageLoader />;

    if (loadError || !order) {
        return (
            <div className="max-w-xl mx-auto px-6 py-24 text-center">
                <p className="font-display text-2xl mb-2">{t("return.new.loadErrorTitle")}</p>
                <p className="text-ash text-sm mb-4">{loadError}</p>
                <Link to="/orders" className="text-teal hover:underline text-sm">{t("return.new.backToOrders")}</Link>
            </div>
        );
    }

    return (
        <div className="max-w-xl mx-auto px-4 sm:px-6 py-10">
            <p className="text-xs uppercase tracking-widest text-ash mb-1">{t("return.new.eyebrow")}</p>
            <PageMeta title={t("return.new.pageTitle")} noIndex />
            <h1 className="font-display text-2xl mb-1">Order {order.order_number}</h1>
            <p className="text-ash text-sm mb-8">
                {t("return.new.intro")}
            </p>

            <form ref={formRef} onSubmit={submit} noValidate className="space-y-4">
                {order.items?.length > 0 && (
                    <Select
                        id="return-item"
                        label={t("return.new.itemLabel")}
                        value={form.order_item_id}
                        onChange={setField("order_item_id")}
                    >
                        <option value="">{t("return.new.wholeOrderOption")}</option>
                        {order.items.map((item) => (
                            <option key={item.id} value={item.id}>
                                {item.name} × {item.quantity} — {format(item.subtotal)}
                            </option>
                        ))}
                    </Select>
                )}

                <Select
                    id="return-reason"
                    label={t("return.new.reasonLabel")}
                    aria-required="true"
                    value={form.reason}
                    error={fieldErrors.reason}
                    onChange={setField("reason")}
                >
                    <option value="" disabled>{t("return.new.reasonLabel")}</option>
                    {REASON_KEYS.map((key) => (
                        <option key={key} value={key}>{t(`return.reason.${key}`)}</option>
                    ))}
                </Select>

                <Input
                    as="textarea"
                    id="return-description"
                    label={t("return.new.detailsLabel")}
                    rows={5}
                    maxLength={2000}
                    placeholder={t("return.new.detailsPlaceholder")}
                    value={form.description}
                    onChange={setField("description")}
                />

                {error && <p role="alert" className="text-sm text-coral">{error}</p>}
                {hasErrors && <p className="text-sm text-coral">{t("form.error.fixHighlighted")}</p>}

                <div className="flex gap-3">
                    <button aria-busy={submitting || undefined}
                        type="submit"
                        disabled={submitting}
                        className="bg-ink text-paper px-5 py-2.5 rounded-md text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60"
                    >{submitting && <Spinner size="xs" className="inline-block mr-1.5 align-[-2px]" />}
                        {submitting ? t("return.new.submitting") : t("return.new.submit")}
                    </button>
                    <Link
                        to={`/orders/${orderId}`}
                        className="text-sm border border-line px-5 py-2.5 rounded-md hover:border-ink transition-colors"
                    >
                        {t("return.new.cancel")}
                    </Link>
                </div>
            </form>
        </div>
    );
}
