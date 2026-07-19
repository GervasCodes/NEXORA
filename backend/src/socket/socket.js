const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");

const chatService = require("../modules/chat/chat.service");

let io = null;

// Other modules (chat.service) call this to broadcast a saved message
// to everyone currently in that conversation's room.
exports.emitNewMessage = (conversationId, payload) => {
    if (!io) return;
    io.to(`conversation:${conversationId}`).emit("new_message", payload);
};

// Every authenticated socket auto-joins `user:{id}` on connect (see below),
// so any backend module can push an event straight to one person without
// needing to know their socket id — used for delivery offers, assignment
// notices, etc.
// Other modules (chat.service) call this to broadcast a soft-deleted
// message's tombstone to everyone currently in that conversation's room.
exports.emitMessageDeleted = (conversationId, payload) => {
    if (!io) return;
    io.to(`conversation:${conversationId}`).emit("message_deleted", payload);
};

exports.emitToUser = (userId, event, payload) => {
    if (!io) return;
    io.to(`user:${userId}`).emit(event, payload);

};

exports.emitToAdmins = (event, payload) => {
    if (!io) return;
    io.to("admins").emit(event, payload);
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
        cors: { origin: corsOrigins, credentials: true }
    });

    // Authenticate the socket using the same JWT used for REST requests
    io.use((socket, next) => {
        try {
            const token = socket.handshake.auth?.token;

            if (!token) {
                return next(new Error("No token provided"));
            }

            const decoded = jwt.verify(token, process.env.JWT_SECRET);
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
        socket.on("agent:location", async ({ lat, lng }) => {
            if (socket.user.role !== "delivery_agent") return;
            try {
                const deliveryService = require("../modules/delivery/delivery.service");
                const orderIds = await deliveryService.updateAgentLocation(
                    socket.user.id,
                    lat,
                    lng
                );
                orderIds.forEach((orderId) => {
                    io.to(`order:${orderId}`).emit("agent:position", {
                        orderId,
                        lat,
                        lng
                    });
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
