const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");

const chatService = require("../modules/chat/chat.service");
const authRepository = require("../modules/auth/auth.repository");

let io = null;

// Other modules (chat.service) call this to broadcast a saved message
// to everyone currently in that conversation's room.
exports.emitNewMessage = (conversationId, payload) => {
    if (!io) return;
    io.to(`conversation:${conversationId}`).emit("new_message", payload);
};

// Broadcasts a "delete-for-everyone" tombstone to a conversation's room -
// see chat.service.js's deleteMessage. This was missing entirely until
// now, so a deletion never reached the other participant live; they'd
// only see it after reloading the thread (findMessages already filters/
// tombstones is_deleted rows server-side either way, so nothing was ever
// shown that shouldn't have been - this only fixes the *live* update).
exports.emitMessageDeleted = (conversationId, payload) => {
    if (!io) return;
    io.to(`conversation:${conversationId}`).emit("message_deleted", payload);
};

// Phase 4: lets the sender's open thread flip their sent bubbles from
// "delivered" to "read" live, without waiting for a page refresh.
exports.emitMessagesRead = (conversationId, payload) => {
    if (!io) return;
    io.to(`conversation:${conversationId}`).emit("messages_read", payload);
};

// Phase 4: broadcasts the full up-to-date reaction list for one message
// whenever anyone adds/removes a reaction, so every open thread stays in
// sync (rather than each client guessing at the delta).
exports.emitReactionUpdated = (conversationId, payload) => {
    if (!io) return;
    io.to(`conversation:${conversationId}`).emit("reaction_updated", payload);
};

// Every authenticated socket auto-joins `user:{id}` on connect (see below),
// so any backend module can push an event straight to one person without
// needing to know their socket id — used for delivery offers, assignment
// notices, etc.
exports.emitToUser = (userId, event, payload) => {
    if (!io) return;
    io.to(`user:${userId}`).emit(event, payload);

};

exports.emitToAdmins = (event, payload) => {
    if (!io) return;
    io.to("admins").emit(event, payload);
};

// Broadcasts to every currently-connected socket, regardless of role or
// room membership. Used for department maintenance enter/exit
// notifications (see category.service.js#notifyMaintenanceChange) - any
// shopper anywhere in the app should see the toast, not just whoever
// happens to be viewing that department right now.
exports.emitToAll = (event, payload) => {
    if (!io) return;
    io.emit(event, payload);
};

// Buyer's tracking page joins `order:{orderId}` to receive the assigned
// agent's live position as it streams in.
exports.emitToOrder = (orderId, event, payload) => {
    if (!io) return;
    io.to(`order:${orderId}`).emit(event, payload);
};



