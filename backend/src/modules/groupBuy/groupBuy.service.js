/**
 * Group buying (Phase Q7): a seller opens a discounted group price on
 * one of their products, good only if enough buyers join before a
 * deadline. See migration 089's header comment on group_buys for why
 * there's no pre-authorization/hold on joining - nobody is charged
 * until (and unless) the group actually succeeds.
 *
 * Lifecycle: open -> (deadline passes) -> successful | failed
 * A successful group gives each participant a short claim window to
 * complete a real order at the discounted price (claim() below, which
 * creates the order directly rather than going through the normal
 * cart - a group buy is always exactly one product at a fixed price,
 * so there's nothing the cart's multi-item/multi-vendor logic would add).
 */

const groupBuyRepository = require("./groupBuy.repository");
const productRepository = require("../product/product.repository");
const orderRepository = require("../order/order.repository");
const notificationService = require("../notification/notification.service");
const logger = require("../../utils/logger").child({ module: "groupBuy" });

const CLAIM_WINDOW_HOURS = 48;

exports.create = async (sellerId, { productId, groupPrice, minParticipants, deadline }) => {
    const product = await productRepository.findById(productId);
    if (!product || product.seller_id !== sellerId) {
        throw new Error("Product not found");
    }
    if (Number(groupPrice) >= Number(product.price)) {
        throw new Error("Group price must be lower than the regular price");
    }
    if (!minParticipants || minParticipants < 2) {
        throw new Error("A group buy needs at least 2 participants");
    }
    if (new Date(deadline).getTime() <= Date.now()) {
        throw new Error("Deadline must be in the future");
    }

    const id = await groupBuyRepository.create({ productId, sellerId, groupPrice, minParticipants, deadline });
    return groupBuyRepository.findById(id);
};

exports.listOpen = async (filter) => groupBuyRepository.findOpen(filter);

exports.getById = async (id) => groupBuyRepository.findById(id);

exports.listBySeller = async (sellerId) => groupBuyRepository.findBySeller(sellerId);

exports.listMyParticipations = async (buyerId) => groupBuyRepository.findMyParticipations(buyerId);

exports.join = async (groupBuyId, buyerId) => {
    const group = await groupBuyRepository.findById(groupBuyId);
    if (!group) throw new Error("Group buy not found");
    if (group.status !== "open" || new Date(group.deadline).getTime() <= Date.now()) {
        throw new Error("This group buy is no longer accepting participants");
    }

    const existing = await groupBuyRepository.findParticipant(groupBuyId, buyerId);
    if (existing) throw new Error("You've already joined this group buy");

    await groupBuyRepository.addParticipant(groupBuyId, buyerId);
    return groupBuyRepository.findById(groupBuyId);
};

// Called by a scheduled sweep (see cron wiring in app.js) - resolves
// every 'open' group buy whose deadline has passed. Not called
// synchronously from join() - a group buy's fate shouldn't depend on
// whether the participant who happens to trigger the deadline check is
// still online.
exports.sweepExpired = async () => {
    const expired = await groupBuyRepository.findExpiredOpen();

    for (const group of expired) {
        const participants = await groupBuyRepository.findParticipants(group.id);
        const succeeded = participants.length >= group.min_participants;

        await groupBuyRepository.setStatus(group.id, succeeded ? "successful" : "failed");

        for (const participant of participants) {
            notificationService.notify({
                userId: participant.buyer_id,
                type: "group_buy_resolved",
                titleKey: succeeded ? "notifications.groupBuy.succeeded.title" : "notifications.groupBuy.failed.title",
                messageKey: succeeded ? "notifications.groupBuy.succeeded.message" : "notifications.groupBuy.failed.message",
                withEmail: true
            }).catch((err) => logger.warn({ err, groupBuyId: group.id }, "group buy resolution notify error"));
        }
    }

    return { resolved: expired.length };
};

// Buyer completes their discounted purchase after a group buy succeeds.
// Creates a standalone one-item order directly (see this file's header
// comment for why the cart isn't involved) and returns it for the
// buyer to pay through the normal payment initiation endpoints, exactly
// like any other freshly-created order.
exports.claim = async (groupBuyId, buyerId, shippingInfo) => {
    const group = await groupBuyRepository.findById(groupBuyId);
    if (!group) throw new Error("Group buy not found");
    if (group.status !== "successful") {
        throw new Error("This group buy hasn't succeeded (yet, or at all) - nothing to claim");
    }

    const participant = await groupBuyRepository.findParticipant(groupBuyId, buyerId);
    if (!participant) throw new Error("You didn't join this group buy");
    if (participant.order_id) throw new Error("You've already claimed this group buy");

    const claimDeadline = new Date(group.deadline).getTime() + CLAIM_WINDOW_HOURS * 60 * 60 * 1000;
    if (Date.now() > claimDeadline) {
        throw new Error("The claim window for this group buy has passed");
    }

    const product = await productRepository.findById(group.product_id);
    if (!product || product.stock < 1) {
        throw new Error("This product is out of stock");
    }

    const orderNumber = `GRP-${Date.now().toString(36).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const lineItem = {
        product_id: group.product_id,
        seller_id: group.seller_id,
        quantity: 1,
        unit_price: group.group_price,
        subtotal: group.group_price
    };

    const orderId = await orderRepository.createOrder(
        buyerId,
        orderNumber,
        shippingInfo,
        [lineItem],
        Number(group.group_price)
    );

    await groupBuyRepository.markParticipantOrdered(groupBuyId, buyerId, orderId);

    return orderRepository.findOrderById(orderId);
};
