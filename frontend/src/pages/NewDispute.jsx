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

const TYPE_KEYS = [
    "damaged_item",
    "delayed_delivery",
    "defective_product",
    "wrong_item",
    "missing_delivery",
    "other"
];

// Per-field rules (Phase 6 form-error pattern). The item picker is optional.
const DISPUTE_RULES = {
    type: [rules.requiredChoice("dispute.error.typeRequired")],
    subject: [rules.required("dispute.error.subjectRequired")],
    description: [rules.required("dispute.error.detailsRequired")]
};

export default function NewDispute() {
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
        type: "",
        subject: "",
        description: ""
    });
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");
    const { formRef, errors: fieldErrors, showErrors, clearError, hasErrors } = useFormErrors();

    useEffect(() => {
        if (!orderId) {
            setLoadError(t("dispute.new.noOrderSpecified"));
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

        const problems = validateFields(DISPUTE_RULES, form, t);
        showErrors(problems);
        if (Object.keys(problems).length > 0) return;

        setSubmitting(true);
        try {
            const { data } = await api.post("/disputes", {
                order_id: Number(orderId),
                order_item_id: form.order_item_id ? Number(form.order_item_id) : undefined,
                type: form.type,
                subject: form.subject,
                description: form.description
            });
            navigate(`/disputes/${data.data.id}`);
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
                <p className="font-display text-2xl mb-2">{t("dispute.new.loadErrorTitle")}</p>
                <p className="text-ash text-sm mb-4">{loadError}</p>
                <Link to="/orders" className="text-teal hover:underline text-sm">{t("dispute.new.backToOrders")}</Link>
            </div>
        );
    }

    return (
        <div className="max-w-xl mx-auto px-4 sm:px-6 py-10">
            <p className="text-xs uppercase tracking-widest text-ash mb-1">{t("dispute.new.eyebrow")}</p>
            <PageMeta title={t("dispute.new.pageTitle")} noIndex />
            <h1 className="font-display text-2xl mb-1">Order {order.order_number}</h1>
            <p className="text-ash text-sm mb-8">
                {t("dispute.new.intro")}
            </p>

            <form ref={formRef} onSubmit={submit} noValidate className="space-y-4">
                {order.items?.length > 0 && (
                    <Select
                        id="dispute-item"
                        label={t("dispute.new.itemLabel")}
                        value={form.order_item_id}
                        onChange={setField("order_item_id")}
                    >
                        <option value="">{t("dispute.new.wholeOrderOption")}</option>
                        {order.items.map((item) => (
                            <option key={item.id} value={item.id}>
                                {item.name} × {item.quantity} — {format(item.subtotal)}
                            </option>
                        ))}
                    </Select>
                )}

                {/* aria-required instead of `required`: the visible asterisk would
                    change the label text, and this form has never shown one. */}
                <Select
                    id="dispute-type"
                    label={t("dispute.new.typeLabel")}
                    aria-required="true"
                    value={form.type}
                    error={fieldErrors.type}
                    onChange={setField("type")}
                >
                    <option value="" disabled>{t("dispute.new.selectCategory")}</option>
                    {TYPE_KEYS.map((key) => (
                        <option key={key} value={key}>{t(`dispute.type.${key}`)}</option>
                    ))}
                </Select>

                <Input
                    id="dispute-subject"
                    label={t("dispute.new.subjectLabel")}
                    aria-required="true"
                    maxLength={150}
                    placeholder={t("dispute.new.subjectPlaceholder")}
                    value={form.subject}
                    error={fieldErrors.subject}
                    onChange={setField("subject")}
                />

                <Input
                    as="textarea"
                    id="dispute-description"
                    label={t("dispute.new.detailsLabel")}
                    aria-required="true"
                    rows={5}
                    maxLength={2000}
                    placeholder={t("dispute.new.detailsPlaceholder")}
                    value={form.description}
                    error={fieldErrors.description}
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
                        {submitting ? t("dispute.new.submitting") : t("dispute.new.submit")}
                    </button>
                    <Link
                        to={`/orders/${orderId}`}
                        className="text-sm border border-line px-5 py-2.5 rounded-md hover:border-ink transition-colors"
                    >
                        {t("dispute.new.cancel")}
                    </Link>
                </div>
            </form>
        </div>
    );
}
