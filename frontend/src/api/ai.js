import api from "./client";

// Thin wrappers over /api/v1/ai - every response carries `aiGenerated`
// so the UI can show a "no AI available right now" state without that
// ever meaning the feature itself stops working (backend always returns
// a template/fallback value too - see ai.service.js).
export const sendChatMessage = (message) =>
    api.post("/ai/chat", { message }).then((res) => res.data.data);

export const parseSearchQuery = (text) =>
    api.post("/ai/search/parse", { text }).then((res) => res.data.data);

export const explainRecommendations = (context) =>
    api.get(`/ai/recommendations/${encodeURIComponent(context)}/explain`).then((res) => res.data.data);

export const explainOrderStatus = (orderId) =>
    api.post(`/ai/orders/${orderId}/explain`).then((res) => res.data.data);

// --- Phase B2: seller/provider AI (draft-generation, no auto-execute) ---
// Every response here is a draft the seller/provider must review before
// using it anywhere - none of these save/publish anything themselves.

export const generateListingDraft = (payload) =>
    api.post("/ai/seller/listing-draft", payload).then((res) => res.data.data);

export const generateMarketingCopy = (payload) =>
    api.post("/ai/seller/marketing-copy", payload).then((res) => res.data.data);

export const summarizeSellerAnalytics = () =>
    api.get("/ai/seller/analytics/summary").then((res) => res.data.data);

export const suggestAvailability = (serviceId) =>
    api.get(`/ai/seller/services/${serviceId}/availability-suggestion`).then((res) => res.data.data);

export const explainDeliveryRoute = () =>
    api.get("/ai/delivery/route").then((res) => res.data.data);

// --- Phase B3: Admin AI Copilot (advisory only, never auto-acts) ---------
// Every response here is read-only or a draft the admin must review -
// none of these save/resolve/dismiss anything themselves.

export const summarizeDispute = (disputeId) =>
    api.get(`/ai/admin/disputes/${disputeId}/summary`).then((res) => res.data.data);

export const suggestDisputeResolution = (disputeId) =>
    api.post(`/ai/admin/disputes/${disputeId}/suggest-resolution`).then((res) => res.data.data);

export const explainFraudQueue = () =>
    api.get("/ai/admin/fraud-flags/explain").then((res) => res.data.data);

export const explainForecast = (vertical = "products") =>
    api.get(`/ai/admin/analytics/forecast-explain?vertical=${vertical}`).then((res) => res.data.data);

export const explainPersonalizationHealth = () =>
    api.get("/ai/admin/personalization/explain").then((res) => res.data.data);