exports.init = (httpServer) => {
    const corsOrigins = process.env.CORS_ORIGIN
        ? process.env.CORS_ORIGIN.split(",").map((origin) => origin.trim())
        : "*";

    io = new Server(httpServer, {
        cors: { origin: corsOrigins, credentials: true },
        // Detect a dead connection (agent's phone losing signal, a phone
        // going to sleep, etc.) within ~25s instead of socket.io's default
        // ~45s, so a stale "still tracking" state on the buyer's page
        // doesn't linger too long before disconnect/reconnect logic takes
        // over. Reconnection itself is entirely client-driven - see
        // SocketContext.jsx's `io(...)` options - the server just needs
        // to notice a dead socket and free its room memberships promptly.
        pingInterval: 15000,
        pingTimeout: 10000
    });

    // Authenticate the socket using the same JWT used for REST requests.
    //
    // Phase 2 (Security Hardening). This used to stop at "is the
    // signature valid" - unlike auth.middleware.js on the REST side,
    // which also re-checks is_active/suspension/token_version fresh from
    // the database on every request (see that file's comments). A
    // signature-valid JWT for a since-suspended/deleted account, or one
    // issued before a password change bumped token_version, would still
    // open a socket connection and could join `conversation:*`/
    // `order:*`/`user:*`/`admins` rooms indefinitely for the rest of the
    // token's 7-day life - flagged as an unverified gap in
    // docs/SECURITY_REVIEW_CHECKLIST.md #9 ("Socket.IO channel
    // authorization ... wasn't re-verified"). This mirrors
    // auth.middleware.js's checks exactly, using the same repository
    // function, so a suspended/deleted account or a stale (pre-password-
    // change) token is rejected at the handshake the same way it would
    // be on any REST request.
    io.use(async (socket, next) => {
        try {
            const token = socket.handshake.auth?.token;

            if (!token) {
                return next(new Error("No token provided"));
            }

            const decoded = jwt.verify(token, process.env.JWT_SECRET);

            // Short-lived pre-auth/reauth tokens (see auth.middleware.js)
            // are never valid as a general session token, socket or
            // otherwise.
            if (decoded.typ) {
                return next(new Error("Invalid or expired token"));
            }

            const status = await authRepository.findAccountStatusById(decoded.id);

            if (!status || !status.is_active) {
                return next(new Error("Account is not active"));
            }

            if ((decoded.tv || 0) !== (status.token_version || 0)) {
                return next(new Error("Invalid or expired token"));
            }

            socket.user = decoded;
            next();

        } catch (error) {
            next(new Error("Invalid or expired token"));
        }
    });

    io.on("connection", (socket) => {
        // Personal room — lets any module message this exact user.
        socket.join(`user:${socket.user.id}`);

// Join shared admin room
if (
    socket.user.role === "admin" ||
    socket.user.role === "super_admin"
) {
    socket.join("admins");
}


        socket.on("join_conversation", async (conversationId) => {
            try {
                // Only let participants join the room for a conversation
                await chatService.assertParticipant(conversationId, socket.user.id);
                socket.join(`conversation:${conversationId}`);
            } catch (error) {
                socket.emit("error_message", error.message);
            }
        });

        socket.on("leave_conversation", (conversationId) => {
            socket.leave(`conversation:${conversationId}`);
        });

        // Phase 4: typing indicator. Purely ephemeral - never touches the
        // database, just relayed to whoever else is in the room right
        // now. The client is responsible for debouncing "start" while the
        // user types and firing "stop" on blur/send/idle timeout; the
        // server trusts that and just forwards it, since a stale
        // indicator only costs a few extra seconds of "typing…" on the
        // other end, not a correctness issue worth guarding server-side.
        socket.on("typing_start", async (conversationId) => {
            try {
                await chatService.assertParticipant(conversationId, socket.user.id);
                socket.to(`conversation:${conversationId}`).emit("typing", {
                    conversation_id: Number(conversationId),
                    user_id: socket.user.id,
                    is_typing: true
                });
            } catch (error) {
                // Not a participant (or conversation gone) - silently ignore,
                // this is a best-effort UX signal, not worth an error toast.
            }
        });

        socket.on("typing_stop", (conversationId) => {
            socket.to(`conversation:${conversationId}`).emit("typing", {
                conversation_id: Number(conversationId),
                user_id: socket.user.id,
                is_typing: false
            });
        });

        socket.on("send_message", async ({ conversationId, message }) => {
            try {
                const saved = await chatService.sendMessage(
                    conversationId,
                    socket.user.id,
                    message
                );
                io.to(`conversation:${conversationId}`).emit("new_message", saved);
            } catch (error) {
                socket.emit("error_message", error.message);
            }
        });

        // ---- Live delivery tracking ----------------------------------------

        // Buyer opens the order-tracking page -> joins this order's room to
        // receive the assigned agent's position as it updates.
        socket.on("join_order_tracking", async (orderId) => {
            try {
                const deliveryService = require("../modules/delivery/delivery.service");
                await deliveryService.assertCanTrackOrder(orderId, socket.user.id);
                socket.join(`order:${orderId}`);

                // Send whatever position we already have straight away -
                // otherwise a tab opened after the agent's last location
                // tick would show an empty map until the next one arrives,
                // which for a slow-moving agent could be many seconds.
                const lastKnown = await deliveryService.getLastKnownAgentPosition(orderId);
                if (lastKnown) {
                    socket.emit("agent:position", { orderId, ...lastKnown });
                }
            } catch (error) {
                socket.emit("error_message", error.message);
            }
        });

        socket.on("leave_order_tracking", (orderId) => {
            socket.leave(`order:${orderId}`);
        });

        // Agent goes on/off shift.
        socket.on("agent:online", async () => {
            if (socket.user.role !== "delivery_agent") return;
            const deliveryService = require("../modules/delivery/delivery.service");
            await deliveryService.setAgentOnline(socket.user.id, true);
        });

        socket.on("agent:offline", async () => {
            if (socket.user.role !== "delivery_agent") return;
            const deliveryService = require("../modules/delivery/delivery.service");
            await deliveryService.setAgentOnline(socket.user.id, false);
        });

        // Agent's app pings its position every few seconds while on shift.
        // Forwarded straight into any order room(s) they're currently
        // assigned to, so the buyer's map updates live.
        //
        // Phase 5C: updateAgentLocation now also returns a fresh
        // road-routing distance-remaining/ETA for each order (computed
        // from this new position to that order's destination), so the
        // tracking widget/page can show an up-to-date ETA on every tick
        // without recomputing a straight-line estimate client-side.
        socket.on("agent:location", async ({ lat, lng }) => {
            if (socket.user.role !== "delivery_agent") return;
            try {
                const deliveryService = require("../modules/delivery/delivery.service");
                const updates = await deliveryService.updateAgentLocation(
                    socket.user.id,
                    lat,
                    lng
                );
                const timestamp = Date.now();
                updates.forEach(({ orderId, distance_remaining_km, eta_minutes, routing_provider, degraded }) => {
                    io.to(`order:${orderId}`).emit("agent:position", {
                        orderId,
                        lat,
                        lng,
                        timestamp,
                        distance_remaining_km,
                        eta_minutes,
                        routing_provider,
                        degraded
                    });
                });

                // Phase 6: dispatch dashboard shows every online agent's
                // live position on one admin-only feed, independent of
                // whichever order room(s) they're currently attached to
                // (an idle-but-online agent has none, but should still
                // move on the dispatch map).
                io.to("admins").emit("dispatch:agent_position", {
                    agentId: socket.user.id,
                    lat,
                    lng,
                    timestamp
                });
            } catch (error) {
                socket.emit("error_message", error.message);
            }
        });

        // Agent responds to a nearest-agent offer pushed via emitToUser above.
        socket.on("delivery:offer:respond", async ({ offerId, accept }) => {
            if (socket.user.role !== "delivery_agent") return;
            try {
                const deliveryService = require("../modules/delivery/delivery.service");
                if (accept) {
                    await deliveryService.acceptOffer(offerId, socket.user.id);
                } else {
                    await deliveryService.declineOffer(offerId, socket.user.id);
                }
            } catch (error) {
                socket.emit("error_message", error.message);
            }
        });

        socket.on("disconnect", async () => {
            if (socket.user.role !== "delivery_agent") return;
            // Best-effort: mark the agent offline so stale offers don't get
            // routed to someone whose tab just closed. If they still have
            // another tab open, its next join will just re-set this true.
            const deliveryService = require("../modules/delivery/delivery.service");
            await deliveryService.setAgentOnline(socket.user.id, false).catch(() => {});
        });
    });

    return io;
};
