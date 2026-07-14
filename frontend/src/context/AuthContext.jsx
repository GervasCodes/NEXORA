import { createContext, useContext, useState, useCallback } from "react";
import api, { extractErrorMessage } from "../api/client";

const AuthContext = createContext(null);

const loadStoredUser = () => {
    const raw = localStorage.getItem("nexora_user");
    return raw ? JSON.parse(raw) : null;
};

export function AuthProvider({ children }) {
    const [user, setUser] = useState(loadStoredUser());

   
    const login = useCallback(async (email, password) => {
        try {
            const { data } = await api.post("/auth/login", { email, password });
            return {
                success: true,
                needsOtp: true,
                preAuthToken: data.data.preAuthToken,
                maskedEmail: data.data.maskedEmail
            };
        } catch (error) {
            return { success: false, message: extractErrorMessage(error) };
        }
    }, []);

    
    const verifyLoginOtp = useCallback(async (preAuthToken, code) => {
        try {
            const { data } = await api.post("/auth/login/verify-otp", { pre_auth_token: preAuthToken, code });
            localStorage.setItem("nexora_token", data.data.token);
            localStorage.setItem("nexora_user", JSON.stringify(data.data.user));
            setUser(data.data.user);
            return { success: true };
        } catch (error) {
            return { success: false, message: extractErrorMessage(error) };
        }
    }, []);

    const resendLoginOtp = useCallback(async (preAuthToken) => {
        try {
            await api.post("/auth/login/resend-otp", { pre_auth_token: preAuthToken });
            return { success: true };
        } catch (error) {
            return { success: false, message: extractErrorMessage(error) };
        }
    }, []);

    const register = useCallback(async (payload) => {
        try {
            await api.post("/auth/register", payload);
            return { success: true };
        } catch (error) {
            return { success: false, message: extractErrorMessage(error) };
        }
    }, []);

    const logout = useCallback(() => {
        localStorage.removeItem("nexora_token");
        localStorage.removeItem("nexora_user");
        setUser(null);
    }, []);

    const updateUser = useCallback((patch) => {
        setUser((prev) => {
            const next = { ...prev, ...patch };
            localStorage.setItem("nexora_user", JSON.stringify(next));
            return next;
        });
    }, []);

    return (
        <AuthContext.Provider value={{ user, login, verifyLoginOtp, resendLoginOtp, register, logout, updateUser }}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => useContext(AuthContext);
