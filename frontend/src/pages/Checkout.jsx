import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import api, { extractErrorMessage } from "../api/client";
import { useCart } from "../context/CartContext";
import { formatMoney } from "../utils/format";
import LocationPicker from "../components/LocationPicker";

const initialForm = {
    shipping_address: "",
    shipping_city: "",
    shipping_region: "",
    shipping_phone: "",
    payment_method: "mobile_money"
};

export default function Checkout() {
    const { items, total, refresh } = useCart();
    const navigate = useNavigate();
    const [form, setForm] = useState(initialForm);
    const [pin, setPin] = useState(null);
    const [error, setError] = useState("");
    const [submitting, setSubmitting] = useState(false);

    const update = (field) => (e) => setForm({ ...form, [field]: e.target.value });

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

            if (form.payment_method === "mobile_money") {
                await api.post(`/payments/${data.data.orderId}/initiate`);
            }

            await refresh();
            navigate(`/orders/${data.data.orderId}`, { state: { justPlaced: true } });

        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setSubmitting(false);
        }
    };

    if (items.length === 0) {
        return (
            <div className="max-w-lg mx-auto px-6 py-24 text-center">
                <p className="font-display text-2xl mb-2">Your cart is empty</p>
                <Link to="/" className="text-teal hover:underline text-sm">Browse the marketplace</Link>
            </div>
        );
    }

    return (
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 grid md:grid-cols-5 gap-10">
            <form onSubmit={handleSubmit} className="md:col-span-3 space-y-4">
                <h1 className="font-display text-2xl mb-2">Delivery details</h1>

                <div>
                    <label className="block text-sm mb-1">Street address</label>
                    <input required value={form.shipping_address} onChange={update("shipping_address")}
                        className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring" />
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="block text-sm mb-1">City</label>
                        <input required value={form.shipping_city} onChange={update("shipping_city")}
                            className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring" />
                    </div>
                    <div>
                        <label className="block text-sm mb-1">Region</label>
                        <input required value={form.shipping_region} onChange={update("shipping_region")}
                            className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring" />
                    </div>
                </div>

                <div>
                    <label className="block text-sm mb-1">Contact phone</label>
                    <input required value={form.shipping_phone} onChange={update("shipping_phone")}
                        className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring" />
                </div>

                <LocationPicker value={pin} onChange={setPin} />

                <div>
                    <label className="block text-sm mb-2">Payment method</label>
                    <div className="space-y-2">
                        <label className="flex items-center gap-2 border border-line rounded-md px-3 py-2 text-sm cursor-pointer">
                            <input type="radio" name="payment_method" value="mobile_money"
                                checked={form.payment_method === "mobile_money"}
                                onChange={update("payment_method")} />
                            Mobile Money
                        </label>
                        <label className="flex items-center gap-2 border border-line rounded-md px-3 py-2 text-sm cursor-pointer">
                            <input type="radio" name="payment_method" value="cash_on_delivery"
                                checked={form.payment_method === "cash_on_delivery"}
                                onChange={update("payment_method")} />
                            Cash on Delivery
                        </label>
                    </div>
                </div>

                {error && <p className="text-coral text-sm">{error}</p>}

                <button type="submit" disabled={submitting}
                    className="w-full bg-mango text-ink py-3 rounded-md font-medium hover:bg-mango-dark transition-colors focus-ring disabled:opacity-60">
                    {submitting ? "Placing order…" : `Place order · ${formatMoney(total)}`}
                </button>
            </form>

            <div className="md:col-span-2">
                <h2 className="font-display text-lg mb-3">Order summary</h2>
                <ul className="space-y-3 mb-4">
                    {items.map((item) => (
                        <li key={item.cart_item_id} className="flex justify-between text-sm">
                            <span className="text-ink/80 truncate pr-2">{item.name} × {item.quantity}</span>
                            <span className="price shrink-0">{formatMoney(item.subtotal)}</span>
                        </li>
                    ))}
                </ul>
                <div className="flex justify-between border-t border-line pt-3">
                    <span className="text-sm">Total</span>
                    <span className="price font-medium">{formatMoney(total)}</span>
                </div>
            </div>
        </div>
    );
}
