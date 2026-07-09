import { createContext, useContext, useState, useCallback, useEffect } from "react";
import api, { extractErrorMessage } from "../api/client";
import { useAuth } from "./AuthContext";

const CartContext = createContext(null);

export function CartProvider({ children }) {
    const { user } = useAuth();
    const [items, setItems] = useState([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(false);

    const refresh = useCallback(async () => {
        if (!user || user.role !== "buyer") {
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
            // Silently ignore - cart just stays empty if this fails
        } finally {
            setLoading(false);
        }
    }, [user]);

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

    return (
        <CartContext.Provider
            value={{ items, total, itemCount, loading, addToCart, updateQuantity, removeFromCart, refresh }}
        >
            {children}
        </CartContext.Provider>
    );
}

export const useCart = () => useContext(CartContext);
