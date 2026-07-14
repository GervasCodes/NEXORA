import { createContext, useCallback, useContext, useEffect, useState } from "react";
import api from "../api/client";
import { useAuth } from "./AuthContext";

const WishlistContext = createContext(null);

export function WishlistProvider({ children }) {
    const { user } = useAuth();
    const [ids, setIds] = useState(new Set());
    const [loaded, setLoaded] = useState(false);

    const refresh = useCallback(() => {
        if (!user || user.role !== "buyer") {
            setIds(new Set());
            setLoaded(true);
            return;
        }
        api.get("/wishlist/ids")
            .then(({ data }) => setIds(new Set(data.data)))
            .catch(() => {})
            .finally(() => setLoaded(true));
    }, [user]);

    useEffect(refresh, [refresh]);

    const isSaved = (productId) => ids.has(productId);

    
    const toggle = async (productId) => {
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
    };

    return (
        <WishlistContext.Provider value={{ ids, loaded, isSaved, toggle, refresh }}>
            {children}
        </WishlistContext.Provider>
    );
}

export function useWishlist() {
    return useContext(WishlistContext);
}
