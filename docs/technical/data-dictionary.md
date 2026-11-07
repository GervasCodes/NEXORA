# Data Dictionary

Audit date 2026-10-29, version 1.0. Source: live `information_schema` after applying all 160 migrations (**Verified**).

How to read it:
- **Type** is the exact MariaDB column type (`enum(...)` lists the allowed values).
- **Default** `NULL` means the column default is NULL (or none for NOT NULL columns without default).
- **Key**: PRI primary, UNI unique, MUL non-unique index.
- **Sensitivity** is a **heuristic Inferred** from the column name (Credential/secret, Government/ID doc, Financial, Contact PII, Personal). It is a starting point for a data-protection review, not a classification decision; blank does not mean non-sensitive.
- Column comments exist for some columns and are shown in Notes.

## Identity & accounts

### `account_verification_documents`

| Column | Type | Null | Default | Key | Sensitivity | Notes |
|---|---|---|---|---|---|---|
| `id` | int(11) | NO | NULL | PRI |  | auto_increment |
| `user_id` | int(11) | NO | NULL | MUL |  |  |
| `business_request_id` | int(11) | YES | NULL | MUL |  |  |
| `document_type` | enum('owner_photo','national_id','voter_id','drivers_license','brela_certificate','tin_certificate','business_license') | NO | NULL |  | Government/ID doc |  |
| `file_url` | varchar(500) | YES | NULL |  | Government/ID doc |  |
| `file_public_id` | varchar(255) | YES | NULL |  | Government/ID doc |  |
| `file_resource_type` | varchar(10) | YES | NULL |  |  |  |
| `file_format` | varchar(10) | YES | NULL |  |  |  |
| `file_storage` | varchar(20) | NO | 'public' |  |  |  |
| `file_purged_at` | timestamp | YES | NULL |  |  |  |
| `uploaded_at` | timestamp | YES | current_timestamp() |  |  |  |

### `account_verification_document_flags`

| Column | Type | Null | Default | Key | Sensitivity | Notes |
|---|---|---|---|---|---|---|
| `document_id` | int(11) | NO | NULL | PRI | Government/ID doc |  |
| `reason` | varchar(255) | NO | NULL |  |  |  |
| `flagged_by` | int(11) | YES | NULL | MUL |  |  |
| `flagged_at` | timestamp | YES | current_timestamp() |  |  |  |

### `account_verification_history`

| Column | Type | Null | Default | Key | Sensitivity | Notes |
|---|---|---|---|---|---|---|
| `id` | int(11) | NO | NULL | PRI |  | auto_increment |
| `user_id` | int(11) | NO | NULL | MUL |  |  |
| `action` | enum('submitted','resubmitted','approved','rejected','business_submitted','business_approved','business_rejected') | NO | NULL |  |  |  |
| `reason` | varchar(255) | YES | NULL |  |  |  |
| `actor_admin_id` | int(11) | YES | NULL | MUL |  |  |
| `created_at` | timestamp | YES | current_timestamp() |  |  |  |

### `business_verification_requests`

| Column | Type | Null | Default | Key | Sensitivity | Notes |
|---|---|---|---|---|---|---|
| `id` | int(11) | NO | NULL | PRI |  | auto_increment |
| `user_id` | int(11) | NO | NULL | MUL |  |  |
| `status` | enum('pending','approved','rejected') | NO | 'pending' | MUL |  |  |
| `rejection_reason` | varchar(255) | YES | NULL |  |  |  |
| `submitted_at` | timestamp | YES | current_timestamp() |  |  |  |
| `reviewed_at` | timestamp | YES | NULL |  |  |  |
| `reviewed_by` | int(11) | YES | NULL | MUL |  |  |

### `buyer_addresses`

| Column | Type | Null | Default | Key | Sensitivity | Notes |
|---|---|---|---|---|---|---|
| `id` | int(11) | NO | NULL | PRI |  | auto_increment |
| `user_id` | int(11) | NO | NULL | MUL |  |  |
| `label` | varchar(60) | NO | 'Address' |  |  |  |
| `recipient_name` | varchar(150) | YES | NULL |  | Personal |  |
| `address` | varchar(255) | NO | NULL |  | Contact PII |  |
| `city` | varchar(100) | NO | NULL |  |  |  |
| `region` | varchar(100) | NO | NULL |  |  |  |
| `latitude` | decimal(10,7) | YES | NULL |  | Contact PII |  |
| `longitude` | decimal(10,7) | YES | NULL |  | Contact PII |  |
| `phone` | varchar(30) | NO | NULL |  | Contact PII |  |
| `is_default` | tinyint(1) | NO | 0 |  |  |  |
| `created_at` | timestamp | YES | current_timestamp() |  |  |  |
| `updated_at` | timestamp | YES | current_timestamp() |  |  | on update current_timestamp() |

### `data_reset_approvals`

| Column | Type | Null | Default | Key | Sensitivity | Notes |
|---|---|---|---|---|---|---|
| `id` | int(11) | NO | NULL | PRI |  | auto_increment |
| `requested_by` | int(11) | NO | NULL | MUL |  |  |
| `test_only` | tinyint(1) | NO | 1 |  |  |  |
| `approved_by` | int(11) | YES | NULL | MUL |  |  |
| `approved_at` | timestamp | YES | NULL |  |  |  |
| `executed_at` | timestamp | YES | NULL |  |  |  |
| `expires_at` | timestamp | NO | NULL |  |  |  |
| `created_at` | timestamp | YES | current_timestamp() |  |  |  |

### `kyc_tier_limits`

| Column | Type | Null | Default | Key | Sensitivity | Notes |
|---|---|---|---|---|---|---|
| `tier` | enum('tier0','tier1','tier2') | NO | NULL | PRI |  |  |
| `max_order_amount` | decimal(12,2) | YES | NULL |  | Financial |  |
| `label` | varchar(100) | NO | NULL |  |  |  |
| `max_cod_order_amount` | decimal(12,2) | YES | NULL |  | Financial |  |
| `max_unpaid_cod_orders` | int(11) | YES | NULL |  |  |  |

### `kyc_upgrade_requests`

| Column | Type | Null | Default | Key | Sensitivity | Notes |
|---|---|---|---|---|---|---|
| `id` | int(11) | NO | NULL | PRI |  | auto_increment |
| `user_id` | int(11) | NO | NULL | MUL |  |  |
| `target_tier` | enum('tier1','tier2') | NO | NULL |  |  |  |
| `status` | enum('pending','approved','rejected') | NO | 'pending' | MUL |  |  |
| `document_type` | varchar(50) | NO | NULL |  | Government/ID doc |  |
| `file_url` | varchar(500) | YES | NULL |  | Government/ID doc |  |
| `file_public_id` | varchar(255) | YES | NULL |  | Government/ID doc |  |
| `file_resource_type` | varchar(10) | YES | NULL |  |  |  |
| `file_format` | varchar(10) | YES | NULL |  |  |  |
| `file_storage` | varchar(20) | NO | 'public' |  |  |  |
| `file_purged_at` | timestamp | YES | NULL |  |  |  |
| `note` | varchar(500) | YES | NULL |  |  |  |
| `rejection_reason` | varchar(500) | YES | NULL |  |  |  |
| `reviewed_by` | int(11) | YES | NULL | MUL |  |  |
| `reviewed_at` | timestamp | YES | NULL |  |  |  |
| `created_at` | timestamp | YES | current_timestamp() |  |  |  |
| `updated_at` | timestamp | YES | current_timestamp() |  |  | on update current_timestamp() |

### `loyalty_points_ledger`

| Column | Type | Null | Default | Key | Sensitivity | Notes |
|---|---|---|---|---|---|---|
| `id` | int(11) | NO | NULL | PRI |  | auto_increment |
| `user_id` | int(11) | NO | NULL | MUL |  |  |
| `type` | enum('earned','redeemed','referral_bonus','adjustment') | NO | NULL |  |  |  |
| `points` | int(11) | NO | NULL |  |  |  |
| `balance_after` | int(11) | NO | NULL |  | Financial |  |
| `order_id` | int(11) | YES | NULL | MUL |  |  |
| `description` | varchar(255) | YES | NULL |  |  |  |
| `created_at` | timestamp | YES | current_timestamp() |  |  |  |

### `otp_codes`

| Column | Type | Null | Default | Key | Sensitivity | Notes |
|---|---|---|---|---|---|---|
| `id` | int(11) | NO | NULL | PRI |  | auto_increment |
| `user_id` | int(11) | NO | NULL | MUL |  |  |
| `purpose` | enum('login','password_change','password_reset') | NO | NULL |  |  |  |
| `code_hash` | varchar(255) | NO | NULL |  | Credential/secret |  |
| `attempts` | int(11) | NO | 0 |  |  |  |
| `max_attempts` | int(11) | NO | 5 |  |  |  |
| `consumed_at` | timestamp | YES | NULL |  |  |  |
| `expires_at` | timestamp | NO | NULL |  |  |  |
| `created_at` | timestamp | YES | current_timestamp() |  |  |  |

### `push_subscriptions`

| Column | Type | Null | Default | Key | Sensitivity | Notes |
|---|---|---|---|---|---|---|
| `id` | int(11) | NO | NULL | PRI |  | auto_increment |
| `user_id` | int(11) | NO | NULL | MUL |  |  |
| `endpoint` | varchar(500) | NO | NULL | UNI |  |  |
| `p256dh` | varchar(255) | NO | NULL |  |  |  |
| `auth` | varchar(255) | NO | NULL |  |  |  |
| `created_at` | timestamp | YES | current_timestamp() |  |  |  |

### `referrals`

| Column | Type | Null | Default | Key | Sensitivity | Notes |
|---|---|---|---|---|---|---|
| `id` | int(11) | NO | NULL | PRI |  | auto_increment |
| `referrer_id` | int(11) | NO | NULL | MUL |  |  |
| `referred_user_id` | int(11) | NO | NULL | UNI |  |  |
| `bonus_awarded` | tinyint(1) | NO | 0 |  |  |  |
| `created_at` | timestamp | YES | current_timestamp() |  |  |  |

### `users`

| Column | Type | Null | Default | Key | Sensitivity | Notes |
|---|---|---|---|---|---|---|
| `id` | int(11) | NO | NULL | PRI |  | auto_increment |
| `first_name` | varchar(100) | NO | NULL |  | Personal |  |
| `last_name` | varchar(100) | NO | NULL |  | Personal |  |
| `email` | varchar(150) | NO | NULL | UNI | Contact PII |  |
| `phone` | varchar(30) | NO | NULL | UNI | Contact PII |  |
| `photo_url` | varchar(500) | YES | NULL |  | Personal |  |
| `referral_code` | varchar(12) | YES | NULL | UNI |  |  |
| `referred_by_user_id` | int(11) | YES | NULL | MUL |  |  |
| `loyalty_points` | int(11) | NO | 0 |  |  |  |
| `business_account_status` | enum('none','pending','verified') | NO | 'none' |  |  |  |
| `business_name` | varchar(150) | YES | NULL |  | Personal |  |
| `business_tin` | varchar(20) | YES | NULL |  | Government/ID doc |  |
| `whatsapp_order_updates` | tinyint(1) | NO | 0 |  | Contact PII |  |
| `notify_order_updates` | tinyint(1) | NO | 1 |  |  |  |
| `notify_messages` | tinyint(1) | NO | 1 |  |  |  |
| `notify_price_stock_alerts` | tinyint(1) | NO | 1 |  | Financial |  |
| `notify_store_updates` | tinyint(1) | NO | 1 |  |  |  |
| `data_saver_enabled` | tinyint(1) | NO | 0 |  |  |  |
| `password` | varchar(255) | NO | NULL |  | Credential/secret |  |
| `token_version` | int(10) unsigned | NO | 0 |  | Credential/secret |  |
| `failed_login_attempts` | int(10) unsigned | NO | 0 |  |  |  |
| `last_failed_login_at` | datetime | YES | NULL |  |  |  |
| `login_locked_until` | datetime | YES | NULL |  |  |  |
| `role` | enum('buyer','seller','admin','delivery_agent') | NO | 'buyer' | MUL |  |  |
| `account_verification_status` | enum('not_required','pending','approved','rejected') | NO | 'not_required' |  |  |  |
| `kyc_tier` | enum('tier0','tier1','tier2') | NO | 'tier0' |  |  |  |
| `account_verification_rejection_reason` | varchar(255) | YES | NULL |  |  |  |
| `account_verification_submitted_at` | timestamp | YES | NULL |  |  |  |
| `account_verification_reviewed_at` | timestamp | YES | NULL |  |  |  |
| `account_verification_reviewed_by` | int(11) | YES | NULL | MUL |  |  |
| `verification_tier` | enum('none','id_verified','business_verified') | NO | 'none' |  |  |  |
| `admin_level` | enum('admin','super_admin') | YES | NULL |  |  |  |
| `language` | varchar(10) | NO | 'en' |  |  |  |
| `theme` | enum('light','dark','system') | NO | 'system' |  |  |  |
| `currency` | varchar(10) | NO | 'TZS' |  |  |  |
| `current_lat` | decimal(10,7) | YES | NULL |  | Contact PII |  |
| `current_lng` | decimal(10,7) | YES | NULL |  | Contact PII |  |
| `location_updated_at` | timestamp | YES | NULL |  |  |  |
| `is_online` | tinyint(1) | NO | 0 |  |  |  |
| `is_active` | tinyint(1) | NO | 1 |  |  |  |
| `deleted_at` | timestamp | YES | NULL | MUL |  |  |
| `suspended_at` | timestamp | YES | NULL | MUL |  |  |
| `suspension_reason` | varchar(500) | YES | NULL |  |  |  |
| `suspended_by` | int(11) | YES | NULL | MUL |  |  |
| `permanently_deleted_at` | timestamp | YES | NULL | MUL |  |  |
| `terms_accepted_at` | timestamp | YES | NULL |  |  |  |
| `terms_version` | varchar(20) | YES | NULL |  |  |  |
| `created_at` | timestamp | YES | current_timestamp() |  |  |  |
| `updated_at` | timestamp | YES | current_timestamp() |  |  | on update current_timestamp() |
| `last_active_at` | timestamp | YES | NULL |  |  |  |
| `location_lat` | decimal(10,7) | YES | NULL |  | Contact PII |  |
| `location_lng` | decimal(10,7) | YES | NULL |  | Contact PII |  |
| `location_lat_updated_at` | timestamp | YES | NULL |  |  |  |
| `location_sharing_enabled` | tinyint(1) | NO | 1 |  |  |  |
| `vehicle_type` | enum('bicycle','motorcycle','tuktuk','car','van','truck') | YES | NULL |  |  |  |
| `vehicle_plate_number` | varchar(20) | YES | NULL |  |  |  |
| `refused_cod_count` | int(11) | NO | 0 |  |  |  |
| `seller_mode` | enum('marketplace','business_tools') | NO | 'marketplace' |  |  |  |
| `trial_started_at` | datetime | YES | NULL |  |  |  |
| `trial_ends_at` | datetime | YES | NULL | MUL |  |  |
| `trial_reminder_stage` | tinyint(3) unsigned | NO | 0 |  |  |  |
| `username` | varchar(30) | YES | NULL | UNI | Personal |  |
| `username_changed_at` | datetime | YES | NULL |  | Personal |  |
| `google_sub` | varchar(64) | YES | NULL | UNI |  |  |
| `auth_provider` | varchar(20) | NO | 'password' |  |  |  |

## Catalog & storefront

### `categories`

