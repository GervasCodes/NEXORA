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
