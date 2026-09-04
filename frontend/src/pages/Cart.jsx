import { Link, useNavigate } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { useCart } from "../context/CartContext";
import { useCurrency } from "../context/CurrencyContext";
import { useLanguage } from "../context/LanguageContext";
import { useToast } from "../context/ToastContext";
import { useWishlist } from "../context/WishlistContext";
import { SkeletonList } from "../components/Skeleton";
import Button from "../components/ui/Button";
import QuantityStepper from "../components/ui/QuantityStepper";
import EmptyState from "../components/ui/EmptyState";
import PageMeta from "../components/PageMeta";
import { CartIcon } from "../components/NavIcons";

// Same debounce interval as SearchBox.jsx's DEBOUNCE_MS - quantity edits
// were previously firing an API call on every keystroke/spinner click.
const QUANTITY_DEBOUNCE_MS = 400;

export default function Cart() {
    const { format } = useCurrency();
    const { items, total, loading, updateQuantity, removeFromCart } = useCart();
    const wishlist = useWishlist();
    const navigate = useNavigate();
    const { t } = useLanguage();
    const toast = useToast();
    const [placing, setPlacing] = useState(false);
    const [savingForLater, setSavingForLater] = useState(null);

    // Local, per-item override so the input reflects what's being typed
    // immediately, while the actual updateQuantity() call is debounced.
    // Cleared once the debounced call resolves, at which point `items`
    // (from CartContext) is the source of truth again.
    const [pendingQuantities, setPendingQuantities] = useState({});
    const debounceTimers = useRef({});

    useEffect(() => {
        const timers = debounceTimers.current;
        return () => {
            Object.values(timers).forEach(clearTimeout);
        };
    }, []);

    const displayQuantity = (item) =>
        pendingQuantities[item.product_id] !== undefined ? pendingQuantities[item.product_id] : item.quantity;

    // updateQuantity/removeFromCart already return { success, message } (see
    // CartContext.jsx) - this page just wasn't surfacing that message
    // anywhere, so a failed update silently no-opped. Route it through the
    // shared toast, same as every other buyer-flow page.
    const handleQuantityChange = (productId, quantity) => {
        setPendingQuantities((prev) => ({ ...prev, [productId]: quantity }));

        clearTimeout(debounceTimers.current[productId]);
        debounceTimers.current[productId] = setTimeout(async () => {
            const result = await updateQuantity(productId, quantity);
            if (!result?.success) toast?.error(result?.message || "Couldn't update quantity.");
            setPendingQuantities((prev) => {
                const { [productId]: _discard, ...rest } = prev;
                return rest;
            });
        }, QUANTITY_DEBOUNCE_MS);
    };

    const handleRemove = async (productId) => {
        clearTimeout(debounceTimers.current[productId]);
        delete debounceTimers.current[productId];
        setPendingQuantities((prev) => {
            const { [productId]: _discard, ...rest } = prev;
            return rest;
        });
        const result = await removeFromCart(productId);
        if (!result?.success) toast?.error(result?.message || "Couldn't remove item.");
    };

    // Save for later (Phase 1, UI/UX remediation) - reuses the same
    // WishlistContext.toggle() the heart icon on ProductCard already
    // calls, rather than a second, parallel "add to wishlist" call.
    // Guarded with isSaved() first since toggle() is a true toggle (it
    // would remove the item if it somehow got there already) - here we
    // only ever want to add.
    const handleSaveForLater = async (item) => {
        setSavingForLater(item.product_id);
        try {
            if (!wishlist?.isSaved(item.product_id)) {
                await wishlist.toggle(item.product_id);
            }
            const result = await removeFromCart(item.product_id);
            if (!result?.success) toast?.error(result?.message || "Couldn't move item to saved.");
        } finally {
            setSavingForLater(null);
        }
    };

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
            <div className="max-w-3xl mx-auto px-6 py-10">
                <EmptyState
                    title={t("cart.empty")}
                    tone="azure"
                    icon={<CartIcon className="w-7 h-7" />}
                    action={<Link to="/" className="text-teal hover:underline text-sm">{t("common.browseMarketplace")}</Link>}
                />
            </div>
        );
    }

    const handleCheckout = () => {
        setPlacing(true);
        navigate("/checkout");
    };

    // Group by seller (Phase 1, UI/UX remediation) - a multi-vendor cart
    // previously rendered as one flat list with no indication a buyer
    // was ordering from several different stores at once, even though
    // checkout itself already splits the resulting order per vendor
    // (see order.service.js#checkout's isMultiVendor path) and Orders.jsx
    // already shows that split after the fact. This surfaces the same
    // seller grouping up front, before checkout, instead of only after.
    // A Map (not a plain object) preserves each seller's first-appearance
    // order rather than re-sorting by insertion-order-of-numeric-keys.
    const groupedBySeller = [...items.reduce((map, item) => {
        const key = item.seller_id;
        if (!map.has(key)) {
            map.set(key, { sellerId: key, storeName: item.store_name, items: [] });
        }
        map.get(key).items.push(item);
        return map;
    }, new Map()).values()];

    return (
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 animate-fade-in">
            <PageMeta title="Cart" noIndex />
            <h1 className="font-display text-3xl mb-8">{t("cart.title")}</h1>

            {groupedBySeller.map((group, groupIndex) => (
                <div key={group.sellerId} className="mb-8">
                    {groupedBySeller.length > 1 && (
                        <p className="text-xs font-semibold uppercase tracking-wide text-ash mb-2">
                            {group.storeName || "Store"}
                        </p>
                    )}
                    <ul className="divide-y divide-line border-y border-line">
                        {group.items.map((item, i) => (
                            <li
                                key={item.cart_item_id}
                                className="py-5 flex gap-4 items-center animate-slide-up"
                                style={{ animationDelay: `${Math.min(groupIndex * 2 + i, 6) * 40}ms` }}
                            >
                                <div className="w-20 h-20 bg-line/40 rounded-md overflow-hidden shrink-0 transition-transform duration-300 hover:scale-105">
                                    {item.image_url && (
                                        <img src={item.image_url} alt={item.name} loading="lazy" decoding="async" className="w-full h-full object-cover" />
                                    )}
                                </div>

                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium truncate">{item.name}</p>
                                    <p className="price text-sm text-ash">{format(item.unit_price)} {t("common.each")}</p>

                                    <div className="flex items-center gap-3 mt-2 flex-wrap">
                                        <QuantityStepper
                                            value={displayQuantity(item)}
                                            onChange={(quantity) => handleQuantityChange(item.product_id, quantity)}
                                            min={1}
                                            max={item.stock}
                                        />
                                        <button
                                            onClick={() => handleSaveForLater(item)}
                                            disabled={savingForLater === item.product_id}
                                            className="text-xs text-ash hover:text-ink hover:underline transition-opacity disabled:opacity-50"
                                        >
                                            {t("common.saveForLater")}
                                        </button>
                                        <button
                                            onClick={() => handleRemove(item.product_id)}
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
                </div>
            ))}

            <div className="flex justify-between items-baseline mb-6 animate-slide-up" style={{ animationDelay: "160ms" }}>
                <span className="text-ash text-sm">{t("common.total")}</span>
                <span className="price text-2xl font-medium">{format(total)}</span>
            </div>

            <Button
                onClick={handleCheckout}
                disabled={placing}
                className="w-full sm:w-auto gap-2 active:scale-[0.98] animate-slide-up !px-8 !py-3"
                style={{ animationDelay: "200ms" }}
            >
                {placing && <span className="w-4 h-4 border-2 border-abyss/30 border-t-abyss rounded-full animate-spin" />}
                {t("cart.checkoutButton")}
            </Button>
        </div>
    );
}