| Column | Type | Null | Default | Key | Sensitivity | Notes |
|---|---|---|---|---|---|---|
| `id` | int(11) | NO | NULL | PRI |  | auto_increment |
| `name` | varchar(100) | NO | NULL | UNI | Personal |  |
| `slug` | varchar(120) | NO | NULL | UNI |  |  |
| `description` | varchar(255) | YES | NULL |  |  |  |
| `cover_image_url` | varchar(500) | YES | NULL |  |  |  |
| `display_order` | int(11) | NO | 0 |  |  |  |
| `is_active` | tinyint(1) | NO | 1 |  |  |  |
| `status` | enum('active','maintenance','deactivated') | NO | 'active' |  |  |  |
| `maintenance_message` | varchar(255) | YES | NULL |  |  |  |
| `maintenance_scheduled_start` | datetime | YES | NULL | MUL |  |  |
| `maintenance_scheduled_end` | datetime | YES | NULL |  |  |  |
| `created_at` | timestamp | YES | current_timestamp() |  |  |  |
| `updated_at` | timestamp | YES | current_timestamp() |  |  | on update current_timestamp() |

### `content_articles`

| Column | Type | Null | Default | Key | Sensitivity | Notes |
|---|---|---|---|---|---|---|
| `id` | int(11) | NO | NULL | PRI |  | auto_increment |
| `title` | varchar(200) | NO | NULL |  |  |  |
| `slug` | varchar(220) | NO | NULL | UNI |  |  |
| `category_id` | int(11) | YES | NULL | MUL |  |  |
| `body_markdown` | text | NO | NULL |  |  |  |
| `excerpt` | varchar(300) | YES | NULL |  |  |  |
| `seo_meta_description` | varchar(300) | YES | NULL |  |  |  |
| `cover_image_url` | varchar(500) | YES | NULL |  |  |  |
| `status` | enum('draft','published') | NO | 'draft' | MUL |  |  |
| `author_id` | int(11) | NO | NULL | MUL |  |  |
| `published_at` | timestamp | YES | NULL |  |  |  |
| `created_at` | timestamp | YES | current_timestamp() |  |  |  |
| `updated_at` | timestamp | YES | current_timestamp() |  |  | on update current_timestamp() |

### `pickup_points`

| Column | Type | Null | Default | Key | Sensitivity | Notes |
|---|---|---|---|---|---|---|
| `id` | int(11) | NO | NULL | PRI |  | auto_increment |
| `name` | varchar(150) | NO | NULL |  | Personal |  |
| `address` | varchar(255) | NO | NULL |  | Contact PII |  |
| `city` | varchar(100) | NO | NULL |  |  |  |
| `region` | varchar(100) | NO | NULL | MUL |  |  |
| `latitude` | decimal(10,7) | YES | NULL |  | Contact PII |  |
| `longitude` | decimal(10,7) | YES | NULL |  | Contact PII |  |
| `contact_phone` | varchar(30) | YES | NULL |  | Contact PII |  |
| `operating_hours` | varchar(150) | YES | NULL |  |  |  |
| `is_active` | tinyint(1) | NO | 1 | MUL |  |  |
| `created_at` | timestamp | YES | current_timestamp() |  |  |  |
| `updated_at` | timestamp | YES | current_timestamp() |  |  | on update current_timestamp() |

### `products`

| Column | Type | Null | Default | Key | Sensitivity | Notes |
|---|---|---|---|---|---|---|
| `id` | int(11) | NO | NULL | PRI |  | auto_increment |
| `seller_id` | int(11) | NO | NULL | MUL |  |  |
| `category_id` | int(11) | YES | NULL | MUL |  |  |
| `name` | varchar(200) | NO | NULL | MUL | Personal |  |
| `slug` | varchar(220) | NO | NULL | UNI |  |  |
| `description` | varchar(2000) | YES | NULL |  |  |  |
| `price` | decimal(12,2) | NO | NULL |  | Financial |  |
| `discount_price` | decimal(12,2) | YES | NULL |  | Financial |  |
| `stock` | int(11) | NO | 0 |  |  |  |
| `is_preorder` | tinyint(1) | NO | 0 |  |  |  |
| `preorder_lead_time_days` | int(11) | YES | NULL |  |  |  |
| `ships_within_days` | int(11) | YES | NULL |  |  |  |
| `return_window_days` | int(11) | YES | NULL |  |  |  |
| `has_variants` | tinyint(1) | NO | 0 |  |  |  |
| `brand` | varchar(100) | YES | NULL |  |  |  |
| `product_condition` | enum('new','used') | NO | 'new' |  |  |  |
| `is_active` | tinyint(1) | NO | 1 | MUL |  |  |
| `is_draft` | tinyint(1) | NO | 0 |  |  |  |
| `is_sponsored` | tinyint(1) | NO | 0 |  |  |  |
| `created_at` | timestamp | YES | current_timestamp() |  |  |  |
| `updated_at` | timestamp | YES | current_timestamp() |  |  | on update current_timestamp() |

### `product_alerts`

| Column | Type | Null | Default | Key | Sensitivity | Notes |
|---|---|---|---|---|---|---|
| `id` | int(11) | NO | NULL | PRI |  | auto_increment |
| `user_id` | int(11) | NO | NULL | MUL |  |  |
| `product_id` | int(11) | NO | NULL | MUL |  |  |
| `alert_type` | enum('back_in_stock','price_drop') | NO | NULL |  |  |  |
| `price_baseline` | decimal(12,2) | YES | NULL |  | Financial |  |
| `notified_at` | timestamp | YES | NULL |  |  |  |
| `created_at` | timestamp | YES | current_timestamp() |  |  |  |

### `product_audio`

| Column | Type | Null | Default | Key | Sensitivity | Notes |
|---|---|---|---|---|---|---|
| `id` | int(11) | NO | NULL | PRI |  | auto_increment |
| `product_id` | int(11) | NO | NULL | MUL |  |  |
| `audio_url` | varchar(500) | NO | NULL |  |  |  |
| `display_order` | int(11) | NO | 0 |  |  |  |
| `created_at` | timestamp | YES | current_timestamp() |  |  |  |

### `product_bulk_price_tiers`

| Column | Type | Null | Default | Key | Sensitivity | Notes |
|---|---|---|---|---|---|---|
| `id` | int(11) | NO | NULL | PRI |  | auto_increment |
| `product_id` | int(11) | NO | NULL | MUL |  |  |
| `min_quantity` | int(11) | NO | NULL |  |  |  |
| `unit_price` | decimal(12,2) | NO | NULL |  | Financial |  |
| `created_at` | timestamp | YES | current_timestamp() |  |  |  |

### `product_images`

| Column | Type | Null | Default | Key | Sensitivity | Notes |
|---|---|---|---|---|---|---|
| `id` | int(11) | NO | NULL | PRI |  | auto_increment |
| `product_id` | int(11) | NO | NULL | MUL |  |  |
| `image_url` | varchar(500) | NO | NULL |  |  |  |
| `is_primary` | tinyint(1) | NO | 0 |  |  |  |
| `display_order` | int(11) | NO | 0 |  |  |  |
| `created_at` | timestamp | YES | current_timestamp() |  |  |  |

### `product_media`

| Column | Type | Null | Default | Key | Sensitivity | Notes |
|---|---|---|---|---|---|---|
| `id` | int(11) | NO | NULL | PRI |  | auto_increment |
| `product_id` | int(11) | NO | NULL | MUL |  |  |
| `kind` | enum('image','video') | NO | NULL |  |  |  |
| `url` | varchar(500) | NO | NULL |  |  |  |
| `public_id` | varchar(255) | YES | NULL |  |  |  |
| `poster_url` | varchar(500) | YES | NULL |  |  |  |
| `width` | int(11) | YES | NULL |  |  |  |
| `height` | int(11) | YES | NULL |  |  |  |
| `duration_s` | decimal(8,2) | YES | NULL |  |  |  |
| `bytes` | int(10) unsigned | YES | NULL |  |  |  |
| `position` | int(11) | NO | 0 |  |  |  |
| `is_cover` | tinyint(1) | NO | 0 |  |  |  |
| `edits` | longtext | YES | NULL |  |  |  |
| `legacy_id` | int(11) | YES | NULL |  |  |  |
| `created_at` | timestamp | YES | current_timestamp() |  |  |  |

### `product_questions`

| Column | Type | Null | Default | Key | Sensitivity | Notes |
|---|---|---|---|---|---|---|
| `id` | int(11) | NO | NULL | PRI |  | auto_increment |
| `product_id` | int(11) | NO | NULL | MUL |  |  |
| `user_id` | int(11) | NO | NULL | MUL |  |  |
| `question` | text | NO | NULL |  |  |  |
| `seller_answer` | text | YES | NULL |  |  |  |
| `seller_answer_at` | timestamp | YES | NULL |  |  |  |
| `created_at` | timestamp | YES | current_timestamp() |  |  |  |

### `product_variants`

| Column | Type | Null | Default | Key | Sensitivity | Notes |
|---|---|---|---|---|---|---|
| `id` | int(11) | NO | NULL | PRI |  | auto_increment |
| `product_id` | int(11) | NO | NULL | MUL |  |  |
| `options` | longtext | NO | NULL |  |  |  |
| `options_key` | varchar(255) | NO | NULL |  |  |  |
| `sku` | varchar(60) | YES | NULL |  |  |  |
| `price_delta` | decimal(12,2) | NO | 0.00 |  | Financial |  |
| `stock` | int(11) | NO | 0 |  |  |  |
| `image_url` | varchar(500) | YES | NULL |  |  |  |
| `is_active` | tinyint(1) | NO | 1 |  |  |  |
| `created_at` | timestamp | YES | current_timestamp() |  |  |  |
| `updated_at` | timestamp | YES | current_timestamp() |  |  | on update current_timestamp() |

### `product_variant_options`

| Column | Type | Null | Default | Key | Sensitivity | Notes |
|---|---|---|---|---|---|---|
| `id` | int(11) | NO | NULL | PRI |  | auto_increment |
| `product_id` | int(11) | NO | NULL | MUL |  |  |
| `name` | varchar(60) | NO | NULL |  | Personal |  |
| `display_order` | int(11) | NO | 0 |  |  |  |

### `product_variant_option_values`

| Column | Type | Null | Default | Key | Sensitivity | Notes |
|---|---|---|---|---|---|---|
| `id` | int(11) | NO | NULL | PRI |  | auto_increment |
| `option_id` | int(11) | NO | NULL | MUL |  |  |
| `value` | varchar(60) | NO | NULL |  |  |  |
| `display_order` | int(11) | NO | 0 |  |  |  |

### `product_videos`

| Column | Type | Null | Default | Key | Sensitivity | Notes |
|---|---|---|---|---|---|---|
| `id` | int(11) | NO | NULL | PRI |  | auto_increment |
| `product_id` | int(11) | NO | NULL | MUL |  |  |
| `video_url` | varchar(500) | NO | NULL |  |  |  |
| `display_order` | int(11) | NO | 0 |  |  |  |
| `created_at` | timestamp | YES | current_timestamp() |  |  |  |

### `search_queries`

| Column | Type | Null | Default | Key | Sensitivity | Notes |
|---|---|---|---|---|---|---|
| `id` | bigint(20) | NO | NULL | PRI |  | auto_increment |
| `term` | varchar(200) | NO | NULL |  |  |  |
| `normalized_term` | varchar(200) | NO | NULL | MUL |  |  |
| `created_at` | timestamp | NO | current_timestamp() |  |  |  |

### `search_zero_results`

| Column | Type | Null | Default | Key | Sensitivity | Notes |
|---|---|---|---|---|---|---|
| `id` | int(11) | NO | NULL | PRI |  | auto_increment |
| `scope` | enum('products','services') | NO | 'products' | MUL |  |  |
| `term` | varchar(120) | NO | NULL |  |  |  |
| `hits` | int(11) | NO | 1 | MUL |  |  |
| `first_seen_at` | timestamp | NO | current_timestamp() |  |  |  |
| `last_seen_at` | timestamp | NO | current_timestamp() |  |  | on update current_timestamp() |

### `seller_collections`

| Column | Type | Null | Default | Key | Sensitivity | Notes |
|---|---|---|---|---|---|---|
| `id` | int(11) | NO | NULL | PRI |  | auto_increment |
| `seller_id` | int(11) | NO | NULL | MUL |  |  |
| `name` | varchar(80) | NO | NULL |  | Personal |  |
| `display_order` | int(11) | NO | 0 |  |  |  |
| `created_at` | timestamp | YES | current_timestamp() |  |  |  |

### `seller_collection_products`

| Column | Type | Null | Default | Key | Sensitivity | Notes |
|---|---|---|---|---|---|---|
| `id` | int(11) | NO | NULL | PRI |  | auto_increment |
| `collection_id` | int(11) | NO | NULL | MUL |  |  |
| `product_id` | int(11) | NO | NULL | MUL |  |  |
| `display_order` | int(11) | NO | 0 |  |  |  |
| `created_at` | timestamp | YES | current_timestamp() |  |  |  |

### `seller_profiles`

| Column | Type | Null | Default | Key | Sensitivity | Notes |
|---|---|---|---|---|---|---|
| `id` | int(11) | NO | NULL | PRI |  | auto_increment |
| `user_id` | int(11) | NO | NULL | UNI |  |  |
| `merchant_type` | enum('product','service','hybrid') | NO | 'product' |  |  |  |
| `store_name` | varchar(150) | NO | NULL |  | Personal |  |
| `store_slug` | varchar(170) | NO | NULL | UNI |  |  |
| `store_description` | varchar(500) | YES | NULL |  |  |  |
| `store_tagline` | varchar(150) | YES | NULL |  |  |  |
| `store_type_id` | int(11) | YES | NULL | MUL |  |  |
| `accepts_preorders` | tinyint(1) | NO | 0 |  |  |  |
| `preorder_deposit_percent` | decimal(5,2) | NO | 30.00 |  |  |  |
| `preorder_default_lead_time_days` | int(11) | YES | NULL |  |  |  |
| `store_logo` | varchar(500) | YES | NULL |  |  |  |
| `store_banner` | varchar(500) | YES | NULL |  |  |  |
| `promo_video_url` | varchar(500) | YES | NULL |  |  |  |
| `store_theme` | varchar(20) | NO | 'default' |  |  |  |
| `opening_hours` | longtext | YES | NULL |  |  |  |
| `social_instagram` | varchar(150) | YES | NULL |  |  |  |
| `social_facebook` | varchar(150) | YES | NULL |  |  |  |
| `social_whatsapp` | varchar(20) | YES | NULL |  | Contact PII |  |
| `public_phone` | varchar(20) | YES | NULL |  | Contact PII |  |
| `business_email` | varchar(150) | YES | NULL |  | Contact PII |  |
| `business_phone` | varchar(30) | YES | NULL |  | Contact PII |  |
| `country` | varchar(100) | YES | NULL |  |  |  |
| `region` | varchar(100) | YES | NULL | MUL |  |  |
| `city` | varchar(100) | YES | NULL |  |  |  |
| `address` | varchar(255) | YES | NULL |  | Contact PII |  |
| `tin` | varchar(20) | YES | NULL |  | Government/ID doc |  |
| `vrn` | varchar(20) | YES | NULL |  |  |  |
| `efd_registered` | tinyint(1) | NO | 0 |  |  |  |
| `efd_verified_at` | timestamp | YES | NULL |  |  |  |
| `pickup_lat` | decimal(10,7) | YES | NULL |  | Contact PII |  |
| `pickup_lng` | decimal(10,7) | YES | NULL |  | Contact PII |  |
| `is_verified` | tinyint(1) | NO | 0 |  |  |  |
| `is_business_verified` | tinyint(1) | NO | 0 |  |  |  |
| `verification_fee_amount` | decimal(12,2) | YES | NULL |  | Financial |  |
| `verification_fee_paid` | tinyint(1) | NO | 0 |  | Financial |  |
| `verification_fee_reference` | varchar(150) | YES | NULL |  | Financial |  |
| `verification_fee_paid_at` | timestamp | YES | NULL |  | Financial |  |
| `created_at` | timestamp | YES | current_timestamp() |  |  |  |
| `updated_at` | timestamp | YES | current_timestamp() |  |  | on update current_timestamp() |
| `badge_grace_until` | datetime | YES | NULL |  |  |  |
| `pickup_pin_verified_at` | datetime | YES | NULL |  |  |  |
| `pickup_accuracy_m` | int(11) | YES | NULL |  |  |  |

