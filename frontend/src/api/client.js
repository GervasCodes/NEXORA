import axios from "axios";

const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL || "http://localhost:5000/api/v1"
});

api.interceptors.request.use((config) => {
    const token = localStorage.getItem("nexora_token");
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

api.interceptors.response.use(
    (response) => response,
    (error) => {
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
