import axios from "axios";

const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL || "http://localhost:5000/api/v1"
});

// AuthContext registers a handler here on mount. api/client.js lives
// outside the React tree, so this is the hook that lets a suspension
// discovered mid-session (a still-valid token whose account an admin
// just suspended - see auth.middleware.js) reach AuthContext and show
// the full-screen suspended page, regardless of what route the person
// was on when it happened.
let suspensionHandler = null;
export const registerSuspensionHandler = (handler) => {
    suspensionHandler = handler;
};

// AuthContext registers a handler here too (Phase 2: Session expiry).
// Fired only when a 401 arrives for a request that WAS carrying a real
// token - i.e. an existing session just died server-side (natural JWT
// expiry, password change invalidating token_version, etc) - never for
// an anonymous call made while already logged out, which would be a
// confusing "session expired" toast for someone who was never signed in.
let sessionExpiredHandler = null;
export const registerSessionExpiredHandler = (handler) => {
    sessionExpiredHandler = handler;
};

api.interceptors.request.use((config) => {
    const token = localStorage.getItem("nexora_token");
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
        // Last-activity marker AuthContext's idle-expiry check reads on
        // load (see AuthContext.jsx) - refreshed on every authenticated
        // request, so a person actively using the app never gets logged
        // out mid-session no matter how long that session runs.
        localStorage.setItem("nexora_last_activity", Date.now().toString());
    }
    // Kept in sync with LanguageContext's own localStorage key - read
    // directly here (rather than via the hook) so this works even for
    // requests fired before the provider mounts.
    const language = localStorage.getItem("nexora_language");
    if (language) {
        config.headers["Accept-Language"] = language;
    }
    return config;
});

api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.data?.code === "ACCOUNT_SUSPENDED") {
            localStorage.removeItem("nexora_token");
            localStorage.removeItem("nexora_user");
            localStorage.removeItem("nexora_last_activity");
            suspensionHandler?.(error.response.data?.data?.reason || null);
            return Promise.reject(error);
        }

        if (error.response?.status === 401) {
            const hadToken = Boolean(localStorage.getItem("nexora_token"));
            localStorage.removeItem("nexora_token");
            localStorage.removeItem("nexora_user");
            localStorage.removeItem("nexora_last_activity");
            if (hadToken) {
                sessionExpiredHandler?.();
            }
        }
        return Promise.reject(error);
    }
);

// Small helper so callers get a clean message string regardless of
// whether the backend sent { message } or { errors: [...] }
export const extractErrorMessage = (error) => {
    const data = error?.response?.data;
    if (data?.message) return data.message;
    if (data?.errors?.length) return data.errors[0].msg || data.errors[0].message;
    return "Something went wrong. Please try again";
};

export default api;
