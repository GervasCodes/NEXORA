-- Efficiency pass on the product catalog, the most frequently hit table
-- in the app (every storefront visit, every search, every category page).
--
-- 1) The public listing query (product.repository.js findAll) always
--    filters `is_active = 1`, optionally `category_id = ?`, and always
--    sorts by `created_at DESC`. Neither of those was a composite index
--    before - `category_id` had an implicit single-column index from its
--    FK constraint, but MySQL can't also use that to satisfy the ORDER BY
--    for free. These two composite indexes cover both the
--    "browse a category" and "browse everything" cases without a
--    filesort.
--
-- 2) Search (`name LIKE '%term%'`) can never use a B-tree index - the
--    leading wildcard forces a full table scan every time, and it only
--    gets slower as the catalog grows. A FULLTEXT index lets MySQL use
--    MATCH...AGAINST instead: indexed, ranked by relevance, and it
--    understands word boundaries instead of doing raw substring matching.
--    product.repository.js has been updated to use it (with a LIKE
--    fallback for 1-2 character queries, which FULLTEXT's default
--    minimum word length would silently ignore).

CREATE INDEX idx_products_active_created ON products (is_active, created_at);
CREATE INDEX idx_products_category_active ON products (category_id, is_active);

ALTER TABLE products ADD FULLTEXT INDEX ft_products_search (name, brand, description);
