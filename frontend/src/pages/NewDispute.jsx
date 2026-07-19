import { useEffect, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import api, { extractErrorMessage } from "../api/client";
import { useCurrency } from "../context/CurrencyContext";

const TYPES = [
    { value: "damaged_item", label: "Damaged item" },
    { value: "delayed_delivery", label: "Delayed delivery" },
    { value: "defective_product", label: "Defective product" },
    { value: "wrong_item", label: "Wrong item" },
    { value: "missing_delivery", label: "Missing delivery" },
    { value: "other", label: "Other issue" }
];

export default function NewDispute() {
    const { format } = useCurrency();
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
            setLoadError("No order was specified.");
            setLoading(false);
            return;
        }
        api.get(`/orders/${orderId}`)
            .then(({ data }) => setOrder(data.data))
            .catch((err) => setLoadError(extractErrorMessage(err)))
            .finally(() => setLoading(false));
    }, [orderId]);

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

    if (loading) return <div className="max-w-xl mx-auto px-6 py-16 text-ash">Loading order…</div>;

    if (loadError || !order) {
        return (
            <div className="max-w-xl mx-auto px-6 py-24 text-center">
                <p className="font-display text-2xl mb-2">Couldn't load that order</p>
                <p className="text-ash text-sm mb-4">{loadError}</p>
                <Link to="/orders" className="text-teal hover:underline text-sm">Back to orders</Link>
            </div>
        );
    }

    return (
        <div className="max-w-xl mx-auto px-4 sm:px-6 py-10">
            <p className="text-xs uppercase tracking-widest text-ash mb-1">Report a problem</p>
            <h1 className="font-display text-2xl mb-1">Order {order.order_number}</h1>
            <p className="text-ash text-sm mb-8">
                Tell us what went wrong. Our team will review it and reach out with a decision.
            </p>

            <form onSubmit={submit} className="space-y-4">
                {order.items?.length > 0 && (
                    <div>
                        <label className="block text-sm mb-1">Which item is this about?</label>
                        <select
                            value={form.order_item_id}
                            onChange={(e) => setForm({ ...form, order_item_id: e.target.value })}
                            className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring bg-paper"
                        >
                            <option value="">The whole order (e.g. delayed / missing delivery)</option>
                            {order.items.map((item) => (
                                <option key={item.id} value={item.id}>
                                    {item.name} × {item.quantity} — {format(item.subtotal)}
                                </option>
                            ))}
                        </select>
                    </div>
                )}

                <div>
                    <label className="block text-sm mb-1">What's the issue?</label>
                    <select
                        required
                        value={form.type}
                        onChange={(e) => setForm({ ...form, type: e.target.value })}
                        className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring bg-paper"
                    >
                        <option value="" disabled>Select a category</option>
                        {TYPES.map((t) => (
                            <option key={t.value} value={t.value}>{t.label}</option>
                        ))}
                    </select>
                </div>

                <div>
                    <label className="block text-sm mb-1">Subject</label>
                    <input
                        required
                        maxLength={150}
                        placeholder="e.g. Blender arrived with a cracked jug"
                        value={form.subject}
                        onChange={(e) => setForm({ ...form, subject: e.target.value })}
                        className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring"
                    />
                </div>

                <div>
                    <label className="block text-sm mb-1">Details</label>
                    <textarea
                        required
                        rows={5}
                        maxLength={2000}
                        placeholder="Describe what happened. You can attach photos after submitting."
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
                        className="bg-ink text-paper px-5 py-2.5 rounded-md text-sm font-semibold hover:bg-abyss transition-colors disabled:opacity-60"
                    >
                        {submitting ? "Submitting…" : "Submit dispute"}
                    </button>
                    <Link
                        to={`/orders/${orderId}`}
                        className="text-sm border border-line px-5 py-2.5 rounded-md hover:border-ink transition-colors"
                    >
                        Cancel
                    </Link>
                </div>
            </form>
        </div>
    );
}
