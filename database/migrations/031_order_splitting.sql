-- Migration 031: Order splitting for multi-vendor carts
-- Run after 030_snippe_payment_gateway.sql.
--
-- When a buyer's cart contains items from more than one seller, checkout
-- now creates one "parent" order (buyer-facing - holds payment, shipping
-- info, and the combined total) plus one "child" order per vendor (holds
-- only that vendor's items and has its own independent status/delivery).
-- Single-vendor carts still create a single standalone order exactly as
-- before - parent_order_id stays NULL and is_parent stays FALSE for
-- those, so the existing single-vendor path is unchanged in shape.
--
-- A parent order has is_parent = TRUE and never has order_items rows or a
-- deliveries row of its own - all items and deliveries live on its child
-- orders. A child order has parent_order_id pointing back at its parent
-- and otherwise behaves exactly like a normal order (own status, own
-- delivery, own order_items) - seller queries, delivery matching, COD
-- confirmation, and seller-driven status transitions all already scope
-- by order_id/seller_id and need no changes to work with child orders.

ALTER TABLE orders
    ADD COLUMN parent_order_id INT NULL AFTER buyer_id,
    ADD COLUMN is_parent BOOLEAN NOT NULL DEFAULT FALSE AFTER parent_order_id;

ALTER TABLE orders
    ADD CONSTRAINT fk_orders_parent
        FOREIGN KEY (parent_order_id) REFERENCES orders(id)
        ON DELETE CASCADE;

CREATE INDEX idx_orders_parent_order_id ON orders(parent_order_id);
