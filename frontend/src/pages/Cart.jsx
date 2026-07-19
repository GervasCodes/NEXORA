import { Link, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useCart } from "../context/CartContext";
import { useCurrency } from "../context/CurrencyContext";
import { useLanguage } from "../context/LanguageContext";
import { SkeletonList } from "../components/Skeleton";

export default function Cart() {
    const { format } = useCurrency();
    const { items, total, loading, updateQuantity, removeFromCart } = useCart();
    const navigate = useNavigate();
    const { t } = useLanguage();
    const [placing, setPlacing] = useState(false);

    if (loading) {
        return (
            <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
                <div className="h-9 w-40 skeleton animate-shimmer rounded-md mb-8" />
                <SkeletonList rows={3} />
            </div>
        );
    }

    if (items.length === 0) {
        return (
            <div className="max-w-3xl mx-auto px-6 py-24 text-center animate-slide-up">
                <p className="font-display text-2xl mb-2">{t("cart.empty")}</p>
                <Link to="/" className="text-teal hover:underline text-sm">{t("common.browseMarketplace")}</Link>
            </div>
        );
    }

    const handleCheckout = () => {
        setPlacing(true);
        navigate("/checkout");
    };

    return (
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 animate-fade-in">
            <h1 className="font-display text-3xl mb-8">{t("cart.title")}</h1>

            <ul className="divide-y divide-line border-y border-line mb-8">
                {items.map((item, i) => (
                    <li
                        key={item.cart_item_id}
                        className="py-5 flex gap-4 items-center animate-slide-up"
                        style={{ animationDelay: `${Math.min(i, 6) * 40}ms` }}
                    >
                        <div className="w-20 h-20 bg-line/40 rounded-md overflow-hidden shrink-0 transition-transform duration-300 hover:scale-105">
                            {item.image_url && (
                                <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                            )}
                        </div>

                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{item.name}</p>
                            <p className="price text-sm text-ash">{format(item.unit_price)} {t("common.each")}</p>

                            <div className="flex items-center gap-3 mt-2">
                                <input
                                    type="number"
                                    min="1"
                                    max={item.stock}
                                    value={item.quantity}
                                    onChange={(e) => updateQuantity(item.product_id, Math.max(1, Number(e.target.value)))}
                                    className="w-16 border border-line rounded-md px-2 py-1 text-sm focus-ring transition-colors focus:border-teal"
                                />
                                <button
                                    onClick={() => removeFromCart(item.product_id)}
                                    className="text-xs text-coral hover:underline transition-opacity hover:opacity-70"
                                >
                                    {t("common.remove")}
                                </button>
                            </div>
                        </div>

                        <p className="price text-sm font-medium">{format(item.subtotal)}</p>
                    </li>
                ))}
            </ul>

            <div className="flex justify-between items-baseline mb-6 animate-slide-up" style={{ animationDelay: "160ms" }}>
                <span className="text-ash text-sm">{t("common.total")}</span>
                <span className="price text-2xl font-medium">{format(total)}</span>
            </div>

            <button
                onClick={handleCheckout}
                disabled={placing}
                className="w-full sm:w-auto bg-mango text-abyss px-8 py-3 rounded-md font-medium hover:bg-mango-dark active:scale-[0.98] transition-all focus-ring disabled:opacity-60 animate-slide-up inline-flex items-center justify-center gap-2"
                style={{ animationDelay: "200ms" }}
            >
                {placing && <span className="w-4 h-4 border-2 border-abyss/30 border-t-abyss rounded-full animate-spin" />}
                {t("cart.checkoutButton")}
            </button>
        </div>
    );
}
