import api from "./client";

// Thin wrappers over /api/v1/search - see backend/src/modules/search.
// Both are deliberately quiet about failure: trending is a nice-to-have
// list (callers fall back to a static list of their own), and logging is
// fire-and-forget (SearchBox.jsx never awaits it before navigating).

export const fetchTrendingSearches = () =>
    api.get("/search/trending").then((res) => res.data.data || []);

export const logSearchQuery = (term) => {
    api.post("/search/log", { term }).catch(() => {});
};
