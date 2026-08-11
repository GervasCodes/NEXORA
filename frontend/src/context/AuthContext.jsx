import { createContext, useContext, useState, useCallback, useMemo, useEffect } from "react";
import api, { extractErrorMessage, registerSuspensionHandler, registerSessionExpiredHandler } from "../api/client";

const AuthContext = createContext(null);

// Phase 2: Session expiry. A session with no activity for this long is
// treated as stale and cleared proactively on next app load, rather than
// riding out the full 7-day JWT and dying with a confusing mid-session
// 401 (see api/client.js's request interceptor, which refreshes
// nexora_last_activity on every authenticated call).
const IDLE_EXPIRY_MS = 3 * 24 * 60 * 60 * 1000; // 3 days

const isIdleExpired = () => {
    const lastActivity = Number(localStorage.getItem("nexora_last_activity") || 0);
    return Boolean(lastActivity) && Date.now() - lastActivity > IDLE_EXPIRY_MS;
};

const loadStoredUser = () => {
    // Checked here (not just in the effect below) so a stale user never
    // even briefly renders as logged-in on first paint.
    if (isIdleExpired()) return null;
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
    // Set either by the idle check below or by api/client.js's 401
    // handler (a session that died server-side mid-use). App.jsx watches
    // this to show a clear "your session expired" toast and send the
    // person back to /login, instead of the old silent-clear-and-hope
    // behavior.
    const [sessionExpired, setSessionExpired] = useState(false);

    useEffect(() => {
        registerSuspensionHandler((reason) => {
            setUser(null);
            setSuspension({ reason });
        });
        registerSessionExpiredHandler(() => {
            setUser(null);
            setSessionExpired(true);
        });
        return () => {
            registerSuspensionHandler(null);
            registerSessionExpiredHandler(null);
        };
    }, []);

    // Runs once on mount - if the stored session was already idle-expired
    // (see loadStoredUser above), actually clear the leftover localStorage
    // entries and surface the same "session expired" notice.
    useEffect(() => {
        if (isIdleExpired()) {
            localStorage.removeItem("nexora_token");
            localStorage.removeItem("nexora_user");
            localStorage.removeItem("nexora_last_activity");
            setSessionExpired(true);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const clearSuspension = useCallback(() => setSuspension(null), []);
    const clearSessionExpired = useCallback(() => setSessionExpired(false), []);

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
        localStorage.removeItem("nexora_last_activity");
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
        () => ({
            user, login, verifyLoginOtp, resendLoginOtp, register, logout, updateUser,
            suspension, clearSuspension, sessionExpired, clearSessionExpired
        }),
        [user, login, verifyLoginOtp, resendLoginOtp, register, logout, updateUser,
            suspension, clearSuspension, sessionExpired, clearSessionExpired]
    );

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => useContext(AuthContext);
