/**
 * Inbound WhatsApp message handling (Phase Q3).
 *
 * A tiny, explicit state machine over whatsapp_sessions - not a real NLU
 * bot. At every step the user is shown a numbered menu and the next
 * message is expected to be one of those numbers; anything else falls
 * back to re-showing the main menu rather than guessing at intent. This
 * keeps the whole thing auditable and cheap, which matters more here
 * than natural-language flexibility - most of what this needs to do
 * (browse categories, check an order, reach support) fits numbered
 * menus fine.
 *
 * sendOrderUpdate is the other half of the WhatsApp integration - see
 * notification.service.js's `withWhatsApp` leg, which calls the
 * provider directly rather than through here (that path has nothing to
 * do with inbound state).
 */

const whatsappRepository = require("./whatsapp.repository");
const categoryRepository = require("../category/category.repository");
const productRepository = require("../product/product.repository");
const supportService = require("../support/support.service");
const logger = require("../../utils/logger").child({ module: "whatsapp" });

const FRONTEND_URL = process.env.FRONTEND_URL || "https://nexora.co.tz";
const PRODUCTS_PER_CATEGORY = 5;

const MAIN_MENU =
    "Karibu NEXORA! 👋\n\n" +
    "Reply with a number:\n" +
    "1 - Browse categories\n" +
    "2 - Track an order\n" +
    "3 - Talk to support\n" +
    "4 - Turn WhatsApp order updates on/off";

const money = (amount) => `TZS ${Number(amount).toLocaleString("en-US")}`;

const showMainMenu = async (phone) => {
    await whatsappRepository.setSession(phone, "idle", {});
    return MAIN_MENU;
};

const showCategories = async (phone) => {
    const categories = await categoryRepository.findAllActive();
    const list = categories.slice(0, 9); // numbered 1-9, fits WhatsApp's single-digit-reply UX

    await whatsappRepository.setSession(phone, "awaiting_category", {
        categoryIds: list.map((c) => c.id)
    });

    const lines = list.map((c, i) => `${i + 1} - ${c.name}`);
    return `Categories:\n\n${lines.join("\n")}\n\nReply with a number, or 0 for the main menu.`;
};

const showProductsInCategory = async (phone, categoryId) => {
    const { rows } = await productRepository.findAll({
        categoryId,
        page: 1,
        limit: PRODUCTS_PER_CATEGORY,
        sort: null
    });

    await whatsappRepository.setSession(phone, "idle", {});

    if (rows.length === 0) {
        return "No products in that category right now. Reply 0 for the main menu.";
    }

    const lines = rows.map((p) => `• ${p.name} - ${money(p.discount_price || p.price)}\n  ${FRONTEND_URL}/products/${p.slug}`);
    return `Top picks:\n\n${lines.join("\n\n")}\n\nReply 0 for the main menu.`;
};

const ORDER_STATUS_LABELS = {
    pending: "waiting for the seller to process it",
    processing: "being prepared by the seller",
    shipped: "on its way to you",
    delivered: "delivered",
    cancelled: "cancelled"
};

exports.handleIncomingMessage = async (fromPhone, text) => {
    const trimmed = (text || "").trim();
    const session = await whatsappRepository.getSession(fromPhone);

    // "0"/"menu"/"hi" always resets to the main menu, regardless of
    // where in the flow the user currently is - a stuck/confused user
    // should never be more than one message away from starting over.
    if (["0", "menu", "hi", "hello", "start"].includes(trimmed.toLowerCase())) {
        return showMainMenu(fromPhone);
    }

    if (session.state === "awaiting_category") {
        const index = Number(trimmed) - 1;
        const categoryId = session.context.categoryIds?.[index];
        if (categoryId) {
            return showProductsInCategory(fromPhone, categoryId);
        }
        return "Sorry, I didn't recognize that. Reply with one of the numbers shown, or 0 for the main menu.";
    }

    if (session.state === "awaiting_order_number") {
        const order = await whatsappRepository.findOrderByNumberAndPhone(trimmed, fromPhone);
        await whatsappRepository.setSession(fromPhone, "idle", {});
        if (!order) {
            return "I couldn't find an order with that number on this phone number. Reply 0 for the main menu.";
        }
        const statusLabel = ORDER_STATUS_LABELS[order.status] || order.status;
        return `Order ${order.order_number} (${money(order.total_amount)}) is ${statusLabel}. Reply 0 for the main menu.`;
    }

    // Default / "idle" state: interpret the message as a main-menu choice.
    switch (trimmed) {
        case "1":
            return showCategories(fromPhone);

        case "2":
            await whatsappRepository.setSession(fromPhone, "awaiting_order_number", {});
            return "Sure - what's your order number? (e.g. ORD-XXXXXXXX-1234)";

        case "3": {
            const user = await whatsappRepository.findUserByPhone(fromPhone);
            await supportService.createFromWhatsApp({
                userId: user?.id || null,
                contactPhone: fromPhone,
                body: "Buyer requested support via WhatsApp."
            }).catch((err) => logger.warn({ err, fromPhone }, "whatsapp support ticket creation error"));
            await whatsappRepository.setSession(fromPhone, "idle", {});
            return "Thanks - we've let our support team know. They'll reply here, and you can also see this in the NEXORA app under Support. Reply 0 for the main menu.";
        }

        case "4": {
            const user = await whatsappRepository.findUserByPhone(fromPhone);
            if (!user) {
                return "This phone number isn't linked to a NEXORA account yet, so I can't toggle order updates. Reply 0 for the main menu.";
            }
            const nextValue = !user.whatsapp_order_updates;
            await whatsappRepository.setWhatsAppOptIn(user.id, nextValue);
            await whatsappRepository.setSession(fromPhone, "idle", {});
            return `WhatsApp order updates are now ${nextValue ? "ON" : "OFF"}. Reply 0 for the main menu.`;
        }

        default:
            return showMainMenu(fromPhone);
    }
};