### `seller_saved_filters`

| Column | Type | Null | Default | Key | Sensitivity | Notes |
|---|---|---|---|---|---|---|
| `id` | int(11) | NO | NULL | PRI |  | auto_increment |
| `seller_id` | int(11) | NO | NULL | MUL |  |  |
| `page_key` | varchar(50) | NO | NULL |  |  |  |
| `name` | varchar(60) | NO | NULL |  | Personal |  |
| `filters` | longtext | NO | NULL |  |  |  |
| `created_at` | timestamp | YES | current_timestamp() |  |  |  |

### `store_follows`

| Column | Type | Null | Default | Key | Sensitivity | Notes |
|---|---|---|---|---|---|---|
| `id` | int(11) | NO | NULL | PRI |  | auto_increment |
| `follower_id` | int(11) | NO | NULL | MUL |  |  |
| `store_user_id` | int(11) | NO | NULL | MUL |  |  |
| `created_at` | timestamp | YES | current_timestamp() |  |  |  |

### `store_types`

| Column | Type | Null | Default | Key | Sensitivity | Notes |
|---|---|---|---|---|---|---|
| `id` | int(11) | NO | NULL | PRI |  | auto_increment |
| `name` | varchar(100) | NO | NULL |  | Personal |  |
| `slug` | varchar(120) | NO | NULL | UNI |  |  |
| `is_active` | tinyint(1) | NO | 1 |  |  |  |
| `created_at` | timestamp | YES | current_timestamp() |  |  |  |

### `wishlist_items`

| Column | Type | Null | Default | Key | Sensitivity | Notes |
|---|---|---|---|---|---|---|
| `id` | int(11) | NO | NULL | PRI |  | auto_increment |
| `user_id` | int(11) | NO | NULL | MUL |  |  |
| `product_id` | int(11) | YES | NULL | MUL |  |  |
| `service_id` | int(11) | YES | NULL | MUL |  |  |
| `created_at` | timestamp | YES | current_timestamp() |  |  |  |
| `saved_price` | decimal(12,2) | YES | NULL |  | Financial |  |

## Services & bookings

### `bookings`

| Column | Type | Null | Default | Key | Sensitivity | Notes |
|---|---|---|---|---|---|---|
| `id` | int(11) | NO | NULL | PRI |  | auto_increment |
| `booking_reference` | varchar(30) | NO | NULL | UNI |  |  |
| `service_id` | int(11) | NO | NULL | MUL |  |  |
| `provider_id` | int(11) | NO | NULL | MUL |  |  |
| `customer_id` | int(11) | NO | NULL | MUL |  |  |
| `start_date` | date | NO | NULL |  |  |  |
| `end_date` | date | NO | NULL |  |  |  |
| `quantity` | int(11) | NO | 1 |  |  |  |
| `amount` | decimal(12,2) | NO | NULL |  | Financial |  |
| `status` | enum('pending','confirmed','active','completed','cancelled','refunded','rejected') | NO | 'pending' |  |  |  |
| `payment_status` | enum('unpaid','paid') | NO | 'unpaid' |  |  |  |
| `is_test` | tinyint(1) | NO | 0 | MUL |  |  |
| `created_at` | timestamp | YES | current_timestamp() |  |  |  |
| `updated_at` | timestamp | YES | current_timestamp() |  |  | on update current_timestamp() |

### `booking_items`

| Column | Type | Null | Default | Key | Sensitivity | Notes |
|---|---|---|---|---|---|---|
| `id` | int(11) | NO | NULL | PRI |  | auto_increment |
| `booking_id` | int(11) | NO | NULL | MUL |  |  |
| `service_date` | date | NO | NULL |  |  |  |
| `quantity` | int(11) | NO | NULL |  |  |  |
| `unit_price` | decimal(12,2) | NO | NULL |  | Financial |  |
| `subtotal` | decimal(12,2) | NO | NULL |  |  |  |
| `commission_rate` | decimal(5,2) | YES | NULL |  | Financial |  |
| `commission_amount` | decimal(12,2) | YES | NULL |  | Financial |  |
| `provider_net_amount` | decimal(12,2) | YES | NULL |  | Financial |  |
| `wallet_credited` | tinyint(1) | NO | 0 | MUL | Financial |  |
| `wallet_released` | tinyint(1) | NO | 0 |  | Financial |  |
| `created_at` | timestamp | YES | current_timestamp() |  |  |  |

### `services`

| Column | Type | Null | Default | Key | Sensitivity | Notes |
|---|---|---|---|---|---|---|
| `id` | int(11) | NO | NULL | PRI |  | auto_increment |
| `provider_id` | int(11) | NO | NULL | MUL |  |  |
| `category_id` | int(11) | YES | NULL | MUL |  |  |
| `title` | varchar(200) | NO | NULL | MUL |  |  |
| `slug` | varchar(220) | NO | NULL | UNI |  |  |
| `description` | varchar(2000) | YES | NULL |  |  |  |
| `pricing_model` | enum('fixed','per_night','per_hour','per_day','per_person') | NO | 'fixed' |  |  |  |
| `base_price` | decimal(12,2) | NO | NULL |  | Financial |  |
| `cancellation_free_until_days` | int(11) | NO | 1 |  |  |  |
| `cancellation_late_fee_percent` | decimal(5,2) | NO | 0.00 |  | Financial |  |
| `discount_price` | decimal(12,2) | YES | NULL |  | Financial |  |
| `country` | varchar(100) | YES | NULL |  |  |  |
| `region` | varchar(100) | YES | NULL |  |  |  |
| `city` | varchar(100) | YES | NULL | MUL |  |  |
| `address` | varchar(255) | YES | NULL |  | Contact PII |  |
| `lat` | decimal(10,7) | YES | NULL |  | Contact PII |  |
| `lng` | decimal(10,7) | YES | NULL |  | Contact PII |  |
| `status` | enum('draft','published','suspended') | NO | 'draft' |  |  |  |
| `is_active` | tinyint(1) | NO | 1 |  |  |  |
| `created_at` | timestamp | YES | current_timestamp() |  |  |  |
| `updated_at` | timestamp | YES | current_timestamp() |  |  | on update current_timestamp() |

### `service_availability`

| Column | Type | Null | Default | Key | Sensitivity | Notes |
|---|---|---|---|---|---|---|
| `id` | int(11) | NO | NULL | PRI |  | auto_increment |
| `service_id` | int(11) | NO | NULL | MUL |  |  |
| `date` | date | NO | NULL | MUL |  |  |
| `available_units` | int(11) | NO | 1 |  |  |  |
| `price` | decimal(12,2) | YES | NULL |  | Financial |  |
| `status` | enum('open','closed') | NO | 'open' |  |  |  |
| `created_at` | timestamp | YES | current_timestamp() |  |  |  |
| `updated_at` | timestamp | YES | current_timestamp() |  |  | on update current_timestamp() |

### `service_categories`

| Column | Type | Null | Default | Key | Sensitivity | Notes |
|---|---|---|---|---|---|---|
| `id` | int(11) | NO | NULL | PRI |  | auto_increment |
| `name` | varchar(100) | NO | NULL | UNI | Personal |  |
| `slug` | varchar(120) | NO | NULL | UNI |  |  |
| `description` | varchar(255) | YES | NULL |  |  |  |
| `cover_image_url` | varchar(500) | YES | NULL |  |  |  |
| `display_order` | int(11) | NO | 0 |  |  |  |
| `is_active` | tinyint(1) | NO | 1 |  |  |  |
| `status` | enum('active','maintenance','deactivated') | NO | 'active' |  |  |  |
| `maintenance_message` | varchar(255) | YES | NULL |  |  |  |
| `created_at` | timestamp | YES | current_timestamp() |  |  |  |
| `updated_at` | timestamp | YES | current_timestamp() |  |  | on update current_timestamp() |

### `service_media`

| Column | Type | Null | Default | Key | Sensitivity | Notes |
|---|---|---|---|---|---|---|
| `id` | int(11) | NO | NULL | PRI |  | auto_increment |
| `service_id` | int(11) | NO | NULL | MUL |  |  |
| `media_url` | varchar(500) | NO | NULL |  |  |  |
| `media_type` | enum('image','video') | NO | 'image' |  |  |  |
| `is_primary` | tinyint(1) | NO | 0 |  |  |  |
| `display_order` | int(11) | NO | 0 |  |  |  |
| `created_at` | timestamp | YES | current_timestamp() |  |  |  |

### `service_pricing_rules`

| Column | Type | Null | Default | Key | Sensitivity | Notes |
|---|---|---|---|---|---|---|
| `id` | int(11) | NO | NULL | PRI |  | auto_increment |
| `service_id` | int(11) | NO | NULL | MUL |  |  |
| `rule_type` | enum('day_of_week','date_range') | NO | NULL |  |  |  |
| `day_of_week` | tinyint(4) | YES | NULL |  |  |  |
| `start_date` | date | YES | NULL |  |  |  |
| `end_date` | date | YES | NULL |  |  |  |
| `adjustment_type` | enum('percentage','fixed') | NO | NULL |  |  |  |
| `adjustment_value` | decimal(10,2) | NO | NULL |  |  |  |
| `label` | varchar(100) | YES | NULL |  |  |  |
| `is_active` | tinyint(1) | NO | 1 |  |  |  |
| `created_at` | timestamp | YES | current_timestamp() |  |  |  |
| `updated_at` | timestamp | YES | current_timestamp() |  |  | on update current_timestamp() |

## Cart, orders & returns

### `cart_items`

| Column | Type | Null | Default | Key | Sensitivity | Notes |
|---|---|---|---|---|---|---|
| `id` | int(11) | NO | NULL | PRI |  | auto_increment |
| `user_id` | int(11) | NO | NULL | MUL |  |  |
| `product_id` | int(11) | NO | NULL | MUL |  |  |
| `variant_id` | int(11) | NO | 0 |  |  |  |
| `quantity` | int(11) | NO | 1 |  |  |  |
| `created_at` | timestamp | YES | current_timestamp() |  |  |  |
| `updated_at` | timestamp | YES | current_timestamp() |  |  | on update current_timestamp() |

### `coupons`

| Column | Type | Null | Default | Key | Sensitivity | Notes |
|---|---|---|---|---|---|---|
| `id` | int(11) | NO | NULL | PRI |  | auto_increment |
| `code` | varchar(40) | NO | NULL | UNI |  |  |
| `discount_type` | enum('percent','fixed') | NO | NULL |  |  |  |
| `discount_value` | decimal(12,2) | NO | NULL |  |  |  |
| `min_order_amount` | decimal(12,2) | NO | 0.00 |  | Financial |  |
| `max_discount_amount` | decimal(12,2) | YES | NULL |  | Financial |  |
| `max_redemptions` | int(11) | YES | NULL |  |  |  |
| `times_redeemed` | int(11) | NO | 0 |  |  |  |
| `starts_at` | timestamp | YES | NULL |  |  |  |
| `expires_at` | timestamp | YES | NULL |  |  |  |
| `is_active` | tinyint(1) | NO | 1 |  |  |  |
| `created_at` | timestamp | YES | current_timestamp() |  |  |  |
| `updated_at` | timestamp | YES | current_timestamp() |  |  | on update current_timestamp() |

### `coupon_redemptions`

| Column | Type | Null | Default | Key | Sensitivity | Notes |
|---|---|---|---|---|---|---|
| `id` | int(11) | NO | NULL | PRI |  | auto_increment |
| `coupon_id` | int(11) | NO | NULL | MUL |  |  |
| `user_id` | int(11) | NO | NULL | MUL |  |  |
| `order_id` | int(11) | YES | NULL |  |  |  |
| `discount_amount` | decimal(12,2) | NO | NULL |  | Financial |  |
| `created_at` | timestamp | YES | current_timestamp() |  |  |  |

### `group_buys`

| Column | Type | Null | Default | Key | Sensitivity | Notes |
|---|---|---|---|---|---|---|
| `id` | int(11) | NO | NULL | PRI |  | auto_increment |
| `product_id` | int(11) | NO | NULL | MUL |  |  |
| `seller_id` | int(11) | NO | NULL | MUL |  |  |
| `group_price` | decimal(12,2) | NO | NULL |  | Financial |  |
| `min_participants` | int(11) | NO | NULL |  |  |  |
| `deadline` | timestamp | NO | NULL |  |  |  |
| `status` | enum('open','successful','failed','cancelled') | NO | 'open' | MUL |  |  |
| `created_at` | timestamp | YES | current_timestamp() |  |  |  |
| `updated_at` | timestamp | YES | current_timestamp() |  |  | on update current_timestamp() |

### `group_buy_participants`

| Column | Type | Null | Default | Key | Sensitivity | Notes |
|---|---|---|---|---|---|---|
| `id` | int(11) | NO | NULL | PRI |  | auto_increment |
| `group_buy_id` | int(11) | NO | NULL | MUL |  |  |
| `buyer_id` | int(11) | NO | NULL | MUL |  |  |
| `order_id` | int(11) | YES | NULL | MUL |  |  |
| `claim_locked_at` | datetime | YES | NULL |  |  |  |
| `joined_at` | timestamp | YES | current_timestamp() |  |  |  |

### `live_selling_reminders`

| Column | Type | Null | Default | Key | Sensitivity | Notes |
|---|---|---|---|---|---|---|
| `id` | int(11) | NO | NULL | PRI |  | auto_increment |
| `user_id` | int(11) | NO | NULL | MUL |  |  |
| `session_id` | int(11) | NO | NULL | MUL |  |  |
| `notified_at` | timestamp | YES | NULL |  |  |  |
| `created_at` | timestamp | YES | current_timestamp() |  |  |  |

### `live_selling_sessions`

| Column | Type | Null | Default | Key | Sensitivity | Notes |
|---|---|---|---|---|---|---|
| `id` | int(11) | NO | NULL | PRI |  | auto_increment |
| `seller_id` | int(11) | NO | NULL | MUL |  |  |
| `title` | varchar(200) | NO | NULL |  |  |  |
| `description` | varchar(1000) | YES | NULL |  |  |  |
| `external_link` | varchar(500) | NO | NULL |  |  |  |
| `scheduled_at` | timestamp | NO | NULL |  |  |  |
| `status` | enum('scheduled','live','ended','cancelled') | NO | 'scheduled' | MUL |  |  |
| `created_at` | timestamp | YES | current_timestamp() |  |  |  |
| `updated_at` | timestamp | YES | current_timestamp() |  |  | on update current_timestamp() |

### `orders`

