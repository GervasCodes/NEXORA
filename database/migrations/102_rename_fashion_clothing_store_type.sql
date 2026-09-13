-- Renames the "Fashion & Clothing" store type (014_store_types.sql) to
-- "Clothing & Apparel". It was never the same concept as the "Fashion &
-- Beauty" product department (040_categories_department_fields.sql) - one
-- classifies a seller's STORE, the other classifies a PRODUCT - but the two
-- names read as duplicates anywhere they appear near each other (the admin
-- store-types list, the seller registration store-type picker). The slug
-- is left untouched since nothing about the underlying row's identity is
-- changing, only the display label.
UPDATE store_types SET name = 'Clothing & Apparel' WHERE slug = 'fashion-clothing';
