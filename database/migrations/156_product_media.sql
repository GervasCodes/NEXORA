-- Migration 156: product_media - one ordered gallery of photos AND videos.
-- Depends on: products (004), product_images (004), product_videos (044).
-- Additive and re-runnable. The old tables stay in place and stay readable;
-- the new upload wizard writes to product_media and mirrors each row into
-- product_images / product_videos so every existing reader keeps working.
-- legacy_id points at the mirrored row (product_images.id or product_videos.id).

CREATE TABLE IF NOT EXISTS product_media (
    id INT AUTO_INCREMENT PRIMARY KEY,
    product_id INT NOT NULL,
    kind ENUM('image', 'video') NOT NULL,
    url VARCHAR(500) NOT NULL,
    public_id VARCHAR(255) NULL,
    poster_url VARCHAR(500) NULL,
    width INT NULL,
    height INT NULL,
    duration_s DECIMAL(8,2) NULL,
    bytes INT UNSIGNED NULL,
    position INT NOT NULL DEFAULT 0,
    is_cover BOOLEAN NOT NULL DEFAULT FALSE,
    edits JSON NULL,
    legacy_id INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_product_media_product
        FOREIGN KEY (product_id) REFERENCES products(id)
        ON DELETE CASCADE,
    UNIQUE KEY uq_product_media_legacy (product_id, kind, legacy_id),
    INDEX idx_product_media_order (product_id, position)
);

-- Backfill photos (in their display order), then videos after them.
INSERT INTO product_media (product_id, kind, url, position, is_cover, legacy_id)
SELECT pi.product_id, 'image', pi.image_url,
       ROW_NUMBER() OVER (PARTITION BY pi.product_id ORDER BY pi.display_order, pi.id) - 1,
       pi.is_primary, pi.id
FROM product_images pi
WHERE NOT EXISTS (
    SELECT 1 FROM product_media pm
    WHERE pm.product_id = pi.product_id AND pm.kind = 'image' AND pm.legacy_id = pi.id
);

INSERT INTO product_media (product_id, kind, url, position, is_cover, legacy_id)
SELECT pv.product_id, 'video', pv.video_url,
       (SELECT COUNT(*) FROM product_images i WHERE i.product_id = pv.product_id)
         + ROW_NUMBER() OVER (PARTITION BY pv.product_id ORDER BY pv.display_order, pv.id) - 1,
       FALSE, pv.id
FROM product_videos pv
WHERE NOT EXISTS (
    SELECT 1 FROM product_media pm
    WHERE pm.product_id = pv.product_id AND pm.kind = 'video' AND pm.legacy_id = pv.id
);
