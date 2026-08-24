import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import api from "../api/client";
import { useAuth } from "./AuthContext";

const WishlistContext = createContext(null);

export function WishlistProvider({ children }) {
    const { user, sessionReady } = useAuth();
    const [ids, setIds] = useState(new Set());
    const [loaded, setLoaded] = useState(false);

    const refresh = useCallback(() => {
        // Same sessionReady gating as CartContext.jsx/NotificationBell.jsx -
        // `user` alone is only the optimistic localStorage value until
        // /auth/me confirms it (see AuthContext.jsx), so firing this
        // against `user` alone was producing a 401 on every load for
        // anyone whose session had actually expired.
        if (!user || !sessionReady || user.role !== "buyer") {
            setIds(new Set());
            setLoaded(true);
            return;
        }
        api.get("/wishlist/ids")
            .then(({ data }) => setIds(new Set(data.data)))
            .catch(() => {})
            .finally(() => setLoaded(true));
    }, [user, sessionReady]);

    useEffect(refresh, [refresh]);

    const isSaved = useCallback((productId) => ids.has(productId), [ids]);

    
    const toggle = useCallback(async (productId) => {
        const alreadySaved = ids.has(productId);
        setIds((prev) => {
            const next = new Set(prev);
            alreadySaved ? next.delete(productId) : next.add(productId);
            return next;
        });

        try {
            if (alreadySaved) {
                await api.delete(`/wishlist/${productId}`);
            } else {
                await api.post(`/wishlist/${productId}`);
            }
        } catch {
            refresh();
        }
    }, [ids, refresh]);

    const value = useMemo(
        () => ({ ids, loaded, isSaved, toggle, refresh }),
        [ids, loaded, isSaved, toggle, refresh]
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