| Column | Type | Null | Default | Key | Sensitivity | Notes |
|---|---|---|---|---|---|---|
| `id` | int(11) | NO | NULL | PRI |  | auto_increment |
| `order_number` | varchar(30) | NO | NULL | UNI |  |  |
| `buyer_id` | int(11) | NO | NULL | MUL |  |  |
| `parent_order_id` | int(11) | YES | NULL | MUL |  |  |
| `is_parent` | tinyint(1) | NO | 0 |  |  |  |
| `status` | enum('pending','processing','shipped','delivered','cancelled') | NO | 'pending' |  |  |  |
| `order_type` | enum('standard','pre_order') | NO | 'standard' |  |  |  |
| `preorder_lead_time_days` | int(11) | YES | NULL |  |  |  |
| `preorder_ready_by` | date | YES | NULL |  |  |  |
| `buyer_confirmed_at` | timestamp | YES | NULL |  |  |  |
| `delivery_mode` | enum('platform','own') | NO | 'platform' |  |  |  |
| `payment_status` | enum('unpaid','deposit_paid','paid') | NO | 'unpaid' |  |  |  |
| `payment_method` | enum('mobile_money','cash_on_delivery','snippe','malipopay_card','paypal','wallet') | NO | NULL |  |  |  |
| `shipping_address` | varchar(255) | NO | NULL |  | Contact PII |  |
| `shipping_city` | varchar(100) | NO | NULL |  |  |  |
| `shipping_region` | varchar(100) | NO | NULL |  |  |  |
| `shipping_phone` | varchar(30) | NO | NULL |  | Contact PII |  |
| `pickup_point_id` | int(11) | YES | NULL | MUL |  |  |
| `buyer_address_id` | int(11) | YES | NULL |  | Contact PII |  |
| `coupon_id` | int(11) | YES | NULL |  |  |  |
| `coupon_discount_amount` | decimal(12,2) | NO | 0.00 |  | Financial |  |
| `delivery_lat` | decimal(10,7) | YES | NULL |  | Contact PII |  |
| `delivery_lng` | decimal(10,7) | YES | NULL |  | Contact PII |  |
| `total_amount` | decimal(12,2) | NO | NULL |  | Financial |  |
| `total_refunded` | decimal(12,2) | NO | 0.00 |  | Financial |  |
| `delivery_handover_code` | varchar(6) | YES | NULL |  |  |  |
| `deposit_amount` | decimal(12,2) | YES | NULL |  | Financial |  |
| `deposit_paid_at` | timestamp | YES | NULL |  |  |  |
| `balance_amount` | decimal(12,2) | YES | NULL |  | Financial |  |
| `balance_requested_at` | timestamp | YES | NULL |  | Financial |  |
| `balance_paid_at` | timestamp | YES | NULL |  | Financial |  |
| `is_test` | tinyint(1) | NO | 0 | MUL |  |  |
| `buyer_protection_addon` | tinyint(1) | NO | 0 |  |  |  |
| `buyer_protection_fee` | decimal(12,2) | NO | 0.00 |  | Financial |  |
| `loyalty_points_redeemed` | int(11) | NO | 0 |  |  |  |
| `loyalty_discount_amount` | decimal(12,2) | NO | 0.00 |  | Financial |  |
| `created_at` | timestamp | YES | current_timestamp() |  |  |  |
| `updated_at` | timestamp | YES | current_timestamp() |  |  | on update current_timestamp() |
| `checkout_terms_accepted_at` | timestamp | YES | NULL |  |  |  |
| `checkout_terms_version` | varchar(20) | YES | NULL |  |  |  |
| `loyalty_points_earned` | int(11) | NO | 0 |  |  |  |
| `loyalty_earned_at` | timestamp | YES | NULL |  |  |  |
| `loyalty_clawed_back_at` | timestamp | YES | NULL |  |  |  |
| `rider_fee_quote` | decimal(10,2) | YES | NULL |  | Financial |  |
| `rider_fee_quote_details` | longtext | YES | NULL |  | Financial |  |
| `rider_fee_quoted_at` | datetime | YES | NULL |  | Financial |  |
| `fulfilment_state` | enum('awaiting_ready','ready') | YES | NULL |  |  |  |
| `ready_at` | datetime | YES | NULL |  |  |  |
| `ready_reminder_sent_at` | datetime | YES | NULL |  |  |  |
| `overdue_notified_at` | datetime | YES | NULL |  |  |  |

### `order_items`

| Column | Type | Null | Default | Key | Sensitivity | Notes |
|---|---|---|---|---|---|---|
| `id` | int(11) | NO | NULL | PRI |  | auto_increment |
| `order_id` | int(11) | NO | NULL | MUL |  |  |
| `product_id` | int(11) | NO | NULL | MUL |  |  |
| `variant_id` | int(11) | NO | 0 |  |  |  |
| `variant_label` | varchar(255) | YES | NULL |  |  |  |
| `seller_id` | int(11) | NO | NULL | MUL |  |  |
| `quantity` | int(11) | NO | NULL |  |  |  |
| `unit_price` | decimal(12,2) | NO | NULL |  | Financial |  |
| `subtotal` | decimal(12,2) | NO | NULL |  |  |  |
| `total_refunded` | decimal(12,2) | NO | 0.00 |  | Financial |  |
| `commission_rate` | decimal(5,2) | YES | NULL |  | Financial |  |
| `commission_amount` | decimal(12,2) | YES | NULL |  | Financial |  |
| `seller_net_amount` | decimal(12,2) | YES | NULL |  | Financial |  |
| `wallet_credited` | tinyint(1) | NO | 0 | MUL | Financial |  |
| `wallet_released` | tinyint(1) | NO | 0 |  | Financial |  |
| `created_at` | timestamp | YES | current_timestamp() |  |  |  |
| `chargeback_reversed_at` | timestamp | YES | NULL |  |  |  |

### `order_returns`

| Column | Type | Null | Default | Key | Sensitivity | Notes |
|---|---|---|---|---|---|---|
| `id` | int(11) | NO | NULL | PRI |  | auto_increment |
| `order_id` | int(11) | NO | NULL | MUL |  |  |
| `order_item_id` | int(11) | YES | NULL | MUL |  |  |
| `buyer_id` | int(11) | NO | NULL | MUL |  |  |
| `seller_id` | int(11) | YES | NULL | MUL |  |  |
| `reason` | enum('damaged_item','wrong_item','defective_product','not_as_described','changed_mind','other') | NO | NULL |  |  |  |
| `description` | text | YES | NULL |  |  |  |
| `status` | enum('requested','approved','rejected','shipped_back','received','refunded','cancelled') | NO | 'requested' | MUL |  |  |
| `is_test` | tinyint(1) | NO | 0 | MUL |  |  |
| `return_window_days` | int(11) | NO | NULL |  |  |  |
| `return_tracking_number` | varchar(100) | YES | NULL |  |  |  |
| `return_carrier` | varchar(100) | YES | NULL |  |  |  |
| `shipped_back_at` | timestamp | YES | NULL |  |  |  |
| `received_at` | timestamp | YES | NULL |  |  |  |
| `refund_amount` | decimal(12,2) | YES | NULL |  | Financial |  |
| `rejection_reason` | varchar(500) | YES | NULL |  |  |  |
| `decided_by` | int(11) | YES | NULL | MUL |  |  |
| `decided_at` | timestamp | YES | NULL |  |  |  |
| `created_at` | timestamp | YES | current_timestamp() |  |  |  |
| `updated_at` | timestamp | YES | current_timestamp() |  |  | on update current_timestamp() |

### `order_return_history`

| Column | Type | Null | Default | Key | Sensitivity | Notes |
|---|---|---|---|---|---|---|
| `id` | int(11) | NO | NULL | PRI |  | auto_increment |
| `return_id` | int(11) | NO | NULL | MUL |  |  |
| `action` | varchar(50) | NO | NULL |  |  |  |
| `note` | varchar(500) | YES | NULL |  |  |  |
| `actor_id` | int(11) | YES | NULL | MUL |  |  |
| `created_at` | timestamp | YES | current_timestamp() |  |  |  |

### `return_evidence`

| Column | Type | Null | Default | Key | Sensitivity | Notes |
|---|---|---|---|---|---|---|
| `id` | int(11) | NO | NULL | PRI |  | auto_increment |
| `return_id` | int(11) | NO | NULL | MUL |  |  |
| `uploaded_by` | int(11) | NO | NULL | MUL |  |  |
| `file_url` | varchar(500) | NO | NULL |  | Government/ID doc |  |
| `uploaded_at` | timestamp | YES | current_timestamp() |  |  |  |

## Payments, wallets & payouts

### `agent_earnings`

| Column | Type | Null | Default | Key | Sensitivity | Notes |
|---|---|---|---|---|---|---|
| `id` | int(11) | NO | NULL | PRI |  | auto_increment |
| `agent_id` | int(11) | NO | NULL | MUL |  |  |
| `delivery_id` | int(11) | NO | NULL | UNI |  |  |
| `order_id` | int(11) | NO | NULL | MUL |  |  |
| `amount` | decimal(12,2) | NO | NULL |  | Financial |  |
| `created_at` | timestamp | YES | current_timestamp() |  |  |  |
| `status` | enum('held','released') | NO | 'held' | MUL |  |  |
| `released_at` | timestamp | YES | NULL |  |  |  |

### `buyer_wallets`

| Column | Type | Null | Default | Key | Sensitivity | Notes |
|---|---|---|---|---|---|---|
| `buyer_id` | int(11) | NO | NULL | PRI |  |  |
| `balance` | decimal(14,2) | NO | 0.00 |  | Financial |  |
| `updated_at` | timestamp | YES | current_timestamp() |  |  | on update current_timestamp() |
| `last_topup_phone` | varchar(20) | YES | NULL |  | Contact PII |  |

### `buyer_wallet_transactions`

| Column | Type | Null | Default | Key | Sensitivity | Notes |
|---|---|---|---|---|---|---|
| `id` | int(11) | NO | NULL | PRI |  | auto_increment |
| `buyer_id` | int(11) | NO | NULL | MUL |  |  |
| `type` | enum('credit','debit') | NO | NULL |  |  |  |
| `amount` | decimal(14,2) | NO | NULL |  | Financial |  |
| `balance_after` | decimal(14,2) | NO | NULL |  | Financial |  |
| `reference_type` | enum('topup','order_payment','refund','adjustment','affiliate_commission') | NO | NULL |  |  |  |
| `reference_id` | int(11) | YES | NULL |  |  |  |
| `payment_id` | int(11) | YES | NULL |  |  |  |
| `description` | varchar(255) | YES | NULL |  |  |  |
| `is_test` | tinyint(1) | NO | 0 | MUL |  |  |
| `created_at` | timestamp | YES | current_timestamp() |  |  |  |
| `dedupe_key` | varchar(64) | YES | NULL | UNI |  | STORED GENERATED |

### `efd_receipts`

| Column | Type | Null | Default | Key | Sensitivity | Notes |
|---|---|---|---|---|---|---|
| `id` | int(11) | NO | NULL | PRI |  | auto_increment |
| `order_id` | int(11) | NO | NULL | UNI |  |  |
| `seller_id` | int(11) | NO | NULL | MUL |  |  |
| `status` | enum('pending','issued','failed','not_applicable') | NO | 'pending' | MUL |  |  |
| `retry_count` | int(11) | NO | 0 |  |  |  |
| `last_retry_at` | timestamp | YES | NULL |  |  |  |
| `credit_note_status` | enum('none','pending','issued','failed') | NO | 'none' |  |  |  |
| `fiscal_receipt_number` | varchar(50) | YES | NULL |  |  |  |
| `verification_code` | varchar(100) | YES | NULL |  |  |  |
| `raw_response` | longtext | YES | NULL |  |  |  |
| `error_message` | varchar(500) | YES | NULL |  |  |  |
| `submitted_at` | timestamp | YES | NULL |  |  |  |
| `issued_at` | timestamp | YES | NULL |  |  |  |
| `created_at` | timestamp | YES | current_timestamp() |  |  |  |
| `updated_at` | timestamp | YES | current_timestamp() |  |  | on update current_timestamp() |

### `payments`

| Column | Type | Null | Default | Key | Sensitivity | Notes |
|---|---|---|---|---|---|---|
| `id` | int(11) | NO | NULL | PRI |  | auto_increment |
| `order_id` | int(11) | YES | NULL | MUL |  |  |
| `booking_id` | int(11) | YES | NULL | MUL |  |  |
| `subscription_id` | int(11) | YES | NULL | MUL |  |  |
| `topup_id` | int(11) | YES | NULL | MUL |  |  |
| `purpose` | enum('order_payment','seller_verification_fee','booking_payment','subscription_payment','wallet_topup') | NO | 'order_payment' |  |  |  |
| `payment_leg` | enum('full','deposit','balance') | NO | 'full' |  |  |  |
| `seller_id` | int(11) | YES | NULL | MUL |  |  |
| `method` | enum('mobile_money','cash_on_delivery','snippe','malipopay_card','paypal','wallet') | NO | NULL |  |  |  |
| `payer_phone_encrypted` | varchar(255) | YES | NULL |  | Contact PII |  |
| `status` | enum('pending','completed','failed','chargeback') | NO | 'pending' | MUL |  |  |
| `amount` | decimal(12,2) | NO | NULL |  | Financial |  |
| `charged_currency` | char(3) | YES | NULL |  |  |  |
| `charged_amount` | decimal(12,2) | YES | NULL |  | Financial |  |
| `transaction_reference` | varchar(100) | YES | NULL |  |  |  |
| `receipt_number` | varchar(30) | YES | NULL | UNI |  |  |
| `paid_at` | timestamp | YES | NULL |  |  |  |
| `created_at` | timestamp | YES | current_timestamp() |  |  |  |
| `updated_at` | timestamp | YES | current_timestamp() |  |  | on update current_timestamp() |
| `payment_reference` | varchar(64) | YES | NULL | UNI |  |  |
| `expected_usd_amount` | decimal(12,2) | YES | NULL |  | Financial |  |
| `usd_exchange_rate` | decimal(14,4) | YES | NULL |  |  |  |
| `chargeback_at` | timestamp | YES | NULL |  |  |  |
| `chargeback_reason` | varchar(255) | YES | NULL |  |  |  |

### `payment_review_queue`

| Column | Type | Null | Default | Key | Sensitivity | Notes |
|---|---|---|---|---|---|---|
| `id` | int(11) | NO | NULL | PRI |  | auto_increment |
| `payment_id` | int(11) | NO | NULL | MUL |  |  |
| `reason` | varchar(48) | NO | NULL |  |  |  |
| `details` | text | YES | NULL |  |  |  |
| `status` | enum('open','resolved') | NO | 'open' | MUL |  |  |
| `resolution_note` | varchar(500) | YES | NULL |  |  |  |
| `resolved_by` | int(11) | YES | NULL |  |  |  |
| `created_at` | timestamp | NO | current_timestamp() |  |  |  |
| `resolved_at` | timestamp | YES | NULL |  |  |  |

### `refunds`

