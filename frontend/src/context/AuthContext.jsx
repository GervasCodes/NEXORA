import { createContext, useContext, useState, useCallback, useMemo, useEffect } from "react";
import api, { extractErrorMessage, registerSuspensionHandler } from "../api/client";

const AuthContext = createContext(null);

const loadStoredUser = () => {
    const raw = localStorage.getItem("nexora_user");
    return raw ? JSON.parse(raw) : null;
};

export function AuthProvider({ children }) {
    const [user, setUser] = useState(loadStoredUser());
    // Set whenever this account is suspended - either at login (before any
    // token exists) or mid-session, via the api/client.js response
    // interceptor. While set, App.jsx shows the full-screen suspended page
    // in place of the normal app, regardless of the current route.
    const [suspension, setSuspension] = useState(null);

    useEffect(() => {
        registerSuspensionHandler((reason) => {
            setUser(null);
            setSuspension({ reason });
        });
        return () => registerSuspensionHandler(null);
    }, []);

    const clearSuspension = useCallback(() => setSuspension(null), []);

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
            if (error.response?.data?.code === "ACCOUNT_SUSPENDED") {
                setSuspension({ reason: error.response.data?.data?.reason || null });
            }
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
            const isFormData = payload instanceof FormData;
            await api.post("/auth/register", payload, isFormData ? {
                headers: { "Content-Type": "multipart/form-data" }
            } : undefined);
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

    
    const value = useMemo(
        () => ({ user, login, verifyLoginOtp, resendLoginOtp, register, logout, updateUser, suspension, clearSuspension }),
        [user, login, verifyLoginOtp, resendLoginOtp, register, logout, updateUser, suspension, clearSuspension]
    );

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => useContext(AuthContext);
