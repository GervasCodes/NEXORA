-- Migration 100: Phase 10 (UI/UX remediation) - notification preferences
-- Run after 099_live_selling_reminders.sql.
--
-- Four boolean columns on users, same shape as the existing
-- whatsapp_order_updates/data_saver_enabled columns this table already
-- has, rather than a separate preferences table - there are only four
-- toggles and they're read on every single notify() call (see
-- notification.service.js), so keeping them on the same row already
-- being read for email/phone/language avoids an extra join on the
-- highest-frequency read path in the notification system.
--
-- All default TRUE (opt-out, not opt-in) so nobody's notification
-- behavior changes the moment this migration runs - a buyer has to
-- actively turn something off.
--
-- Deliberately does NOT cover every notification type in the app -
-- only the four categories a buyer would recognize and want to
-- silence (order updates, chat messages, price/stock alerts, store
-- follows/live selling). Account, security, financial (wallet/
-- withdrawal), fraud, KYC, and admin/compliance notifications are not
-- gated by any of these and always fire regardless - see
-- notification.service.js's category mapping for the exact type-list
-- boundary.
ALTER TABLE users
    ADD COLUMN notify_order_updates TINYINT(1) NOT NULL DEFAULT 1 AFTER whatsapp_order_updates,
    ADD COLUMN notify_messages TINYINT(1) NOT NULL DEFAULT 1 AFTER notify_order_updates,
    ADD COLUMN notify_price_stock_alerts TINYINT(1) NOT NULL DEFAULT 1 AFTER notify_messages,
    ADD COLUMN notify_store_updates TINYINT(1) NOT NULL DEFAULT 1 AFTER notify_price_stock_alerts;
