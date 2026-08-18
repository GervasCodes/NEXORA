import { useEffect, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import api, { extractErrorMessage } from "../api/client";
import PageMeta from "../components/PageMeta";
import { useCurrency } from "../context/CurrencyContext";
import { useLanguage } from "../context/LanguageContext";
import PageLoader from "../components/PageLoader";

const TYPE_KEYS = [
    "damaged_item",
    "delayed_delivery",
    "defective_product",
    "wrong_item",
    "missing_delivery",
    "other"
];

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

    const submit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        setError("");
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

            <form onSubmit={submit} className="space-y-4">
                {order.items?.length > 0 && (
                    <div>
                        <label htmlFor="dispute-item" className="block text-sm mb-1">{t("dispute.new.itemLabel")}</label>
                        <select
                            id="dispute-item"
                            value={form.order_item_id}
                            onChange={(e) => setForm({ ...form, order_item_id: e.target.value })}
                            className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring bg-paper"
                        >
                            <option value="">{t("dispute.new.wholeOrderOption")}</option>
                            {order.items.map((item) => (
                                <option key={item.id} value={item.id}>
                                    {item.name} × {item.quantity} — {format(item.subtotal)}
                                </option>
                            ))}
                        </select>
                    </div>
                )}

                <div>
                    <label htmlFor="dispute-type" className="block text-sm mb-1">{t("dispute.new.typeLabel")}</label>
                    <select
                        id="dispute-type"
                        required
                        value={form.type}
                        onChange={(e) => setForm({ ...form, type: e.target.value })}
                        className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring bg-paper"
                    >
                        <option value="" disabled>{t("dispute.new.selectCategory")}</option>
                        {TYPE_KEYS.map((key) => (
                            <option key={key} value={key}>{t(`dispute.type.${key}`)}</option>
                        ))}
                    </select>
                </div>

                <div>
                    <label htmlFor="dispute-subject" className="block text-sm mb-1">{t("dispute.new.subjectLabel")}</label>
                    <input
                        id="dispute-subject"
                        required
                        maxLength={150}
                        placeholder={t("dispute.new.subjectPlaceholder")}
                        value={form.subject}
                        onChange={(e) => setForm({ ...form, subject: e.target.value })}
                        className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring"
                    />
                </div>

                <div>
                    <label htmlFor="dispute-description" className="block text-sm mb-1">{t("dispute.new.detailsLabel")}</label>
                    <textarea
                        id="dispute-description"
                        required
                        rows={5}
                        maxLength={2000}
                        placeholder={t("dispute.new.detailsPlaceholder")}
                        value={form.description}
                        onChange={(e) => setForm({ ...form, description: e.target.value })}
                        className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring resize-none"
                    />
                </div>

                {error && <p className="text-sm text-coral">{error}</p>}

                <div className="flex gap-3">
                    <button
                        type="submit"
                        disabled={submitting}
                        className="bg-ink text-paper px-5 py-2.5 rounded-md text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60"
                    >
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
