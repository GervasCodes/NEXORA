-- Migration 132: SEO measurement (Phase 10, R1 §12).
--
-- web_vitals_samples: one row per Core Web Vital reported by a real
-- visitor's browser. `route` is a pattern ("/products/:slug"), never the
-- raw URL, so the table stays low-cardinality and holds no identifiers.
-- search_zero_results: searches that returned nothing, counted per term,
-- so the catalogue and the synonyms can be improved from real demand.
-- Both are additive and safe to re-run; nothing existing needs backfilling.

CREATE TABLE IF NOT EXISTS web_vitals_samples (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    metric ENUM('LCP', 'CLS', 'INP', 'FCP', 'TTFB') NOT NULL,
    value DOUBLE NOT NULL,
    rating ENUM('good', 'needs-improvement', 'poor') NOT NULL,
    route VARCHAR(120) NOT NULL,
    device ENUM('mobile', 'desktop') NOT NULL DEFAULT 'desktop',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_web_vitals_metric_time (metric, created_at),
    INDEX idx_web_vitals_route (route, metric)
);

CREATE TABLE IF NOT EXISTS search_zero_results (
    id INT AUTO_INCREMENT PRIMARY KEY,
    scope ENUM('products', 'services') NOT NULL DEFAULT 'products',
    term VARCHAR(120) NOT NULL,
    hits INT NOT NULL DEFAULT 1,
    first_seen_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_search_zero_results_term (scope, term),
    INDEX idx_search_zero_results_hits (hits)
);
