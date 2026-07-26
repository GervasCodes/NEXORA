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

api.interceptors.request.use((config) => {
    const token = localStorage.getItem("nexora_token");
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
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
            suspensionHandler?.(error.response.data?.data?.reason || null);
            return Promise.reject(error);
        }

        if (error.response?.status === 401) {
            localStorage.removeItem("nexora_token");
            localStorage.removeItem("nexora_user");
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
