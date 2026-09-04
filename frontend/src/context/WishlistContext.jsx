import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import api from "../api/client";
import { useAuth } from "./AuthContext";

const WishlistContext = createContext(null);

// Phase 5 (UI/UX remediation) - generalized to hold saved services
// alongside saved products, rather than a second parallel context.
// Every existing call site (isSaved(productId), toggle(productId)) that
// doesn't pass a type keeps working unchanged - "product" is the
// default type, matching how every caller before this phase behaved.
export function WishlistProvider({ children }) {
    const { user, sessionReady } = useAuth();
    const [productIds, setProductIds] = useState(new Set());
    const [serviceIds, setServiceIds] = useState(new Set());
    const [loaded, setLoaded] = useState(false);

    const refresh = useCallback(() => {
        // Same sessionReady gating as CartContext.jsx/NotificationBell.jsx -
        // `user` alone is only the optimistic localStorage value until
        // /auth/me confirms it (see AuthContext.jsx), so firing this
        // against `user` alone was producing a 401 on every load for
        // anyone whose session had actually expired.
        if (!user || !sessionReady || user.role !== "buyer") {
            setProductIds(new Set());
            setServiceIds(new Set());
            setLoaded(true);
            return;
        }
        api.get("/wishlist/ids")
            .then(({ data }) => {
                setProductIds(new Set(data.data.productIds || []));
                setServiceIds(new Set(data.data.serviceIds || []));
            })
            .catch(() => {})
            .finally(() => setLoaded(true));
    }, [user, sessionReady]);

    useEffect(refresh, [refresh]);

    const idsForType = useCallback((type) => (type === "service" ? serviceIds : productIds), [productIds, serviceIds]);
    const setIdsForType = useCallback((type, updater) => {
        if (type === "service") setServiceIds(updater); else setProductIds(updater);
    }, []);

    const isSaved = useCallback((id, type = "product") => idsForType(type).has(id), [idsForType]);

    const toggle = useCallback(async (id, type = "product") => {
        const alreadySaved = idsForType(type).has(id);
        setIdsForType(type, (prev) => {
            const next = new Set(prev);
            alreadySaved ? next.delete(id) : next.add(id);
            return next;
        });

        const basePath = type === "service" ? "/wishlist/services" : "/wishlist";

        try {
            if (alreadySaved) {
                await api.delete(`${basePath}/${id}`);
            } else {
                await api.post(`${basePath}/${id}`);
            }
        } catch {
            refresh();
        }
    }, [idsForType, setIdsForType, refresh]);

    const value = useMemo(
        () => ({ productIds, serviceIds, loaded, isSaved, toggle, refresh }),
        [productIds, serviceIds, loaded, isSaved, toggle, refresh]
    );

    return (
        <WishlistContext.Provider value={value}>
            {children}
        </WishlistContext.Provider>
    );
}

export function useWishlist() {
    return useContext(WishlistContext);
}
