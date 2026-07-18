# NEXORA — Touched Files (Delete Chat + Footer Glassmorphism)

## 1. Delete entire chat (removes it from the Messages list)
Previously the chat module only supported "clear chat" (hides message
history for you, but the thread stays in your list) and "delete message"
(delete-for-everyone, sender only). There was no way to remove an entire
conversation from the Messages list.

**New behavior:** each conversation can now be deleted per-user. Deleting
a chat hides it from *your* Messages list and clears its history for you
— the other participant's copy is completely untouched. If they send you
a new message later, the thread reappears in your list (same pattern as
WhatsApp/Telegram), so nothing is ever permanently lost.

Files changed:
- `database/migrations/025_conversation_delete_from_list.sql` — adds
  `buyer_deleted_at` / `seller_deleted_at` / `agent_deleted_at` columns to
  `conversations`.
- `backend/src/modules/chat/chat.repository.js` — `deletedColumnFor()`
  helper, `setDeletedAt()`, and `findConversationsByUser()` now excludes
  conversations the requesting user deleted (unless revived by a newer
  message).
- `backend/src/modules/chat/chat.service.js` — new `deleteConversation()`.
- `backend/src/modules/chat/chat.controller.js` — new
  `deleteConversation` controller action.
- `backend/src/modules/chat/chat.routes.js` — new route:
  `DELETE /api/v1/chat/conversations/:id`.
- `frontend/src/pages/Messages.jsx` — hover "Delete" action + inline
  confirm on each conversation row; removes it from the list immediately
  on success.
- `frontend/src/pages/ConversationThread.jsx` — "Delete chat" action next
  to "Clear chat" in the thread header; navigates back to `/messages` on
  success.

**Migration required:** run `node database/migrate.js` before deploying
this build so the new columns exist.

## 2. Footer glassmorphism
- `frontend/src/components/Footer.jsx` — swapped the flat
  `bg-abyss` background for the project's existing `glass-dark` utility
  class (already used on the Header, sidebars, and modals), so the footer
  now gets the same frosted, translucent glass treatment — blur, saturation,
  soft border and shadow — as the rest of the app instead of a plain solid
  panel. No new CSS was needed since `glass-dark` was already defined in
  `frontend/src/index.css`.

## 3. Order Splitting (Phase 3): multi-vendor carts → parent + vendor child orders

Previously a cart with items from more than one seller became a single
order row with mixed `seller_id` line items. That worked for browsing,
but broke down for fulfillment: `orders.status` was one shared value (one
seller marking "shipped" flipped the whole order, other vendors'
items included), and `deliveries.order_id` is unique per order, so only
one seller could ever get a delivery assigned to that order at all.

**New behavior:** checkout groups the cart by `seller_id`. A single-vendor
cart still creates one standalone order, unchanged. A multi-vendor cart
creates one **parent order** (payment, shipping address, combined total -
what the buyer sees as "the order") plus one **child order per vendor**
(`{parent_number}-V1`, `-V2`, ...), each with its own items, own status,
and own delivery. Buyer's order list shows one row per cart (parent or
standalone); the parent's detail page lists each vendor's sub-order with
its own status, linking through to that child order's own detail/tracking
page. Paying once on the parent cascades `payment_status = paid` to every
child (and credits each seller) once the payment webhook confirms;
Cash on Delivery is unaffected since it was already confirmed per order
by the seller who owns it, and each child order now has exactly one
seller.

Files changed:
- `database/migrations/031_order_splitting.sql` — new: `orders.parent_order_id`
  (FK, nullable, `ON DELETE CASCADE`) and `orders.is_parent`.
- `backend/src/modules/order/order.repository.js` — refactored order-row/
  item-insert into shared helpers; new `createSplitOrder()`; new
  `findChildOrders()`, `updatePaymentStatusForChildren()`;
  `findOrdersByBuyer()` now returns only top-level orders (`parent_order_id
  IS NULL`) plus `vendor_count`; `findStalePendingMobileMoneyOrders()`
  excludes child orders (they follow their parent, not cancelled on
  their own).
- `backend/src/modules/order/order.service.js` — `checkout()` groups the
  cart by seller and branches to `createOrder`/`createSplitOrder`;
  `getOrderDetail()` returns `{ ...parent, children: [...] }` for split
  orders; `cancelOrder()` cascades to all child orders (and refuses to
  cancel a single child directly); `autoCancelStaleOrder()` cascades to
  children too.
- `backend/src/modules/payment/payment.service.js` —
  `_handleOrderPaymentWebhook()` now cascades `payment_status = paid` and
  per-seller wallet crediting to every child order when the paid order is
  a parent.
- `backend/src/modules/admin/admin.repository.js` — `findAllOrders()`,
  `getDashboardStats()`, `getDailySales()` now scope to `parent_order_id
  IS NULL` so a split cart's total isn't counted twice (once on the
  parent, once summed across its children).
- `backend/src/modules/fraud/fraud.repository.js` —
  `getBuyerPriorOrderStats()` / `countRecentOrdersByBuyer()` scope to
  `parent_order_id IS NULL` for the same double-counting reason (a
  3-vendor checkout is one order, not four, for velocity/first-order
  fraud checks).
- `frontend/src/pages/Orders.jsx` — split orders show a "N vendors" badge
  instead of a single status pill.
- `frontend/src/pages/OrderDetail.jsx` — parent orders render a per-vendor
  breakdown (each linking to that child's own detail/tracking page)
  instead of a single item list/timeline; payment-retry and cancel
  actions are hidden when viewing a child order directly (handled on the
  parent instead); delivery tracking is only fetched for non-parent
  orders.

No changes were needed to checkout's frontend page, seller order
endpoints, delivery matching/assignment, or COD confirmation - child
orders are ordinary orders with a single seller, so all of that code
already worked unchanged.

**Migration required:** run `node database/migrate.js` before deploying
this build.
