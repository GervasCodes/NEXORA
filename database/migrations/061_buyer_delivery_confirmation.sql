-- Migration 061: buyer delivery confirmation (Phase 2 of the Order &
-- Payment / COD upgrade).
--
-- Until now, `orders.status` moving to 'delivered' was entirely
-- seller/agent-driven (order.service.js#updateOrderStatusBySeller,
-- delivery.service.js's own delivery-status transitions) - there was no
-- point where the buyer themselves confirmed they actually received the
-- item. For Cash on Delivery specifically, that meant a seller could
-- mark an order "delivered" and then self-report the cash as collected
-- (payment.service.js#confirmCashOnDelivery, seller-callable) with no
-- buyer involvement at all.
--
-- `status` keeps its existing meaning ("physically handed off" -
-- unchanged, still read by the escrow release job and the order
-- timeline). `buyer_confirmed_at` is the new, separate signal: set only
-- when the buyer themselves confirms receipt via the new
-- POST /orders/:orderId/confirm-receipt endpoint
-- (payment.service.js#confirmDeliveryReceipt). For Cash on Delivery
-- orders, that same buyer action is now what finalizes the payment
-- (previously confirm-cod did this unilaterally on the seller's say-so).
-- For every other payment method, payment is already confirmed via the
-- provider webhook (see Phase 1) - buyer_confirmed_at there is just a
-- "buyer says they got it" record, no payment side effect.

ALTER TABLE orders
    ADD COLUMN buyer_confirmed_at TIMESTAMP NULL AFTER status;
