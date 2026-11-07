-- Migration 160: search_queries - logs terms shoppers actually search for, so the
-- SearchBox dropdown can show "trending" alongside "recent" (recent is per-device,
-- localStorage only - see frontend/src/utils/recentSearches.js; trending needs a
-- server-side view across everyone).
--
-- One row per submitted search (not per keystroke/suggestion fetch - see
-- search.controller.js#logQuery, called only from SearchBox.jsx's submit paths,
-- same as addRecentSearch()). normalized_term is lowercase/trimmed so
-- "Phone", "phone ", "PHONE" all roll up into one trending entry; term keeps
-- the original casing purely for reference/debugging and is never displayed.
--
-- Logged anonymously, no user_id - search is public (buyer, seller, or a
-- logged-out shopper all search), and trending should reflect everyone
-- equally rather than needing a join to the users table on the hot read path.
--
-- Additive and re-runnable: CREATE TABLE IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS search_queries (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    term VARCHAR(200) NOT NULL,
    normalized_term VARCHAR(200) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_search_queries_trending (normalized_term, created_at)
) ENGINE=InnoDB;