| Column | Type | Null | Default | Key | Sensitivity | Notes |
|---|---|---|---|---|---|---|
| `id` | int(11) | NO | NULL | PRI |  | auto_increment |
| `dispute_id` | int(11) | YES | NULL | UNI |  |  |
| `return_id` | int(11) | YES | NULL | UNI |  |  |
| `booking_id` | int(11) | YES | NULL | UNI |  |  |
| `payment_id` | int(11) | YES | NULL | MUL |  |  |
| `order_id` | int(11) | YES | NULL | MUL |  |  |
| `buyer_id` | int(11) | NO | NULL | MUL |  |  |
| `seller_id` | int(11) | YES | NULL | MUL |  |  |
| `provider` | enum('mobile_money','snippe','malipopay_card','paypal','wallet','cash_on_delivery') | NO | NULL |  |  |  |
| `amount` | decimal(12,2) | NO | NULL |  | Financial |  |
| `idempotency_key` | varchar(64) | NO | NULL | UNI |  |  |
| `status` | enum('pending','processing','completed','failed','manual_required') | NO | 'pending' | MUL |  |  |
| `provider_reference` | varchar(150) | YES | NULL |  |  |  |
| `attempts` | int(11) | NO | 0 |  |  |  |
| `last_error` | varchar(500) | YES | NULL |  |  |  |
| `requested_by` | int(11) | YES | NULL | MUL |  |  |
| `completed_at` | timestamp | YES | NULL |  |  |  |
| `created_at` | timestamp | YES | current_timestamp() |  |  |  |
| `updated_at` | timestamp | YES | current_timestamp() |  |  | on update current_timestamp() |

### `seller_wallets`

| Column | Type | Null | Default | Key | Sensitivity | Notes |
|---|---|---|---|---|---|---|
| `seller_id` | int(11) | NO | NULL | PRI |  |  |
| `balance` | decimal(14,2) | NO | 0.00 | MUL | Financial |  |
| `held_balance` | decimal(14,2) | NO | 0.00 |  | Financial |  |
| `updated_at` | timestamp | YES | current_timestamp() |  |  | on update current_timestamp() |

### `wallet_reconciliation_flags`

| Column | Type | Null | Default | Key | Sensitivity | Notes |
|---|---|---|---|---|---|---|
| `id` | int(11) | NO | NULL | PRI |  | auto_increment |
| `wallet_type` | enum('seller','buyer') | NO | NULL |  | Financial |  |
| `owner_id` | int(11) | NO | NULL |  |  |  |
| `recorded_balance` | decimal(14,2) | NO | NULL |  | Financial |  |
| `computed_balance` | decimal(14,2) | NO | NULL |  | Financial |  |
| `drift` | decimal(14,2) | NO | NULL |  |  |  |
| `status` | enum('open','resolved') | NO | 'open' | MUL |  |  |
| `created_at` | timestamp | NO | current_timestamp() |  |  |  |
| `resolved_at` | timestamp | YES | NULL |  |  |  |

### `wallet_top_ups`

| Column | Type | Null | Default | Key | Sensitivity | Notes |
|---|---|---|---|---|---|---|
| `id` | int(11) | NO | NULL | PRI |  | auto_increment |
| `buyer_id` | int(11) | NO | NULL | MUL |  |  |
| `amount` | decimal(14,2) | NO | NULL |  | Financial |  |
| `status` | enum('pending','completed','failed') | NO | 'pending' |  |  |  |
| `created_at` | timestamp | YES | current_timestamp() |  |  |  |
| `completed_at` | timestamp | YES | NULL |  |  |  |

### `wallet_transactions`

| Column | Type | Null | Default | Key | Sensitivity | Notes |
|---|---|---|---|---|---|---|
| `id` | int(11) | NO | NULL | PRI |  | auto_increment |
| `seller_id` | int(11) | NO | NULL | MUL |  |  |
| `type` | enum('credit','debit') | NO | NULL |  |  |  |
| `amount` | decimal(14,2) | NO | NULL |  | Financial |  |
| `balance_after` | decimal(14,2) | NO | NULL |  | Financial |  |
| `reference_type` | enum('order','withdrawal','adjustment','dispute','escrow_release','booking','cod_commission') | NO | NULL |  |  |  |
| `reference_id` | int(11) | YES | NULL |  |  |  |
| `description` | varchar(255) | YES | NULL |  |  |  |
| `is_test` | tinyint(1) | NO | 0 | MUL |  |  |
| `created_at` | timestamp | YES | current_timestamp() |  |  |  |

### `webhook_replay_guard`

| Column | Type | Null | Default | Key | Sensitivity | Notes |
|---|---|---|---|---|---|---|
| `id` | bigint(20) unsigned | NO | NULL | PRI |  | auto_increment |
| `provider` | varchar(32) | NO | NULL | MUL |  |  |
| `payload_hash` | char(64) | NO | NULL |  | Credential/secret |  |
| `received_at` | timestamp | NO | current_timestamp() | MUL |  |  |

### `withdrawal_requests`

| Column | Type | Null | Default | Key | Sensitivity | Notes |
|---|---|---|---|---|---|---|
| `id` | int(11) | NO | NULL | PRI |  | auto_increment |
| `seller_id` | int(11) | NO | NULL | MUL |  |  |
| `amount` | decimal(14,2) | NO | NULL |  | Financial |  |
| `payout_currency` | enum('TZS','USD') | NO | 'TZS' |  | Financial |  |
| `payout_amount` | decimal(14,2) | YES | NULL |  | Financial |  |
| `payout_exchange_rate` | decimal(10,4) | YES | NULL |  | Financial |  |
| `status` | enum('pending','approved','rejected','paid') | NO | 'pending' |  |  |  |
| `payout_method` | varchar(50) | NO | NULL |  | Financial |  |
| `payout_details` | varchar(255) | NO | NULL |  | Financial |  |
| `admin_note` | varchar(255) | YES | NULL |  |  |  |
| `requested_at` | timestamp | YES | current_timestamp() |  |  |  |
| `processed_at` | timestamp | YES | NULL |  |  |  |
| `payout_reference` | varchar(100) | YES | NULL |  | Financial |  |
| `hold_until` | timestamp | YES | NULL |  |  |  |
| `payout_details_is_new` | tinyint(1) | NO | 0 |  | Financial |  |
| `payout_network` | varchar(30) | YES | NULL |  | Financial |  |
| `payout_phone` | varchar(20) | YES | NULL |  | Financial |  |
| `payout_bank_name` | varchar(80) | YES | NULL |  | Financial |  |
| `payout_account_number` | varchar(30) | YES | NULL |  | Financial |  |
| `payout_account_name` | varchar(120) | YES | NULL |  | Financial |  |

## Delivery

### `deliveries`

| Column | Type | Null | Default | Key | Sensitivity | Notes |
|---|---|---|---|---|---|---|
| `id` | int(11) | NO | NULL | PRI |  | auto_increment |
| `order_id` | int(11) | NO | NULL | UNI |  |  |
| `agent_id` | int(11) | NO | NULL | MUL |  |  |
| `status` | enum('assigned','picked_up','in_transit','delivered','failed') | NO | 'assigned' |  |  |  |
| `delivery_fee` | decimal(10,2) | YES | NULL |  | Financial |  |
| `distance_km` | decimal(6,2) | YES | NULL |  |  |  |
| `estimated_duration_minutes` | decimal(6,1) | YES | NULL |  |  |  |
| `routing_provider` | enum('osrm','fallback') | YES | NULL |  |  |  |
| `earnings_credited` | tinyint(1) | NO | 0 |  |  |  |
| `notes` | varchar(255) | YES | NULL |  |  |  |
| `assigned_at` | timestamp | YES | current_timestamp() |  |  |  |
| `picked_up_at` | timestamp | YES | NULL |  |  |  |
| `in_transit_at` | timestamp | YES | NULL |  |  |  |
| `delivered_at` | timestamp | YES | NULL |  |  |  |
| `handover_verified` | tinyint(1) | NO | 0 |  |  |  |
| `handover_method` | enum('code','photo_gps') | YES | NULL |  |  |  |
| `dropoff_photo_url` | varchar(500) | YES | NULL |  | Personal |  |
| `dropoff_distance_m` | int(11) | YES | NULL |  |  |  |
| `dropoff_flagged` | tinyint(1) | NO | 0 |  |  |  |
| `pickup_confirmed_at` | timestamp | YES | NULL |  |  |  |
| `pickup_photo_url` | varchar(500) | YES | NULL |  | Personal |  |
| `updated_at` | timestamp | YES | current_timestamp() |  |  | on update current_timestamp() |

### `delivery_businesses`

| Column | Type | Null | Default | Key | Sensitivity | Notes |
|---|---|---|---|---|---|---|
| `id` | int(11) | NO | NULL | PRI |  | auto_increment |
| `owner_user_id` | int(11) | NO | NULL | UNI |  |  |
| `name` | varchar(120) | NO | NULL |  | Personal |  |
| `created_at` | timestamp | YES | current_timestamp() |  |  |  |

### `delivery_business_agents`

| Column | Type | Null | Default | Key | Sensitivity | Notes |
|---|---|---|---|---|---|---|
| `id` | int(11) | NO | NULL | PRI |  | auto_increment |
| `business_id` | int(11) | NO | NULL | MUL |  |  |
| `agent_id` | int(11) | NO | NULL | UNI |  |  |
| `created_at` | timestamp | YES | current_timestamp() |  |  |  |

### `delivery_business_jobs`

| Column | Type | Null | Default | Key | Sensitivity | Notes |
|---|---|---|---|---|---|---|
| `id` | int(11) | NO | NULL | PRI |  | auto_increment |
| `business_id` | int(11) | NO | NULL | MUL |  |  |
| `assigned_agent_id` | int(11) | YES | NULL | MUL |  |  |
| `reference` | varchar(40) | YES | NULL |  |  |  |
| `pickup_address` | varchar(255) | NO | NULL |  | Contact PII |  |
| `dropoff_address` | varchar(255) | NO | NULL |  | Contact PII |  |
| `customer_name` | varchar(120) | NO | NULL |  | Personal |  |
| `customer_phone` | varchar(30) | YES | NULL |  | Contact PII |  |
| `description` | varchar(255) | YES | NULL |  |  |  |
| `status` | enum('created','assigned','picked_up','delivered','cancelled') | NO | 'created' |  |  |  |
| `fee_amount` | decimal(12,2) | NO | 0.00 |  | Financial |  |
| `fee_collected` | tinyint(1) | NO | 0 |  | Financial |  |
| `fee_collected_at` | datetime | YES | NULL |  | Financial |  |
| `assigned_at` | datetime | YES | NULL |  |  |  |
| `picked_up_at` | datetime | YES | NULL |  |  |  |
| `delivered_at` | datetime | YES | NULL |  |  |  |
| `cancelled_at` | datetime | YES | NULL |  |  |  |
| `created_at` | timestamp | YES | current_timestamp() |  |  |  |
| `updated_at` | timestamp | YES | current_timestamp() |  |  | on update current_timestamp() |

### `delivery_eta_adjustments`

| Column | Type | Null | Default | Key | Sensitivity | Notes |
|---|---|---|---|---|---|---|
| `id` | int(11) | NO | NULL | PRI |  | auto_increment |
| `region` | varchar(60) | NO | NULL | MUL |  |  |
| `label` | varchar(60) | YES | NULL |  |  |  |
| `start_hour` | tinyint(3) unsigned | NO | NULL |  |  |  |
| `end_hour` | tinyint(3) unsigned | NO | NULL |  |  |  |
| `multiplier` | decimal(4,2) | NO | 1.00 |  |  |  |
| `buffer_minutes` | smallint(5) unsigned | NO | 0 |  |  |  |
| `is_active` | tinyint(1) | NO | 1 |  |  |  |
| `created_at` | timestamp | NO | current_timestamp() |  |  |  |
| `updated_at` | timestamp | NO | current_timestamp() |  |  | on update current_timestamp() |

### `delivery_offers`

| Column | Type | Null | Default | Key | Sensitivity | Notes |
|---|---|---|---|---|---|---|
| `id` | int(11) | NO | NULL | PRI |  | auto_increment |
| `order_id` | int(11) | NO | NULL | MUL |  |  |
| `agent_id` | int(11) | NO | NULL | MUL |  |  |
| `status` | enum('offered','accepted','declined','expired') | NO | 'offered' |  |  |  |
| `distance_km` | decimal(6,2) | NO | NULL |  |  |  |
| `external_channel` | enum('whatsapp','sms') | YES | NULL |  |  |  |
| `offered_at` | timestamp | YES | current_timestamp() |  |  |  |
| `responded_at` | timestamp | YES | NULL |  |  |  |
| `response_channel` | enum('app','whatsapp','sms') | YES | NULL |  |  |  |
| `expires_at` | timestamp | NO | NULL |  |  |  |
| `dropoff_distance_km` | decimal(8,2) | YES | NULL |  |  |  |
| `trip_minutes` | int(11) | YES | NULL |  |  |  |
| `payout_quote` | decimal(10,2) | YES | NULL |  | Financial |  |
| `score` | decimal(8,4) | YES | NULL |  |  |  |
| `radius_index` | tinyint(3) unsigned | YES | NULL |  |  |  |

### `delivery_rate_cards`

| Column | Type | Null | Default | Key | Sensitivity | Notes |
|---|---|---|---|---|---|---|
| `id` | int(11) | NO | NULL | PRI |  | auto_increment |
| `vehicle_type` | varchar(20) | NO | NULL | MUL |  |  |
| `fuel_product` | enum('petrol','diesel') | NO | 'petrol' |  |  |  |
| `min_fee` | decimal(10,2) | NO | NULL |  | Financial |  |
| `per_km_rate` | decimal(10,2) | NO | NULL |  |  |  |
| `effective_from` | datetime | NO | current_timestamp() |  |  |  |
| `created_by` | int(11) | YES | NULL | MUL |  |  |
| `created_at` | timestamp | NO | current_timestamp() |  |  |  |

### `delivery_ratings`

| Column | Type | Null | Default | Key | Sensitivity | Notes |
|---|---|---|---|---|---|---|
| `id` | int(11) | NO | NULL | PRI |  | auto_increment |
| `order_id` | int(11) | NO | NULL | UNI |  |  |
| `agent_id` | int(11) | NO | NULL | MUL |  |  |
| `buyer_id` | int(11) | NO | NULL | MUL |  |  |
| `rating` | tinyint(4) | NO | NULL |  |  |  |
| `comment` | varchar(500) | YES | NULL |  |  |  |
| `created_at` | timestamp | YES | current_timestamp() |  |  |  |
| `updated_at` | timestamp | YES | current_timestamp() |  |  | on update current_timestamp() |

### `fuel_reference`

| Column | Type | Null | Default | Key | Sensitivity | Notes |
|---|---|---|---|---|---|---|
| `id` | int(11) | NO | NULL | PRI |  | auto_increment |
| `region` | varchar(60) | NO | NULL | MUL |  |  |
| `product` | enum('petrol','diesel') | NO | NULL |  |  |  |
| `cap_price` | decimal(10,2) | NO | NULL |  | Financial |  |
| `effective_from` | datetime | NO | NULL |  |  |  |
| `entered_by` | int(11) | YES | NULL | MUL |  |  |
| `created_at` | timestamp | NO | current_timestamp() |  |  |  |

### `seller_delivery_agents`

| Column | Type | Null | Default | Key | Sensitivity | Notes |
|---|---|---|---|---|---|---|
| `id` | int(11) | NO | NULL | PRI |  | auto_increment |
| `seller_id` | int(11) | NO | NULL | MUL |  |  |
| `agent_id` | int(11) | NO | NULL | MUL |  |  |
| `created_at` | timestamp | YES | current_timestamp() |  |  |  |

## Messaging, support & disputes

### `admin_notifications`

