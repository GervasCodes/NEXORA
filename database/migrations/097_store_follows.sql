-- Migration 097: Phase 6 (UI/UX remediation) - store follows
-- Run after 096_wishlist_services_and_alerts.sql.
--
-- Minimal follow relationship between a buyer and a store (a seller's
-- user_id, same as how seller_profiles.user_id already identifies a
-- store everywhere else in this codebase - there's no separate "store
-- id"). Deliberately just this one table: notification dispatch reuses
-- the existing pushService/notificationService pipeline (see
-- store.service.js#notifyFollowers) rather than a new delivery
-- mechanism, so nothing else needs to change to support "notify a
-- store's followers".

CREATE TABLE IF NOT EXISTS store_follows (
    id INT AUTO_INCREMENT PRIMARY KEY,
    follower_id INT NOT NULL,
    store_user_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_store_follows_follower FOREIGN KEY (follower_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_store_follows_store FOREIGN KEY (store_user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT uq_store_follows_pair UNIQUE (follower_id, store_user_id),
    INDEX idx_store_follows_store (store_user_id)
);
