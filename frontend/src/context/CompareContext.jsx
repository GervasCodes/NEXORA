import { createContext, useCallback, useContext, useMemo, useState } from "react";

const CompareContext = createContext(null);

// Phase 3 (UI/UX remediation) - lightweight product comparison tray.
// Deliberately client-side only (no backend, no persistence beyond this
// session) - comparing 2-3 products while browsing is a short-lived,
// disposable task, not something worth a saved-across-devices feature
// the way wishlist/cart are. Caps at MAX_COMPARE items, matching the
// common comparison-tray pattern of a small fixed limit rather than an
// open-ended list.
const MAX_COMPARE = 3;

export function CompareProvider({ children }) {
    // Keyed by product id -> the product object itself (not just the id),
    // so the tray and comparison table can render name/image/price
    // without a second fetch - the product data is already sitting in
    // whatever ProductCard/ProductGrid rendered it.
    const [items, setItems] = useState(new Map());

    const isComparing = useCallback((productId) => items.has(productId), [items]);

    const toggle = useCallback((product) => {
        setItems((prev) => {
            const next = new Map(prev);
            if (next.has(product.id)) {
                next.delete(product.id);
            } else {
                if (next.size >= MAX_COMPARE) {
                    return prev;
                }
                next.set(product.id, product);
            }
            return next;
        });
    }, []);

    const remove = useCallback((productId) => {
        setItems((prev) => {
            const next = new Map(prev);
            next.delete(productId);
            return next;
        });
    }, []);

    const clear = useCallback(() => setItems(new Map()), []);

    const value = useMemo(
        () => ({
            items: Array.from(items.values()),
            count: items.size,
            maxCompare: MAX_COMPARE,
            isComparing,
            toggle,
            remove,
            clear
        }),
        [items, isComparing, toggle, remove, clear]
    );

    return <CompareContext.Provider value={value}>{children}</CompareContext.Provider>;
}

export const useCompare = () => useContext(CompareContext);