| Column | Type | Null | Default | Key | Sensitivity | Notes |
|---|---|---|---|---|---|---|
| `id` | int(11) | NO | NULL | PRI |  | auto_increment |
| `type` | varchar(50) | NO | NULL | MUL |  |  |
| `category` | enum('account','moderation','security') | NO | NULL | MUL |  |  |
| `severity` | enum('info','warning','critical') | NO | 'info' |  |  |  |
| `title` | varchar(150) | NO | NULL |  |  |  |
| `message` | varchar(500) | NO | NULL |  |  |  |
| `metadata` | longtext | YES | NULL |  |  |  |
| `related_user_id` | int(11) | YES | NULL | MUL |  |  |
| `is_read` | tinyint(1) | NO | 0 | MUL |  |  |
| `read_by` | int(11) | YES | NULL | MUL |  |  |
| `read_at` | timestamp | YES | NULL |  |  |  |
| `created_at` | timestamp | YES | current_timestamp() | MUL |  |  |

### `broadcasts`

| Column | Type | Null | Default | Key | Sensitivity | Notes |
|---|---|---|---|---|---|---|
| `id` | int(11) | NO | NULL | PRI |  | auto_increment |
| `admin_id` | int(11) | NO | NULL | MUL |  |  |
| `segment` | varchar(30) | NO | NULL |  |  |  |
| `channels` | varchar(60) | NO | NULL |  |  |  |
| `subject` | varchar(150) | YES | NULL |  |  |  |
| `message` | text | NO | NULL |  |  |  |
| `sms_message` | text | YES | NULL |  |  |  |
| `whatsapp_message` | text | YES | NULL |  | Contact PII |  |
| `in_app_title` | varchar(150) | YES | NULL |  |  |  |
| `in_app_message` | text | YES | NULL |  |  |  |
| `recipient_count` | int(11) | NO | 0 |  |  |  |
| `email_sent_count` | int(11) | NO | 0 |  | Contact PII |  |
| `sms_sent_count` | int(11) | NO | 0 |  |  |  |
| `whatsapp_sent_count` | int(11) | NO | 0 |  | Contact PII |  |
| `in_app_sent_count` | int(11) | NO | 0 |  |  |  |
| `created_at` | timestamp | YES | current_timestamp() | MUL |  |  |
| `deleted_at` | timestamp | YES | NULL | MUL |  |  |
| `template_type` | enum('all','messaging','rich') | NO | 'all' | MUL |  |  |

### `conversations`

| Column | Type | Null | Default | Key | Sensitivity | Notes |
|---|---|---|---|---|---|---|
| `id` | int(11) | NO | NULL | PRI |  | auto_increment |
| `buyer_id` | int(11) | NO | NULL | MUL |  |  |
| `seller_id` | int(11) | YES | NULL | MUL |  |  |
| `delivery_agent_id` | int(11) | YES | NULL | MUL |  |  |
| `product_id` | int(11) | YES | NULL | MUL |  |  |
| `is_test` | tinyint(1) | NO | 0 | MUL |  |  |
| `order_id` | int(11) | YES | NULL | MUL |  |  |
| `created_at` | timestamp | YES | current_timestamp() |  |  |  |
| `updated_at` | timestamp | YES | current_timestamp() |  |  | on update current_timestamp() |
| `buyer_cleared_at` | timestamp | YES | NULL |  |  |  |
| `seller_cleared_at` | timestamp | YES | NULL |  |  |  |
| `agent_cleared_at` | timestamp | YES | NULL |  |  |  |
| `buyer_deleted_at` | timestamp | YES | NULL |  |  |  |
| `seller_deleted_at` | timestamp | YES | NULL |  |  |  |
| `agent_deleted_at` | timestamp | YES | NULL |  |  |  |
| `buyer_muted_at` | timestamp | YES | NULL |  |  |  |
| `seller_muted_at` | timestamp | YES | NULL |  |  |  |
| `agent_muted_at` | timestamp | YES | NULL |  |  |  |
| `buyer_archived_at` | timestamp | YES | NULL |  |  |  |
| `seller_archived_at` | timestamp | YES | NULL |  |  |  |
| `agent_archived_at` | timestamp | YES | NULL |  |  |  |

### `disputes`

| Column | Type | Null | Default | Key | Sensitivity | Notes |
|---|---|---|---|---|---|---|
| `id` | int(11) | NO | NULL | PRI |  | auto_increment |
| `dispute_number` | varchar(40) | NO | NULL | UNI |  |  |
| `order_id` | int(11) | NO | NULL | MUL |  |  |
| `order_item_id` | int(11) | YES | NULL | MUL |  |  |
| `buyer_id` | int(11) | NO | NULL | MUL |  |  |
| `seller_id` | int(11) | YES | NULL | MUL |  |  |
| `type` | enum('damaged_item','delayed_delivery','defective_product','wrong_item','missing_delivery','other') | NO | NULL |  |  |  |
| `status` | enum('open','under_review','resolved','rejected','withdrawn') | NO | 'open' | MUL |  |  |
| `is_test` | tinyint(1) | NO | 0 | MUL |  |  |
| `subject` | varchar(150) | NO | NULL |  |  |  |
| `description` | text | NO | NULL |  |  |  |
| `resolution` | enum('refund_full','refund_partial','replacement','compensation','no_action') | YES | NULL |  |  |  |
| `resolution_note` | varchar(1000) | YES | NULL |  |  |  |
| `refund_amount` | decimal(12,2) | YES | NULL |  | Financial |  |
| `resolved_by` | int(11) | YES | NULL | MUL |  |  |
| `resolved_at` | timestamp | YES | NULL |  |  |  |
| `created_at` | timestamp | YES | current_timestamp() |  |  |  |
| `first_response_at` | timestamp | YES | NULL |  |  |  |
| `sla_12h_notified_at` | timestamp | YES | NULL |  |  |  |
| `sla_20h_notified_at` | timestamp | YES | NULL |  |  |  |
| `seller_response_overdue` | tinyint(1) | NO | 0 |  |  |  |
| `updated_at` | timestamp | YES | current_timestamp() |  |  | on update current_timestamp() |

### `dispute_evidence`

| Column | Type | Null | Default | Key | Sensitivity | Notes |
|---|---|---|---|---|---|---|
| `id` | int(11) | NO | NULL | PRI |  | auto_increment |
| `dispute_id` | int(11) | NO | NULL | MUL |  |  |
| `uploaded_by` | int(11) | NO | NULL | MUL |  |  |
| `file_url` | varchar(500) | NO | NULL |  | Government/ID doc |  |
| `uploaded_at` | timestamp | YES | current_timestamp() |  |  |  |

### `dispute_history`

| Column | Type | Null | Default | Key | Sensitivity | Notes |
|---|---|---|---|---|---|---|
| `id` | int(11) | NO | NULL | PRI |  | auto_increment |
| `dispute_id` | int(11) | NO | NULL | MUL |  |  |
| `action` | varchar(50) | NO | NULL |  |  |  |
| `note` | varchar(500) | YES | NULL |  |  |  |
| `actor_id` | int(11) | YES | NULL | MUL |  |  |
| `created_at` | timestamp | YES | current_timestamp() |  |  |  |

### `dispute_messages`

| Column | Type | Null | Default | Key | Sensitivity | Notes |
|---|---|---|---|---|---|---|
| `id` | int(11) | NO | NULL | PRI |  | auto_increment |
| `dispute_id` | int(11) | NO | NULL | MUL |  |  |
| `sender_id` | int(11) | NO | NULL | MUL |  |  |
| `sender_role` | enum('buyer','seller','admin') | NO | NULL |  |  |  |
| `message` | varchar(2000) | NO | NULL |  |  |  |
| `created_at` | timestamp | YES | current_timestamp() |  |  |  |

### `email_delivery_events`

| Column | Type | Null | Default | Key | Sensitivity | Notes |
|---|---|---|---|---|---|---|
| `id` | int(11) | NO | NULL | PRI |  | auto_increment |
| `event_type` | varchar(30) | NO | NULL | MUL |  |  |
| `recipient_email` | varchar(255) | NO | NULL | MUL | Contact PII |  |
| `brevo_message_id` | varchar(255) | YES | NULL |  |  |  |
| `broadcast_id` | int(11) | YES | NULL | MUL |  |  |
| `raw_event` | longtext | YES | NULL |  |  |  |
| `received_at` | timestamp | YES | current_timestamp() |  |  |  |

### `email_outbox`

| Column | Type | Null | Default | Key | Sensitivity | Notes |
|---|---|---|---|---|---|---|
| `id` | int(11) | NO | NULL | PRI |  | auto_increment |
| `to_email` | varchar(255) | NO | NULL |  | Contact PII |  |
| `subject` | varchar(255) | NO | NULL |  |  |  |
| `text_body` | mediumtext | NO | NULL |  |  |  |
| `html_body` | mediumtext | YES | NULL |  |  |  |
| `status` | enum('pending','sent','failed') | NO | 'pending' | MUL |  |  |
| `attempts` | int(11) | NO | 0 |  |  |  |
| `last_error` | varchar(500) | YES | NULL |  |  |  |
| `next_attempt_at` | timestamp | NO | current_timestamp() |  |  |  |
| `created_at` | timestamp | NO | current_timestamp() |  |  |  |
| `sent_at` | timestamp | YES | NULL |  |  |  |

### `messages`

| Column | Type | Null | Default | Key | Sensitivity | Notes |
|---|---|---|---|---|---|---|
| `id` | int(11) | NO | NULL | PRI |  | auto_increment |
| `conversation_id` | int(11) | NO | NULL | MUL |  |  |
| `sender_id` | int(11) | NO | NULL | MUL |  |  |
| `message` | varchar(2000) | NO | '' |  |  |  |
| `attachment_url` | varchar(500) | YES | NULL |  |  |  |
| `attachment_type` | enum('image','video','audio','file') | YES | NULL |  |  |  |
| `attachment_name` | varchar(255) | YES | NULL |  | Personal |  |
| `attachment_size` | int(11) | YES | NULL |  |  |  |
| `is_read` | tinyint(1) | NO | 0 |  |  |  |
| `delivered_at` | timestamp | YES | NULL |  |  |  |
| `read_at` | timestamp | YES | NULL |  |  |  |
| `is_deleted` | tinyint(1) | NO | 0 |  |  |  |
| `deleted_at` | timestamp | YES | NULL |  |  |  |
| `created_at` | timestamp | YES | current_timestamp() |  |  |  |

### `message_reactions`

| Column | Type | Null | Default | Key | Sensitivity | Notes |
|---|---|---|---|---|---|---|
| `id` | int(11) | NO | NULL | PRI |  | auto_increment |
| `message_id` | int(11) | NO | NULL | MUL |  |  |
| `user_id` | int(11) | NO | NULL | MUL |  |  |
| `emoji` | varchar(8) | NO | NULL |  |  |  |
| `created_at` | timestamp | YES | current_timestamp() |  |  |  |

### `notifications`

| Column | Type | Null | Default | Key | Sensitivity | Notes |
|---|---|---|---|---|---|---|
| `id` | int(11) | NO | NULL | PRI |  | auto_increment |
| `user_id` | int(11) | NO | NULL | MUL |  |  |
| `type` | varchar(50) | NO | NULL |  |  |  |
| `title` | varchar(150) | NO | NULL |  |  |  |
| `message` | text | NO | NULL |  |  |  |
| `related_order_id` | int(11) | YES | NULL | MUL |  |  |
| `related_conversation_id` | int(11) | YES | NULL | MUL |  |  |
| `is_read` | tinyint(1) | NO | 0 |  |  |  |
| `created_at` | timestamp | YES | current_timestamp() |  |  |  |

### `reviews`

| Column | Type | Null | Default | Key | Sensitivity | Notes |
|---|---|---|---|---|---|---|
| `id` | int(11) | NO | NULL | PRI |  | auto_increment |
| `product_id` | int(11) | YES | NULL | MUL |  |  |
| `booking_id` | int(11) | YES | NULL | MUL |  |  |
| `buyer_id` | int(11) | NO | NULL | MUL |  |  |
| `rating` | tinyint(4) | NO | NULL |  |  |  |
| `comment` | varchar(1000) | YES | NULL |  |  |  |
| `is_test` | tinyint(1) | NO | 0 | MUL |  |  |
| `seller_reply` | text | YES | NULL |  |  |  |
| `seller_reply_at` | timestamp | YES | NULL |  |  |  |
| `created_at` | timestamp | YES | current_timestamp() |  |  |  |
| `updated_at` | timestamp | YES | current_timestamp() |  |  | on update current_timestamp() |

### `review_photos`

| Column | Type | Null | Default | Key | Sensitivity | Notes |
|---|---|---|---|---|---|---|
| `id` | int(11) | NO | NULL | PRI |  | auto_increment |
| `review_id` | int(11) | NO | NULL | MUL |  |  |
| `photo_url` | varchar(500) | NO | NULL |  | Personal |  |
| `display_order` | int(11) | NO | 0 |  |  |  |
| `created_at` | timestamp | YES | current_timestamp() |  |  |  |

### `support_messages`

| Column | Type | Null | Default | Key | Sensitivity | Notes |
|---|---|---|---|---|---|---|
| `id` | int(11) | NO | NULL | PRI |  | auto_increment |
| `ticket_id` | int(11) | NO | NULL | MUL |  |  |
| `sender_id` | int(11) | YES | NULL | MUL |  |  |
| `sender_role` | enum('user','admin') | NO | NULL |  |  |  |
| `body` | text | NO | NULL |  |  |  |
| `attachment_url` | varchar(500) | YES | NULL |  |  |  |
| `created_at` | timestamp | YES | current_timestamp() |  |  |  |

### `support_tickets`

| Column | Type | Null | Default | Key | Sensitivity | Notes |
|---|---|---|---|---|---|---|
| `id` | int(11) | NO | NULL | PRI |  | auto_increment |
| `user_id` | int(11) | YES | NULL | MUL |  |  |
| `contact_phone` | varchar(30) | YES | NULL |  | Contact PII |  |
| `subject` | varchar(200) | NO | NULL |  |  |  |
| `category` | enum('order','payment','account','product','other') | NO | 'other' |  |  |  |
| `status` | enum('open','pending','resolved','closed') | NO | 'open' | MUL |  |  |
| `created_at` | timestamp | YES | current_timestamp() |  |  |  |
| `updated_at` | timestamp | YES | current_timestamp() |  |  | on update current_timestamp() |

### `whatsapp_sessions`

| Column | Type | Null | Default | Key | Sensitivity | Notes |
|---|---|---|---|---|---|---|
| `phone` | varchar(30) | NO | NULL | PRI | Contact PII |  |
| `state` | varchar(50) | NO | 'idle' |  |  |  |
| `context` | longtext | YES | NULL |  |  |  |
| `updated_at` | timestamp | YES | current_timestamp() |  |  | on update current_timestamp() |

## Monetization & growth

### `affiliate_accounts`

| Column | Type | Null | Default | Key | Sensitivity | Notes |
|---|---|---|---|---|---|---|
| `user_id` | int(11) | NO | NULL | PRI |  |  |
| `code` | varchar(20) | NO | NULL | UNI |  |  |
| `commission_rate` | decimal(5,4) | NO | 0.0500 |  | Financial |  |
| `status` | enum('pending','active','suspended') | NO | 'pending' |  |  |  |
| `created_at` | timestamp | YES | current_timestamp() |  |  |  |

### `affiliate_clicks`

| Column | Type | Null | Default | Key | Sensitivity | Notes |
|---|---|---|---|---|---|---|
| `id` | int(11) | NO | NULL | PRI |  | auto_increment |
| `affiliate_user_id` | int(11) | NO | NULL | MUL |  |  |
| `click_token` | varchar(40) | NO | NULL | UNI | Credential/secret |  |
| `landing_path` | varchar(500) | YES | NULL |  |  |  |
| `created_at` | timestamp | YES | current_timestamp() |  |  |  |

