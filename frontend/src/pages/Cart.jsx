import { Link, useNavigate } from "react-router-dom";
import { useCart } from "../context/CartContext";
import { useCurrency } from "../context/CurrencyContext";

export default function Cart() {
    const { format } = useCurrency();
    const { items, total, loading, updateQuantity, removeFromCart } = useCart();
    const navigate = useNavigate();

    if (loading) {
        return <div className="max-w-3xl mx-auto px-6 py-16 text-ash">Loading cart…</div>;
    }

    if (items.length === 0) {
        return (
            <div className="max-w-3xl mx-auto px-6 py-24 text-center">
                <p className="font-display text-2xl mb-2">Your cart is empty</p>
                <Link to="/" className="text-teal hover:underline text-sm">Browse the marketplace</Link>
            </div>
        );
    }

    return (
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
            <h1 className="font-display text-3xl mb-8">Your cart</h1>

            <ul className="divide-y divide-line border-y border-line mb-8">
                {items.map((item) => (
                    <li key={item.cart_item_id} className="py-5 flex gap-4 items-center">
                        <div className="w-20 h-20 bg-line/40 rounded-md overflow-hidden shrink-0">
                            {item.image_url && (
                                <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                            )}
                        </div>

                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{item.name}</p>
                            <p className="price text-sm text-ash">{format(item.unit_price)} each</p>

                            <div className="flex items-center gap-3 mt-2">
                                <input
                                    type="number"
                                    min="1"
                                    max={item.stock}
                                    value={item.quantity}
                                    onChange={(e) => updateQuantity(item.product_id, Math.max(1, Number(e.target.value)))}
                                    className="w-16 border border-line rounded-md px-2 py-1 text-sm focus-ring"
                                />
                                <button
                                    onClick={() => removeFromCart(item.product_id)}
                                    className="text-xs text-coral hover:underline"
                                >
                                    Remove
                                </button>
                            </div>
                        </div>

                        <p className="price text-sm font-medium">{format(item.subtotal)}</p>
                    </li>
                ))}
            </ul>

            <div className="flex justify-between items-baseline mb-6">
                <span className="text-ash text-sm">Total</span>
                <span className="price text-2xl font-medium">{format(total)}</span>
            </div>

            <button
                onClick={() => navigate("/checkout")}
                className="w-full sm:w-auto bg-mango text-ink px-8 py-3 rounded-md font-medium hover:bg-mango-dark transition-colors focus-ring"
            >
                Proceed to checkout
            </button>
        </div>
    );
}
