import { createContext, useContext, useState, useCallback, useEffect, useMemo } from "react";
import api, { extractErrorMessage } from "../api/client";
import { useAuth } from "./AuthContext";

const CartContext = createContext(null);

export function CartProvider({ children }) {
    const { user, sessionReady } = useAuth();
    const [items, setItems] = useState([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(false);

    const refresh = useCallback(async () => {
        // sessionReady gates this the same way NotificationBell.jsx
        // already had to be fixed to: `user` alone is only the
        // *optimistic* value straight out of localStorage (see
        // AuthContext.jsx's loadStoredUser) until the /auth/me check
        // confirms or corrects it. Firing GET /cart against that stale
        // value produced a 401 on every load for anyone whose session
        // had actually expired - the same request would just fire again,
        // correctly, once sessionReady flips true and this effect re-runs.
        if (!user || !sessionReady || user.role !== "buyer") {
            setItems([]);
            setTotal(0);
            return;
        }

        setLoading(true);
        try {
            const { data } = await api.get("/cart");
            setItems(data.data.items);
            setTotal(data.data.total);
        } catch (error) {
            console.error("Failed to refresh cart:", error);
        } finally {
            setLoading(false);
        }
    }, [user, sessionReady]);

    useEffect(() => {
        refresh();
    }, [refresh]);

    const addToCart = useCallback(async (productId, quantity = 1) => {
        try {
            await api.post("/cart", { product_id: productId, quantity });
            await refresh();
            return { success: true };
        } catch (error) {
            return { success: false, message: extractErrorMessage(error) };
        }
    }, [refresh]);

    const updateQuantity = useCallback(async (productId, quantity) => {
        try {
            await api.put(`/cart/${productId}`, { quantity });
            await refresh();
            return { success: true };
        } catch (error) {
            return { success: false, message: extractErrorMessage(error) };
        }
    }, [refresh]);

    const removeFromCart = useCallback(async (productId) => {
        try {
            await api.delete(`/cart/${productId}`);
            await refresh();
            return { success: true };
        } catch (error) {
            return { success: false, message: extractErrorMessage(error) };
        }
    }, [refresh]);

    const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);

    const value = useMemo(
        () => ({ items, total, itemCount, loading, addToCart, updateQuantity, removeFromCart, refresh }),
        [items, total, itemCount, loading, addToCart, updateQuantity, removeFromCart, refresh]
    );

    return (
        <CartContext.Provider value={value}>
            {children}
        </CartContext.Provider>
    );
}

export const useCart = () => useContext(CartContext);