### `affiliate_conversions`

| Column | Type | Null | Default | Key | Sensitivity | Notes |
|---|---|---|---|---|---|---|
| `id` | int(11) | NO | NULL | PRI |  | auto_increment |
| `affiliate_user_id` | int(11) | NO | NULL | MUL |  |  |
| `order_id` | int(11) | NO | NULL | UNI |  |  |
| `commission_amount` | decimal(12,2) | NO | NULL |  | Financial |  |
| `status` | enum('pending','paid','reversed') | NO | 'pending' |  |  |  |
| `created_at` | timestamp | YES | current_timestamp() |  |  |  |
| `paid_at` | timestamp | YES | NULL |  |  |  |
| `click_token` | varchar(64) | YES | NULL |  | Credential/secret |  |

### `affiliate_payouts`

| Column | Type | Null | Default | Key | Sensitivity | Notes |
|---|---|---|---|---|---|---|
| `id` | int(11) | NO | NULL | PRI |  | auto_increment |
| `affiliate_user_id` | int(11) | NO | NULL | MUL |  |  |
| `amount` | decimal(12,2) | NO | NULL |  | Financial |  |
| `payout_method` | enum('mobile_money','bank') | NO | NULL |  | Financial |  |
| `payout_destination` | varchar(255) | NO | NULL |  | Financial |  |
| `status` | enum('requested','paid','rejected') | NO | 'requested' | MUL |  |  |
| `payout_reference` | varchar(120) | YES | NULL |  | Financial |  |
| `admin_note` | varchar(500) | YES | NULL |  |  |  |
| `requested_at` | timestamp | YES | current_timestamp() |  |  |  |
| `resolved_at` | timestamp | YES | NULL |  |  |  |

### `monetization_schedule`

| Column | Type | Null | Default | Key | Sensitivity | Notes |
|---|---|---|---|---|---|---|
| `id` | int(11) | NO | NULL | PRI |  | auto_increment |
| `setting_key` | varchar(64) | NO | NULL |  |  |  |
| `scheduled_value` | tinyint(1) | NO | NULL |  |  |  |
| `scheduled_at` | datetime | NO | NULL | MUL |  |  |
| `applied_at` | datetime | YES | NULL |  |  |  |
| `reminder_3d_sent_at` | datetime | YES | NULL |  |  |  |
| `reminder_1d_sent_at` | datetime | YES | NULL |  |  |  |
| `cancelled_at` | datetime | YES | NULL |  |  |  |
| `created_by` | int(11) | YES | NULL | MUL |  |  |
| `created_at` | timestamp | YES | current_timestamp() |  |  |  |

### `seller_sponsorship_credit_periods`

| Column | Type | Null | Default | Key | Sensitivity | Notes |
|---|---|---|---|---|---|---|
| `id` | int(11) | NO | NULL | PRI |  | auto_increment |
| `seller_id` | int(11) | NO | NULL | MUL |  |  |
| `subscription_id` | int(11) | NO | NULL | UNI |  |  |
| `credits_granted` | int(11) | NO | 0 |  |  |  |
| `credits_used` | int(11) | NO | 0 |  |  |  |
| `period_start` | datetime | NO | NULL |  |  |  |
| `period_end` | datetime | NO | NULL |  |  |  |
| `created_at` | timestamp | YES | current_timestamp() |  |  |  |
| `updated_at` | timestamp | YES | current_timestamp() |  |  | on update current_timestamp() |

### `seller_subscriptions`

| Column | Type | Null | Default | Key | Sensitivity | Notes |
|---|---|---|---|---|---|---|
| `id` | int(11) | NO | NULL | PRI |  | auto_increment |
| `seller_id` | int(11) | NO | NULL | MUL |  |  |
| `plan_id` | int(11) | NO | NULL | MUL |  |  |
| `status` | enum('pending','active','past_due','cancelled','expired') | NO | 'pending' | MUL |  |  |
| `current_period_start` | timestamp | YES | NULL |  |  |  |
| `current_period_end` | timestamp | YES | NULL |  |  |  |
| `auto_renew` | tinyint(1) | NO | 1 |  |  |  |
| `cancelled_at` | timestamp | YES | NULL |  |  |  |
| `expiry_reminder_sent_at` | timestamp | YES | NULL |  |  |  |
| `grace_ends_at` | timestamp | YES | NULL |  |  |  |
| `created_at` | timestamp | YES | current_timestamp() |  |  |  |
| `updated_at` | timestamp | YES | current_timestamp() |  |  | on update current_timestamp() |

### `sponsorship_campaigns`

| Column | Type | Null | Default | Key | Sensitivity | Notes |
|---|---|---|---|---|---|---|
| `id` | int(11) | NO | NULL | PRI |  | auto_increment |
| `seller_id` | int(11) | NO | NULL | MUL |  |  |
| `product_id` | int(11) | NO | NULL | MUL |  |  |
| `daily_rate` | decimal(12,2) | NO | NULL |  |  |  |
| `days` | int(11) | NO | NULL |  |  |  |
| `total_cost` | decimal(12,2) | NO | NULL |  |  |  |
| `credits_used` | int(11) | NO | 0 |  |  |  |
| `status` | enum('active','expired','cancelled') | NO | 'active' | MUL |  |  |
| `starts_at` | timestamp | YES | current_timestamp() |  |  |  |
| `ends_at` | datetime | NO | NULL |  |  |  |
| `created_at` | timestamp | YES | current_timestamp() |  |  |  |
| `refund_amount` | decimal(12,2) | NO | 0.00 |  | Financial |  |
| `credit_days_returned` | int(11) | NO | 0 |  |  |  |
| `cancelled_at` | timestamp | YES | NULL |  |  |  |

### `store_featured_campaigns`

| Column | Type | Null | Default | Key | Sensitivity | Notes |
|---|---|---|---|---|---|---|
| `id` | int(11) | NO | NULL | PRI |  | auto_increment |
| `seller_id` | int(11) | NO | NULL | MUL |  |  |
| `category_id` | int(11) | NO | NULL | MUL |  |  |
| `daily_rate` | decimal(12,2) | NO | NULL |  |  |  |
| `days` | int(11) | NO | NULL |  |  |  |
| `total_cost` | decimal(12,2) | NO | NULL |  |  |  |
| `credits_used` | int(11) | NO | 0 |  |  |  |
| `status` | enum('active','expired','cancelled') | NO | 'active' | MUL |  |  |
| `starts_at` | timestamp | YES | current_timestamp() |  |  |  |
| `ends_at` | datetime | NO | NULL |  |  |  |
| `created_at` | timestamp | YES | current_timestamp() |  |  |  |

### `subscription_plans`

| Column | Type | Null | Default | Key | Sensitivity | Notes |
|---|---|---|---|---|---|---|
| `id` | int(11) | NO | NULL | PRI |  | auto_increment |
| `code` | varchar(30) | NO | NULL | UNI |  |  |
| `name` | varchar(100) | NO | NULL |  | Personal |  |
| `description` | varchar(255) | YES | NULL |  |  |  |
| `price` | decimal(12,2) | NO | 0.00 |  | Financial |  |
| `billing_cycle` | enum('monthly','annual') | NO | 'monthly' |  |  |  |
| `commission_rate_override` | decimal(5,2) | YES | NULL |  | Financial |  |
| `max_active_listings` | int(11) | YES | NULL |  |  |  |
| `sponsorship_credits_per_month` | int(11) | NO | 0 |  |  |  |
| `features` | longtext | YES | NULL |  |  |  |
| `is_active` | tinyint(1) | NO | 1 |  |  |  |
| `sort_order` | int(11) | NO | 0 |  |  |  |
| `created_at` | timestamp | YES | current_timestamp() |  |  |  |
| `updated_at` | timestamp | YES | current_timestamp() |  |  | on update current_timestamp() |
| `audience` | enum('marketplace','business_tools') | NO | 'marketplace' |  |  |  |
| `entitlements` | longtext | YES | NULL |  |  |  |

## Seller stock & POS

### `offline_sales`

| Column | Type | Null | Default | Key | Sensitivity | Notes |
|---|---|---|---|---|---|---|
| `id` | int(11) | NO | NULL | PRI |  | auto_increment |
| `seller_id` | int(11) | NO | NULL | MUL |  |  |
| `product_id` | int(11) | NO | NULL | MUL |  |  |
| `variant_id` | int(11) | YES | NULL | MUL |  |  |
| `product_name` | varchar(200) | NO | NULL |  | Personal |  |
| `variant_label` | varchar(255) | YES | NULL |  |  |  |
| `quantity` | int(11) | NO | NULL |  |  |  |
| `unit_price` | decimal(12,2) | NO | NULL |  | Financial |  |
| `total_amount` | decimal(12,2) | NO | NULL |  | Financial |  |
| `payment_method` | enum('cash','mobile_money','card','bank_transfer','other') | NO | 'cash' |  |  |  |
| `customer_name` | varchar(120) | YES | NULL |  | Personal |  |
| `note` | varchar(255) | YES | NULL |  |  |  |
| `sold_at` | datetime | NO | NULL |  |  |  |
| `created_at` | timestamp | YES | current_timestamp() |  |  |  |

### `purchases`

| Column | Type | Null | Default | Key | Sensitivity | Notes |
|---|---|---|---|---|---|---|
| `id` | bigint(20) | NO | NULL | PRI |  | auto_increment |
| `seller_id` | int(11) | NO | NULL | MUL |  |  |
| `purchase_no` | varchar(20) | NO | NULL |  |  |  |
| `supplier_id` | int(11) | YES | NULL | MUL |  |  |
| `supplier_name` | varchar(120) | YES | NULL |  | Personal |  |
| `invoice_no` | varchar(60) | YES | NULL |  |  |  |
| `currency` | char(3) | NO | 'TZS' |  |  |  |
| `total_amount` | decimal(14,2) | NO | NULL |  | Financial |  |
| `paid_amount` | decimal(14,2) | NO | 0.00 |  | Financial |  |
| `note` | varchar(255) | YES | NULL |  |  |  |
| `purchased_at` | datetime | NO | NULL |  |  |  |
| `is_backdated` | tinyint(1) | NO | 0 |  |  |  |
| `idempotency_key` | varchar(64) | YES | NULL |  |  |  |
| `payload_hash` | char(64) | YES | NULL |  | Credential/secret |  |
| `created_by` | int(11) | YES | NULL |  |  |  |
| `created_at` | timestamp | YES | current_timestamp() |  |  |  |

### `purchase_lines`

| Column | Type | Null | Default | Key | Sensitivity | Notes |
|---|---|---|---|---|---|---|
| `id` | bigint(20) | NO | NULL | PRI |  | auto_increment |
| `purchase_id` | bigint(20) | NO | NULL | MUL |  |  |
| `seller_id` | int(11) | NO | NULL |  |  |  |
| `stock_item_id` | int(11) | NO | NULL | MUL |  |  |
| `item_name` | varchar(200) | NO | NULL |  | Personal |  |
| `quantity` | int(11) | NO | NULL |  |  |  |
| `unit_cost` | decimal(12,2) | NO | NULL |  |  |  |
| `line_total` | decimal(14,2) | NO | NULL |  |  |  |

### `sales`

| Column | Type | Null | Default | Key | Sensitivity | Notes |
|---|---|---|---|---|---|---|
| `id` | bigint(20) | NO | NULL | PRI |  | auto_increment |
| `seller_id` | int(11) | NO | NULL | MUL |  |  |
| `receipt_no` | varchar(20) | NO | NULL |  |  |  |
| `source` | enum('pos','legacy') | NO | 'pos' |  |  |  |
| `customer_id` | int(11) | YES | NULL | MUL |  |  |
| `customer_name` | varchar(120) | YES | NULL |  | Personal |  |
| `currency` | char(3) | NO | 'TZS' |  |  |  |
| `subtotal` | decimal(14,2) | NO | NULL |  |  |  |
| `discount_amount` | decimal(14,2) | NO | 0.00 |  | Financial |  |
| `total_amount` | decimal(14,2) | NO | NULL |  | Financial |  |
| `paid_amount` | decimal(14,2) | NO | 0.00 |  | Financial |  |
| `returned_amount` | decimal(14,2) | NO | 0.00 |  | Financial |  |
| `payment_method` | enum('cash','mobile_money','card','bank_transfer','credit','other') | NO | 'cash' |  |  |  |
| `note` | varchar(255) | YES | NULL |  |  |  |
| `sold_at` | datetime | NO | NULL |  |  |  |
| `is_backdated` | tinyint(1) | NO | 0 |  |  |  |
| `voided_at` | datetime | YES | NULL |  |  |  |
| `voided_by` | int(11) | YES | NULL |  |  |  |
| `void_reason` | varchar(255) | YES | NULL |  |  |  |
| `legacy_offline_sale_id` | int(11) | YES | NULL | UNI |  |  |
| `idempotency_key` | varchar(64) | YES | NULL |  |  |  |
| `payload_hash` | char(64) | YES | NULL |  | Credential/secret |  |
| `created_by` | int(11) | YES | NULL |  |  |  |
| `created_at` | timestamp | YES | current_timestamp() |  |  |  |
| `is_offline` | tinyint(1) | NO | 0 |  |  |  |
| `stock_flagged` | tinyint(1) | NO | 0 |  |  |  |
| `client_created_at` | timestamp | YES | NULL |  |  |  |

### `sale_lines`

| Column | Type | Null | Default | Key | Sensitivity | Notes |
|---|---|---|---|---|---|---|
| `id` | bigint(20) | NO | NULL | PRI |  | auto_increment |
| `sale_id` | bigint(20) | NO | NULL | MUL |  |  |
| `seller_id` | int(11) | NO | NULL | MUL |  |  |
| `stock_item_id` | int(11) | YES | NULL | MUL |  |  |
| `item_name` | varchar(200) | NO | NULL |  | Personal |  |
| `variant_label` | varchar(255) | YES | NULL |  |  |  |
| `item_source` | enum('nexora','external') | NO | 'external' |  |  |  |
| `quantity` | int(11) | NO | NULL |  |  |  |
| `returned_quantity` | int(11) | NO | 0 |  |  |  |
| `unit_price` | decimal(12,2) | NO | NULL |  | Financial |  |
| `unit_cost` | decimal(12,2) | YES | NULL |  |  |  |
| `line_total` | decimal(14,2) | NO | NULL |  |  |  |

### `sale_returns`

| Column | Type | Null | Default | Key | Sensitivity | Notes |
|---|---|---|---|---|---|---|
| `id` | bigint(20) | NO | NULL | PRI |  | auto_increment |
| `seller_id` | int(11) | NO | NULL | MUL |  |  |
| `sale_id` | bigint(20) | NO | NULL | MUL |  |  |
| `return_amount` | decimal(14,2) | NO | NULL |  | Financial |  |
| `refund_amount` | decimal(14,2) | NO | 0.00 |  | Financial |  |
| `credit_amount` | decimal(14,2) | NO | 0.00 |  | Financial |  |
| `reason` | varchar(255) | YES | NULL |  |  |  |
| `idempotency_key` | varchar(64) | YES | NULL |  |  |  |
| `payload_hash` | char(64) | YES | NULL |  | Credential/secret |  |
| `created_by` | int(11) | YES | NULL |  |  |  |
| `created_at` | timestamp | YES | current_timestamp() |  |  |  |

