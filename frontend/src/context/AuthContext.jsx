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
    // Phase 4 (Testing & Session Hardening): this is now an *optimistic*
    // value only, for instant first paint - not authoritative. The real
    // session lives in an httpOnly cookie this code can't read, so it
    // can't actually confirm anyone is still logged in; it can only
    // avoid a flash-of-logged-out for someone who probably still is,
    // while the checkSession() effect below confirms (or corrects) it
    // against the server moments later.
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
            localStorage.removeItem("nexora_user");
            localStorage.removeItem("nexora_last_activity");
            setSessionExpired(true);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Phase 4 (Testing & Session Hardening): loadStoredUser's initial
    // value is optimistic only - it can't actually see whether the
    // httpOnly session cookie is still valid. This confirms it against
    // the server on every app load. Only acts when there WAS a cached
    // user to begin with; a fresh visitor with no cookie and no cached
    // user getting a 401 here is expected, not an error to react to.
    useEffect(() => {
        if (!localStorage.getItem("nexora_user")) return;
        api.get("/auth/me")
            .then(({ data }) => {
                setUser(data.data.user);
                localStorage.setItem("nexora_user", JSON.stringify(data.data.user));
            })
            .catch(() => {
                // A 401 here already goes through api/client.js's response
                // interceptor (clears localStorage, may fire
                // sessionExpiredHandler) - nothing further needed on a
                // failure beyond making sure the in-memory user doesn't
                // keep showing as logged in while that resolves.
                setUser(null);
            });
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
            // Phase 4 (Testing & Session Hardening): no more token in the
            // response body to store - the backend sets it as an
            // httpOnly cookie directly (see auth.controller.js). Only
            // the (non-sensitive) user profile is cached here, for
            // instant display on the next page load.
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
        // Phase 4 (Testing & Session Hardening): the session cookie is
        // httpOnly - no amount of localStorage.removeItem clears it,
        // only a Set-Cookie response from the server can (see
        // auth.controller.js#logout). Fire-and-forget: the local state
        // clears immediately below regardless of whether this network
        // call succeeds, so a flaky connection never leaves someone
        // stuck on a "logging out..." state - worst case, the cookie
        // outlives the local session by a request or two rather than
        // blocking the UI on it.
        api.post("/auth/logout").catch(() => {});
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
