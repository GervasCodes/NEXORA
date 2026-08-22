-- Migration 089: Phase Q7 - Growth & Discovery
-- Run after 088_data_saver_preference.sql.
--
-- Six features, grouped below in the order this migration creates them:
--   1. Group buying (time-boxed group discounts)
--   2. Short video product listings + scheduled live-selling sessions
--   3. Referral & loyalty points program
--   4. B2B / bulk ordering tier
--   5. Affiliate/influencer program
--   6. SEO content engine (buying guides)

-- ---- 1. Group buying -----------------------------------------------------
-- A seller opens a group buy on one of their products: a discounted
-- price that only takes effect if enough buyers join before the
-- deadline. Nobody is charged up front (no pre-auth/hold machinery) -
-- joining just reserves a spot; once min_participants is reached before
-- the deadline, the group buy flips to 'successful' and every
-- participant gets a time-boxed window to complete a normal checkout at
-- the discounted price (see groupBuy.service.js). If the deadline
-- passes without enough participants, it flips to 'failed' and nobody
-- owes anything - there was never a charge to reverse.

CREATE TABLE IF NOT EXISTS group_buys (
    id INT AUTO_INCREMENT PRIMARY KEY,
    product_id INT NOT NULL,
    seller_id INT NOT NULL,

    group_price DECIMAL(12, 2) NOT NULL,
    min_participants INT NOT NULL,
    deadline TIMESTAMP NOT NULL,

    status ENUM('open', 'successful', 'failed', 'cancelled') NOT NULL DEFAULT 'open',

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_group_buys_product
        FOREIGN KEY (product_id) REFERENCES products(id),
    CONSTRAINT fk_group_buys_seller
        FOREIGN KEY (seller_id) REFERENCES users(id),

    INDEX idx_group_buys_status_deadline (status, deadline)
);

CREATE TABLE IF NOT EXISTS group_buy_participants (
    id INT AUTO_INCREMENT PRIMARY KEY,
    group_buy_id INT NOT NULL,
    buyer_id INT NOT NULL,

    -- Set once the group buy succeeds and this participant completes
    -- their discounted checkout - lets the UI/queries tell "joined,
    -- waiting" apart from "joined, and actually bought".
    order_id INT NULL,

    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_group_buy_participants_group_buy
        FOREIGN KEY (group_buy_id) REFERENCES group_buys(id)
        ON DELETE CASCADE,
    CONSTRAINT fk_group_buy_participants_buyer
        FOREIGN KEY (buyer_id) REFERENCES users(id),
    CONSTRAINT fk_group_buy_participants_order
        FOREIGN KEY (order_id) REFERENCES orders(id),

    UNIQUE KEY uq_group_buy_participant (group_buy_id, buyer_id)
);

-- ---- 2. Live-selling sessions ---------------------------------------------
-- Short video product listings already exist (product_videos, see
-- migration ~045 and product.service.js#addProductVideo) - the backend
-- support was already there, only the frontend upload/display UI was
-- missing (added this phase, see FEATURES-PROGRESS.md). This migration
-- only adds the genuinely new half: scheduled live-selling sessions.
--
-- Deliberately NOT a real video-streaming integration (RTMP ingest,
-- playback infra, etc.) - that's a large, separate infrastructure
-- project. This is a scheduling/announcement layer: a seller posts a
-- session with a start time and a link to wherever they're actually
-- streaming (Instagram/YouTube/TikTok Live, most commonly, for sellers
-- this size), and NEXORA notifies interested buyers and lists it on the
-- storefront. See the explicit scope note in FEATURES-PROGRESS.md.
CREATE TABLE IF NOT EXISTS live_selling_sessions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    seller_id INT NOT NULL,

    title VARCHAR(200) NOT NULL,
    description VARCHAR(1000) NULL,
    external_link VARCHAR(500) NOT NULL,
    scheduled_at TIMESTAMP NOT NULL,

    status ENUM('scheduled', 'live', 'ended', 'cancelled') NOT NULL DEFAULT 'scheduled',

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_live_selling_sessions_seller
        FOREIGN KEY (seller_id) REFERENCES users(id),

    INDEX idx_live_selling_sessions_status_time (status, scheduled_at)
);

-- ---- 3. Referral & loyalty points -----------------------------------------

ALTER TABLE users
    ADD COLUMN referral_code VARCHAR(12) NULL UNIQUE AFTER phone,
    ADD COLUMN referred_by_user_id INT NULL AFTER referral_code,
    ADD COLUMN loyalty_points INT NOT NULL DEFAULT 0 AFTER referred_by_user_id,
    ADD CONSTRAINT fk_users_referred_by
        FOREIGN KEY (referred_by_user_id) REFERENCES users(id);