### `sale_return_lines`

| Column | Type | Null | Default | Key | Sensitivity | Notes |
|---|---|---|---|---|---|---|
| `id` | bigint(20) | NO | NULL | PRI |  | auto_increment |
| `return_id` | bigint(20) | NO | NULL | MUL |  |  |
| `sale_line_id` | bigint(20) | NO | NULL | MUL |  |  |
| `quantity` | int(11) | NO | NULL |  |  |  |
| `amount` | decimal(14,2) | NO | NULL |  | Financial |  |

### `stock_adjustments`

| Column | Type | Null | Default | Key | Sensitivity | Notes |
|---|---|---|---|---|---|---|
| `id` | int(11) | NO | NULL | PRI |  | auto_increment |
| `seller_id` | int(11) | NO | NULL | MUL |  |  |
| `product_id` | int(11) | NO | NULL | MUL |  |  |
| `variant_id` | int(11) | YES | NULL | MUL |  |  |
| `type` | enum('restock','correction','offline_sale') | NO | NULL |  |  |  |
| `quantity_change` | int(11) | NO | NULL |  |  |  |
| `stock_before` | int(11) | NO | NULL |  |  |  |
| `stock_after` | int(11) | NO | NULL |  |  |  |
| `reason` | varchar(255) | YES | NULL |  |  |  |
| `offline_sale_id` | int(11) | YES | NULL | MUL |  |  |
| `idempotency_key` | varchar(64) | YES | NULL |  |  |  |
| `created_at` | timestamp | YES | current_timestamp() |  |  |  |
| `payload_hash` | char(64) | YES | NULL |  | Credential/secret |  |

### `stock_counters`

| Column | Type | Null | Default | Key | Sensitivity | Notes |
|---|---|---|---|---|---|---|
| `seller_id` | int(11) | NO | NULL | PRI |  |  |
| `kind` | varchar(20) | NO | NULL | PRI |  |  |
| `counter_value` | int(11) | NO | 0 |  |  |  |

### `stock_customers`

| Column | Type | Null | Default | Key | Sensitivity | Notes |
|---|---|---|---|---|---|---|
| `id` | int(11) | NO | NULL | PRI |  | auto_increment |
| `seller_id` | int(11) | NO | NULL | MUL |  |  |
| `name` | varchar(120) | NO | NULL |  | Personal |  |
| `phone` | varchar(30) | YES | NULL |  | Contact PII |  |
| `note` | varchar(255) | YES | NULL |  |  |  |
| `is_archived` | tinyint(1) | NO | 0 |  |  |  |
| `created_at` | timestamp | YES | current_timestamp() |  |  |  |
| `updated_at` | timestamp | YES | current_timestamp() |  |  | on update current_timestamp() |

### `stock_expenses`

| Column | Type | Null | Default | Key | Sensitivity | Notes |
|---|---|---|---|---|---|---|
| `id` | bigint(20) | NO | NULL | PRI |  | auto_increment |
| `seller_id` | int(11) | NO | NULL | MUL |  |  |
| `category` | varchar(30) | NO | NULL |  |  |  |
| `amount` | decimal(12,2) | NO | NULL |  | Financial |  |
| `expense_date` | date | NO | NULL |  |  |  |
| `note` | varchar(255) | YES | NULL |  |  |  |
| `receipt_url` | varchar(500) | YES | NULL |  |  |  |
| `receipt_public_id` | varchar(255) | YES | NULL |  |  |  |
| `idempotency_key` | varchar(64) | YES | NULL |  |  |  |
| `payload_hash` | char(64) | YES | NULL |  | Credential/secret |  |
| `voided_at` | timestamp | YES | NULL |  |  |  |
| `void_reason` | varchar(255) | YES | NULL |  |  |  |
| `created_by` | int(11) | YES | NULL |  |  |  |
| `created_at` | timestamp | YES | current_timestamp() |  |  |  |
| `updated_at` | timestamp | YES | current_timestamp() |  |  | on update current_timestamp() |

### `stock_items`

| Column | Type | Null | Default | Key | Sensitivity | Notes |
|---|---|---|---|---|---|---|
| `id` | int(11) | NO | NULL | PRI |  | auto_increment |
| `seller_id` | int(11) | NO | NULL | MUL |  |  |
| `product_id` | int(11) | YES | NULL | MUL |  |  |
| `variant_id` | int(11) | YES | NULL | MUL |  |  |
| `link_key` | varchar(40) | YES | NULL | UNI |  |  |
| `legacy_product_id` | int(11) | YES | NULL | UNI |  |  |
| `source` | enum('nexora','external') | NO | 'external' |  |  |  |
| `name` | varchar(200) | NO | NULL |  | Personal |  |
| `sku` | varchar(64) | YES | NULL |  |  |  |
| `barcode` | varchar(64) | YES | NULL |  |  |  |
| `unit` | varchar(20) | NO | 'pcs' |  |  |  |
| `cost_price` | decimal(12,2) | YES | NULL |  | Financial |  |
| `sell_price` | decimal(12,2) | NO | 0.00 |  | Financial |  |
| `reorder_level` | int(11) | NO | 5 |  |  |  |
| `stock` | int(11) | NO | 0 |  |  |  |
| `is_archived` | tinyint(1) | NO | 0 |  |  |  |
| `created_at` | timestamp | YES | current_timestamp() |  |  |  |
| `updated_at` | timestamp | YES | current_timestamp() |  |  | on update current_timestamp() |

### `stock_low_alert_state`

| Column | Type | Null | Default | Key | Sensitivity | Notes |
|---|---|---|---|---|---|---|
| `stock_item_id` | int(11) | NO | NULL | PRI |  |  |
| `seller_id` | int(11) | NO | NULL | MUL |  |  |
| `stock_at_alert` | int(11) | NO | NULL |  |  |  |
| `alerted_at` | timestamp | YES | current_timestamp() |  |  |  |

### `stock_movements`

| Column | Type | Null | Default | Key | Sensitivity | Notes |
|---|---|---|---|---|---|---|
| `id` | bigint(20) | NO | NULL | PRI |  | auto_increment |
| `seller_id` | int(11) | NO | NULL | MUL |  |  |
| `stock_item_id` | int(11) | NO | NULL | MUL |  |  |
| `type` | enum('purchase','sale','order_deduct','order_restore','return','void','correction','opening') | NO | NULL |  |  |  |
| `quantity_change` | int(11) | NO | NULL |  |  |  |
| `stock_before` | int(11) | NO | NULL |  |  |  |
| `stock_after` | int(11) | NO | NULL |  |  |  |
| `unit_cost` | decimal(12,2) | YES | NULL |  |  |  |
| `ref_type` | varchar(30) | YES | NULL | MUL |  |  |
| `ref_id` | bigint(20) | YES | NULL |  |  |  |
| `reason` | varchar(255) | YES | NULL |  |  |  |
| `idempotency_key` | varchar(64) | YES | NULL |  |  |  |
| `payload_hash` | char(64) | YES | NULL |  | Credential/secret |  |
| `created_by` | int(11) | YES | NULL |  |  |  |
| `created_at` | timestamp | YES | current_timestamp() |  |  |  |

### `stock_payments`

| Column | Type | Null | Default | Key | Sensitivity | Notes |
|---|---|---|---|---|---|---|
| `id` | bigint(20) | NO | NULL | PRI |  | auto_increment |
| `seller_id` | int(11) | NO | NULL | MUL |  |  |
| `direction` | enum('in','out') | NO | NULL |  |  |  |
| `amount` | decimal(14,2) | NO | NULL |  | Financial |  |
| `method` | enum('cash','mobile_money','card','bank_transfer','other') | NO | 'cash' |  |  |  |
| `sale_id` | bigint(20) | YES | NULL | MUL |  |  |
| `customer_id` | int(11) | YES | NULL |  |  |  |
| `purchase_id` | bigint(20) | YES | NULL | MUL |  |  |
| `supplier_id` | int(11) | YES | NULL |  |  |  |
| `kind` | enum('sale','debt_payment','refund','void_refund','purchase_payment') | NO | NULL |  |  |  |
| `note` | varchar(255) | YES | NULL |  |  |  |
| `batch_key` | varchar(64) | YES | NULL |  |  |  |
| `payload_hash` | char(64) | YES | NULL |  | Credential/secret |  |
| `paid_at` | datetime | NO | NULL |  |  |  |
| `created_by` | int(11) | YES | NULL |  |  |  |
| `created_at` | timestamp | YES | current_timestamp() |  |  |  |

### `stock_suppliers`

| Column | Type | Null | Default | Key | Sensitivity | Notes |
|---|---|---|---|---|---|---|
| `id` | int(11) | NO | NULL | PRI |  | auto_increment |
| `seller_id` | int(11) | NO | NULL | MUL |  |  |
| `name` | varchar(120) | NO | NULL |  | Personal |  |
| `phone` | varchar(30) | YES | NULL |  | Contact PII |  |
| `note` | varchar(255) | YES | NULL |  |  |  |
| `is_archived` | tinyint(1) | NO | 0 |  |  |  |
| `created_at` | timestamp | YES | current_timestamp() |  |  |  |
| `updated_at` | timestamp | YES | current_timestamp() |  |  | on update current_timestamp() |

## Platform, AI & observability

### `ai_call_outcomes`

| Column | Type | Null | Default | Key | Sensitivity | Notes |
|---|---|---|---|---|---|---|
| `id` | int(11) | NO | NULL | PRI |  | auto_increment |
| `feature` | varchar(40) | NO | NULL | MUL |  |  |
| `outcome` | varchar(30) | NO | NULL |  |  |  |
| `created_at` | timestamp | YES | current_timestamp() |  |  |  |

### `ai_usage_log`

| Column | Type | Null | Default | Key | Sensitivity | Notes |
|---|---|---|---|---|---|---|
| `id` | int(11) | NO | NULL | PRI |  | auto_increment |
| `user_id` | int(11) | YES | NULL | MUL |  |  |
| `feature` | varchar(40) | NO | NULL |  |  |  |
| `tokens_used` | int(11) | NO | 0 |  | Credential/secret |  |
| `created_at` | timestamp | YES | current_timestamp() | MUL |  |  |

### `audit_logs`

| Column | Type | Null | Default | Key | Sensitivity | Notes |
|---|---|---|---|---|---|---|
| `id` | int(11) | NO | NULL | PRI |  | auto_increment |
| `user_id` | int(11) | YES | NULL | MUL |  |  |
| `event_type` | varchar(50) | NO | NULL | MUL |  |  |
| `description` | varchar(255) | YES | NULL |  |  |  |
| `ip_address` | varchar(45) | YES | NULL |  | Contact PII |  |
| `metadata` | longtext | YES | NULL |  |  |  |
| `created_at` | timestamp | YES | current_timestamp() | MUL |  |  |

### `fraud_flags`

| Column | Type | Null | Default | Key | Sensitivity | Notes |
|---|---|---|---|---|---|---|
| `id` | int(11) | NO | NULL | PRI |  | auto_increment |
| `entity_type` | enum('order','seller') | NO | NULL | MUL |  |  |
| `entity_id` | int(11) | NO | NULL |  |  |  |
| `rule_code` | varchar(50) | NO | NULL |  |  |  |
| `reason` | varchar(255) | NO | NULL |  |  |  |
| `severity` | enum('low','medium','high') | NO | 'medium' |  |  |  |
| `status` | enum('open','dismissed','confirmed') | NO | 'open' | MUL |  |  |
| `resolved_by` | int(11) | YES | NULL | MUL |  |  |
| `resolved_at` | timestamp | YES | NULL |  |  |  |
| `created_at` | timestamp | YES | current_timestamp() |  |  |  |

### `platform_modules`

| Column | Type | Null | Default | Key | Sensitivity | Notes |
|---|---|---|---|---|---|---|
| `id` | int(11) | NO | NULL | PRI |  | auto_increment |
| `module_key` | varchar(50) | NO | NULL | UNI |  |  |
| `name` | varchar(100) | NO | NULL |  | Personal |  |
| `description` | varchar(255) | YES | NULL |  |  |  |
| `is_active` | tinyint(1) | NO | 1 |  |  |  |
| `maintenance_message` | varchar(255) | YES | NULL |  |  |  |
| `updated_by` | int(11) | YES | NULL | MUL |  |  |
| `created_at` | timestamp | YES | current_timestamp() |  |  |  |
| `updated_at` | timestamp | YES | current_timestamp() |  |  | on update current_timestamp() |

### `platform_settings`

| Column | Type | Null | Default | Key | Sensitivity | Notes |
|---|---|---|---|---|---|---|
| `setting_key` | varchar(100) | NO | NULL | PRI |  |  |
| `setting_value` | text | NO | NULL |  |  |  |
| `updated_at` | timestamp | YES | current_timestamp() |  |  | on update current_timestamp() |

### `platform_setting_history`

| Column | Type | Null | Default | Key | Sensitivity | Notes |
|---|---|---|---|---|---|---|
| `id` | int(11) | NO | NULL | PRI |  | auto_increment |
| `setting_key` | varchar(100) | NO | NULL | MUL |  |  |
| `old_value` | text | YES | NULL |  |  |  |
| `new_value` | text | YES | NULL |  |  |  |
| `changed_by` | int(11) | YES | NULL | MUL |  |  |
| `changed_at` | timestamp | YES | current_timestamp() |  |  |  |

### `status_incidents`

| Column | Type | Null | Default | Key | Sensitivity | Notes |
|---|---|---|---|---|---|---|
| `id` | int(11) | NO | NULL | PRI |  | auto_increment |
| `title` | varchar(150) | NO | NULL |  |  |  |
| `component` | enum('platform','payments','orders','bookings','delivery','notifications') | NO | 'platform' |  |  |  |
| `severity` | enum('minor','major','critical') | NO | 'minor' |  |  |  |
| `status` | enum('investigating','identified','monitoring','resolved') | NO | 'investigating' | MUL |  |  |
| `message` | text | NO | NULL |  |  |  |
| `started_at` | timestamp | NO | current_timestamp() |  |  |  |
| `resolved_at` | timestamp | YES | NULL |  |  |  |
| `created_by` | int(11) | YES | NULL | MUL |  |  |
| `created_at` | timestamp | YES | current_timestamp() |  |  |  |
| `updated_at` | timestamp | YES | current_timestamp() |  |  | on update current_timestamp() |

### `status_subscribers`

| Column | Type | Null | Default | Key | Sensitivity | Notes |
|---|---|---|---|---|---|---|
| `id` | int(11) | NO | NULL | PRI |  | auto_increment |
| `email` | varchar(255) | NO | NULL | UNI | Contact PII |  |
| `unsubscribe_token` | char(48) | NO | NULL | UNI | Credential/secret |  |
| `created_at` | timestamp | NO | current_timestamp() |  |  |  |

### `web_vitals_samples`

| Column | Type | Null | Default | Key | Sensitivity | Notes |
|---|---|---|---|---|---|---|
| `id` | bigint(20) | NO | NULL | PRI |  | auto_increment |
| `metric` | enum('LCP','CLS','INP','FCP','TTFB') | NO | NULL | MUL |  |  |
| `value` | double | NO | NULL |  |  |  |
| `rating` | enum('good','needs-improvement','poor') | NO | NULL |  |  |  |
| `route` | varchar(120) | NO | NULL | MUL |  |  |
| `device` | enum('mobile','desktop') | NO | 'desktop' |  |  |  |
| `created_at` | timestamp | NO | current_timestamp() |  |  |  |
