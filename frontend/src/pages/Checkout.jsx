import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import api, { extractErrorMessage } from "../api/client";
import { useCart } from "../context/CartContext";
import { useCurrency } from "../context/CurrencyContext";
import { useLanguage } from "../context/LanguageContext";
import LocationPicker from "../components/LocationPicker";

const initialForm = {
    shipping_address: "",
    shipping_city: "",
    shipping_region: "",
    shipping_phone: "",
    payment_method: "mobile_money"
};

const PAYMENT_METHODS = [
    { value: "mobile_money", label: "Mobile Money" },
    { value: "cash_on_delivery", label: "Cash on Delivery" },
    { value: "snippe", label: "Card (Snippe)" },
    { value: "paypal", label: "PayPal", hint: "(charged in USD)" }
];

export default function Checkout() {
    const { format } = useCurrency();
    const { items, total, refresh } = useCart();
    const navigate = useNavigate();
    const { t } = useLanguage();
    const [form, setForm] = useState(initialForm);
    const [pin, setPin] = useState(null);
    const [error, setError] = useState("");
    const [errorTick, setErrorTick] = useState(0);
    const [submitting, setSubmitting] = useState(false);
    const [redirecting, setRedirecting] = useState(false);

    const update = (field) => (e) => setForm({ ...form, [field]: e.target.value });

    const showError = (message) => {
        setError(message);
        // Bumping this key re-triggers the CSS animation even if the same
        // error string appears twice in a row (React would otherwise skip
        // re-rendering an "unchanged" text node's animation).
        setErrorTick((v) => v + 1);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        setError("");

        try {
            const payload = {
                ...form,
                delivery_lat: pin?.lat ?? null,
                delivery_lng: pin?.lng ?? null
            };
            const { data } = await api.post("/orders", payload);
            const orderId = data.data.orderId;

            if (form.payment_method === "mobile_money") {
                await api.post(`/payments/${orderId}/initiate`);

            } else if (form.payment_method === "snippe") {
                const origin = window.location.origin;
                const { data: checkout } = await api.post(`/payments/${orderId}/snippe/checkout`, {
                    successUrl: `${origin}/orders/${orderId}?payment=success`,
                    cancelUrl: `${origin}/orders/${orderId}?payment=cancelled`
                });
                await refresh();
                setRedirecting(true);
                window.location.href = checkout.data.url;
                return;

            } else if (form.payment_method === "paypal") {
                const origin = window.location.origin;
                const { data: checkout } = await api.post(`/payments/${orderId}/paypal/create`, {
                    returnUrl: `${origin}/orders/${orderId}?payment=paypal_return`,
                    cancelUrl: `${origin}/orders/${orderId}?payment=cancelled`
                });
                await refresh();
                setRedirecting(true);
                window.location.href = checkout.data.url;
                return;
            }

            await refresh();
            navigate(`/orders/${orderId}`, { state: { justPlaced: true } });

        } catch (err) {
            showError(extractErrorMessage(err));
        } finally {
            setSubmitting(false);
        }
    };

    if (items.length === 0) {
        return (
            <div className="max-w-lg mx-auto px-6 py-24 text-center animate-slide-up">
                <p className="font-display text-2xl mb-2">{t("cart.empty")}</p>
                <Link to="/" className="text-teal hover:underline text-sm">{t("common.browseMarketplace")}</Link>
            </div>
        );
    }

    const busy = submitting || redirecting;

    return (
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 grid md:grid-cols-5 gap-10 animate-fade-in">
            <form onSubmit={handleSubmit} className="md:col-span-3 space-y-4 animate-slide-up">
                <h1 className="font-display text-2xl mb-2">{t("checkout.title")}</h1>

                <div>
                    <label className="block text-sm mb-1">Street address</label>
                    <input required value={form.shipping_address} onChange={update("shipping_address")}
                        className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring transition-colors focus:border-teal" />
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="block text-sm mb-1">City</label>
                        <input required value={form.shipping_city} onChange={update("shipping_city")}
                            className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring transition-colors focus:border-teal" />
                    </div>
                    <div>
                        <label className="block text-sm mb-1">Region</label>
                        <input required value={form.shipping_region} onChange={update("shipping_region")}
                            className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring transition-colors focus:border-teal" />
                    </div>
                </div>

                <div>
                    <label className="block text-sm mb-1">Contact phone</label>
                    <input required value={form.shipping_phone} onChange={update("shipping_phone")}
                        className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring transition-colors focus:border-teal" />
                </div>

                <LocationPicker value={pin} onChange={setPin} />

                <div>
                    <label className="block text-sm mb-2">Payment method</label>
                    <div className="space-y-2">
                        {PAYMENT_METHODS.map((method) => {
                            const selected = form.payment_method === method.value;
                            return (
                                <label
                                    key={method.value}
                                    className={`flex items-center gap-2 border rounded-md px-3 py-2 text-sm cursor-pointer transition-all duration-200 ${
                                        selected ? "border-teal bg-teal/5 shadow-sm" : "border-line hover:border-ash"
                                    }`}
                                >
                                    <input type="radio" name="payment_method" value={method.value}
                                        checked={selected}
                                        onChange={update("payment_method")}
                                        className="accent-teal" />
                                    {method.label}
                                    {method.hint && <span className="text-xs text-ash">{method.hint}</span>}
                                </label>
                            );
                        })}
                    </div>
                </div>

                {error && (
                    <p key={errorTick} role="alert" className="text-coral text-sm animate-slide-down">
                        {error}
                    </p>
                )}

                <button type="submit" disabled={busy}
                    className="w-full bg-mango text-abyss py-3 rounded-md font-medium hover:bg-mango-dark active:scale-[0.99] transition-all focus-ring disabled:opacity-60 inline-flex items-center justify-center gap-2">
                    {busy && <span className="w-4 h-4 border-2 border-abyss/30 border-t-abyss rounded-full animate-spin" />}
                    {busy ? t("checkout.placingOrder") : `${t("checkout.placeOrderButton")} · ${format(total)}`}
                </button>
            </form>

            <div className="md:col-span-2 animate-slide-up" style={{ animationDelay: "80ms" }}>
                <h2 className="font-display text-lg mb-3">Order summary</h2>
                <ul className="space-y-3 mb-4">
                    {items.map((item) => (
                        <li key={item.cart_item_id} className="flex justify-between text-sm">
                            <span className="text-ink/80 truncate pr-2">{item.name} × {item.quantity}</span>
                            <span className="price shrink-0">{format(item.subtotal)}</span>
                        </li>
                    ))}
                </ul>
                <div className="flex justify-between border-t border-line pt-3">
                    <span className="text-sm">{t("common.total")}</span>
                    <span className="price font-medium">{format(total)}</span>
                </div>
            </div>
        </div>
    );
}