-- One row per referred signup, so a referral bonus can be tied to that
-- signup's FIRST completed order specifically (referral_bonus_awarded)
-- rather than re-triggering on every order they ever place.
CREATE TABLE IF NOT EXISTS referrals (
    id INT AUTO_INCREMENT PRIMARY KEY,
    referrer_id INT NOT NULL,
    referred_user_id INT NOT NULL UNIQUE,
    bonus_awarded TINYINT(1) NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_referrals_referrer
        FOREIGN KEY (referrer_id) REFERENCES users(id),
    CONSTRAINT fk_referrals_referred
        FOREIGN KEY (referred_user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS loyalty_points_ledger (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,

    type ENUM('earned', 'redeemed', 'referral_bonus', 'adjustment') NOT NULL,
    points INT NOT NULL, -- positive for earned/bonus, negative for redeemed
    balance_after INT NOT NULL,

    order_id INT NULL,
    description VARCHAR(255) NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_loyalty_points_ledger_user
        FOREIGN KEY (user_id) REFERENCES users(id),
    CONSTRAINT fk_loyalty_points_ledger_order
        FOREIGN KEY (order_id) REFERENCES orders(id),

    INDEX idx_loyalty_points_ledger_user (user_id)
);

-- Loyalty points redeemed at checkout show up as a discount, the same
-- shape buyer_protection_fee added a positive line item in Phase Q1 -
-- this is the negative counterpart.
ALTER TABLE orders
    ADD COLUMN loyalty_points_redeemed INT NOT NULL DEFAULT 0 AFTER buyer_protection_fee,
    ADD COLUMN loyalty_discount_amount DECIMAL(12, 2) NOT NULL DEFAULT 0 AFTER loyalty_points_redeemed;

-- ---- 4. B2B / bulk ordering tier -------------------------------------------
-- A buyer who wants wholesale/bulk pricing registers business details;
-- once an admin verifies it (same "verified before it unlocks anything
-- real" shape as kyc.service.js and efd.service.js), bulk pricing tiers
-- a seller has configured on a product become available to them at
-- checkout-time quantities. Not gated behind verification at the
-- PRICING level (see product_bulk_price_tiers - any buyer benefits from
-- posted bulk pricing on a product, the same way a supermarket's "buy
-- 12, save 10%" shelf tag isn't identity-gated) - verification instead
-- gates the wholesale CATALOG surfacing (business.service.js), which is
-- the part that actually needs "is this a real business" confirmed.
ALTER TABLE users
    ADD COLUMN business_account_status ENUM('none', 'pending', 'verified') NOT NULL DEFAULT 'none' AFTER loyalty_points,
    ADD COLUMN business_name VARCHAR(150) NULL AFTER business_account_status,
    ADD COLUMN business_tin VARCHAR(20) NULL AFTER business_name;

CREATE TABLE IF NOT EXISTS product_bulk_price_tiers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    product_id INT NOT NULL,

    min_quantity INT NOT NULL,
    unit_price DECIMAL(12, 2) NOT NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_product_bulk_price_tiers_product
        FOREIGN KEY (product_id) REFERENCES products(id)
        ON DELETE CASCADE,

    UNIQUE KEY uq_product_bulk_tier_qty (product_id, min_quantity)
);

-- ---- 5. Affiliate / influencer program -------------------------------------

CREATE TABLE IF NOT EXISTS affiliate_accounts (
    user_id INT PRIMARY KEY,
    code VARCHAR(20) NOT NULL UNIQUE,
    commission_rate DECIMAL(5, 4) NOT NULL DEFAULT 0.05, -- 5% default, admin-adjustable per affiliate
    status ENUM('active', 'suspended') NOT NULL DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_affiliate_accounts_user
        FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS affiliate_clicks (
    id INT AUTO_INCREMENT PRIMARY KEY,
    affiliate_user_id INT NOT NULL,
    -- Attribution cookie value handed to the browser on click, matched
    -- back up at checkout if an order follows within the attribution
    -- window (see affiliate.service.js) - not a session/user id, since
    -- the click can happen before the visitor ever creates an account.
    click_token VARCHAR(40) NOT NULL UNIQUE,
    landing_path VARCHAR(500) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_affiliate_clicks_affiliate
        FOREIGN KEY (affiliate_user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS affiliate_conversions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    affiliate_user_id INT NOT NULL,
    order_id INT NOT NULL UNIQUE,
    commission_amount DECIMAL(12, 2) NOT NULL,
    status ENUM('pending', 'paid') NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    paid_at TIMESTAMP NULL,

    CONSTRAINT fk_affiliate_conversions_affiliate
        FOREIGN KEY (affiliate_user_id) REFERENCES users(id),
    CONSTRAINT fk_affiliate_conversions_order
        FOREIGN KEY (order_id) REFERENCES orders(id)
);

-- Commission payouts land in the affiliate's buyer wallet (084) -
-- reused rather than building a third money-holding ledger; an
-- affiliate is, structurally, just a buyer account with a bonus income
-- stream. Widen that ledger's reference_type to cover it.
ALTER TABLE buyer_wallet_transactions
    MODIFY reference_type ENUM('topup', 'order_payment', 'refund', 'adjustment', 'affiliate_commission') NOT NULL;

-- ---- 6. SEO content engine (category/buying guides) -----------------------

CREATE TABLE IF NOT EXISTS content_articles (
    id INT AUTO_INCREMENT PRIMARY KEY,

    title VARCHAR(200) NOT NULL,
    slug VARCHAR(220) NOT NULL UNIQUE,
    category_id INT NULL,

    -- Markdown, rendered client-side (same reasoning as any other
    -- user-authored long-form text in this codebase - no server-side
    -- HTML rendering/sanitization pipeline to maintain).
    body_markdown TEXT NOT NULL,
    excerpt VARCHAR(300) NULL,
    seo_meta_description VARCHAR(300) NULL,
    cover_image_url VARCHAR(500) NULL,

    status ENUM('draft', 'published') NOT NULL DEFAULT 'draft',
    author_id INT NOT NULL,
    published_at TIMESTAMP NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_content_articles_category
        FOREIGN KEY (category_id) REFERENCES categories(id)
        ON DELETE SET NULL,
    CONSTRAINT fk_content_articles_author
        FOREIGN KEY (author_id) REFERENCES users(id),

    INDEX idx_content_articles_status (status, published_at)
);
