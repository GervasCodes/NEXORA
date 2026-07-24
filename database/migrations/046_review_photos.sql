-- Migration 046: review_photos
-- Depends on: reviews (009)
-- Additive only. Phase 6C - Enhanced Reviews.
--
-- Mirrors product_videos/product_audio (044/045): a small per-review
-- gallery table, no is_primary (a review has no single "cover" photo,
-- same reasoning as product_videos). Separate table rather than a JSON
-- column on `reviews` so photo count can be enforced and queried the
-- same way product_images/videos/audio already are.

CREATE TABLE IF NOT EXISTS review_photos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    review_id INT NOT NULL,

    photo_url VARCHAR(500) NOT NULL,
    display_order INT NOT NULL DEFAULT 0,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_review_photos_review
        FOREIGN KEY (review_id) REFERENCES reviews(id)
        ON DELETE CASCADE
);
