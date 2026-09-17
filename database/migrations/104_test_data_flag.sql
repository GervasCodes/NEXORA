-- Migration 104: `is_test` flag on transactional data + clear-data tooling support
-- Run after 103_notification_conversation_reference.sql.
--
-- Background: revenue/analytics figures on the admin dashboard are skewed
-- by seed and demo data created while the platform was being built, with
-- no way to tell it apart from real activity. This flag is the "tell them
-- apart" half; the per-seller and full-platform reset endpoints
-- (backend/src/modules/dataReset/) are the "remove it" half.
--
-- Scope, per the Phase 1 decision gate: orders, wallets, reviews, chats,
-- disputes and returns. Only the *root* row of each of those trees carries
-- the flag - everything hanging off an order (order_items, payments,
-- deliveries, efd_receipts, ...), off a review (review_photos), off a
-- conversation (messages, reactions), off a dispute (evidence, history,
-- messages) or off a return (return_evidence, history) is reached through
-- its parent, so duplicating the flag onto those would only create a way
-- for the two to disagree.
--
-- Default FALSE means every row that already exists is treated as real
-- data: the flag can only ever be set deliberately (by the seeders, or by
-- an admin marking an account's activity as test), never assumed.
--
-- NOTE ON DELETION: the reset tooling built on this flag performs a HARD
-- delete, not a soft delete/archive. There is no undo and no recovery path
-- short of a database backup restore. That is a deliberate decision - see
-- PHASE1_DECISIONS.md section 1.

ALTER TABLE orders
    ADD COLUMN is_test BOOLEAN NOT NULL DEFAULT FALSE AFTER total_amount;

ALTER TABLE reviews
    ADD COLUMN is_test BOOLEAN NOT NULL DEFAULT FALSE AFTER comment;

ALTER TABLE conversations
    ADD COLUMN is_test BOOLEAN NOT NULL DEFAULT FALSE AFTER product_id;

ALTER TABLE disputes
    ADD COLUMN is_test BOOLEAN NOT NULL DEFAULT FALSE AFTER status;

ALTER TABLE order_returns
    ADD COLUMN is_test BOOLEAN NOT NULL DEFAULT FALSE AFTER status;

ALTER TABLE wallet_transactions
    ADD COLUMN is_test BOOLEAN NOT NULL DEFAULT FALSE AFTER description;

ALTER TABLE buyer_wallet_transactions
    ADD COLUMN is_test BOOLEAN NOT NULL DEFAULT FALSE AFTER description;

-- Indexed because the only queries that ever read this column are the
-- reset preview/execute paths, which filter on it across the whole table
-- (`WHERE is_test = TRUE`) - the exact case a plain secondary index on a
-- low-cardinality-but-heavily-skewed column is good at, since real data
-- should vastly outnumber test data and the index makes the small side
-- cheap to find.
CREATE INDEX idx_orders_is_test ON orders(is_test);
CREATE INDEX idx_reviews_is_test ON reviews(is_test);
CREATE INDEX idx_conversations_is_test ON conversations(is_test);
CREATE INDEX idx_disputes_is_test ON disputes(is_test);
CREATE INDEX idx_order_returns_is_test ON order_returns(is_test);
CREATE INDEX idx_wallet_transactions_is_test ON wallet_transactions(is_test);
CREATE INDEX idx_buyer_wallet_transactions_is_test ON buyer_wallet_transactions(is_test);
