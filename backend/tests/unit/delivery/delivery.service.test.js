jest.mock("../../../src/modules/delivery/delivery.repository");
jest.mock("../../../src/modules/delivery/deliveryPricing.service");
jest.mock("../../../src/modules/order/order.repository");
jest.mock("../../../src/modules/notification/notification.service");
jest.mock("../../../src/modules/push/push.service");
jest.mock("../../../src/modules/settings/settings.service");
jest.mock("../../../src/modules/earnings/earnings.service");
jest.mock("../../../src/socket/socket");

const deliveryRepository = require("../../../src/modules/delivery/delivery.repository");
const deliveryPricingService = require("../../../src/modules/delivery/deliveryPricing.service");
const orderRepository = require("../../../src/modules/order/order.repository");
const notificationService = require("../../../src/modules/notification/notification.service");
const pushService = require("../../../src/modules/push/push.service");
const settingsService = require("../../../src/modules/settings/settings.service");
const earningsService = require("../../../src/modules/earnings/earnings.service");
const socket = require("../../../src/socket/socket");

const deliveryService = require("../../../src/modules/delivery/delivery.service");

beforeEach(() => {
    jest.useFakeTimers();
    notificationService.notify.mockResolvedValue(undefined);
    pushService.sendToUser.mockResolvedValue(undefined);
    earningsService.creditForDelivery.mockResolvedValue(undefined);
    socket.emitToOrder = jest.fn();
    socket.emitToUser = jest.fn();
});

afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
});

describe("delivery.service.claimDelivery", () => {
    it("rejects an unknown order", async () => {
        orderRepository.findOrderById.mockResolvedValue(undefined);
        await expect(deliveryService.claimDelivery(1, 5)).rejects.toThrow("Order not found");
    });

    it("rejects an order that isn't shipped yet", async () => {
        orderRepository.findOrderById.mockResolvedValue({ id: 1, status: "processing" });
        await expect(deliveryService.claimDelivery(1, 5)).rejects.toThrow("Order is not ready for pickup");
    });

    it("rejects an order that's already been claimed", async () => {
        orderRepository.findOrderById.mockResolvedValue({ id: 1, status: "shipped" });
        deliveryRepository.findByOrderId.mockResolvedValue({ id: 9 });
        await expect(deliveryService.claimDelivery(1, 5)).rejects.toThrow("This order has already been claimed");
    });

    it("prices and creates the delivery on a valid claim", async () => {
        orderRepository.findOrderById.mockResolvedValue({ id: 1, status: "shipped" });
        deliveryRepository.findByOrderId.mockResolvedValue(undefined);
        deliveryPricingService.calculateDeliveryFee.mockResolvedValue({ fee: 4000, distanceKm: 6 });
        deliveryRepository.create.mockResolvedValue(77);

        const result = await deliveryService.claimDelivery(1, 5);

        expect(deliveryRepository.create).toHaveBeenCalledWith(1, 5, 4000, 6);
        expect(result).toEqual({ deliveryId: 77, orderId: 1 });
    });
});

describe("delivery.service.getDelivery", () => {
    it("rejects an unknown order", async () => {
        orderRepository.findOrderById.mockResolvedValue(undefined);
        await expect(deliveryService.getDelivery(1, 5)).rejects.toThrow("Order not found");
    });

    it("rejects when there's no delivery record yet", async () => {
        orderRepository.findOrderById.mockResolvedValue({ id: 1, buyer_id: 5 });
        deliveryRepository.findByOrderIdWithAgent.mockResolvedValue(undefined);
        await expect(deliveryService.getDelivery(1, 5)).rejects.toThrow("No delivery record for this order yet");
    });

    it("allows the buyer and attaches a null rating when none exists", async () => {
        orderRepository.findOrderById.mockResolvedValue({ id: 1, buyer_id: 5 });
        deliveryRepository.findByOrderIdWithAgent.mockResolvedValue({ id: 9, agent_id: 20 });
        deliveryRepository.findRatingByOrder.mockResolvedValue(undefined);

        const result = await deliveryService.getDelivery(1, 5);

        expect(result).toEqual({ id: 9, agent_id: 20, rating: null });
    });

    it("allows the assigned agent", async () => {
        orderRepository.findOrderById.mockResolvedValue({ id: 1, buyer_id: 5 });
        deliveryRepository.findByOrderIdWithAgent.mockResolvedValue({ id: 9, agent_id: 20 });
        deliveryRepository.findRatingByOrder.mockResolvedValue(undefined);

        const result = await deliveryService.getDelivery(1, 20);
        expect(result.agent_id).toBe(20);
    });

    it("allows a seller who has an item in the order", async () => {
        orderRepository.findOrderById.mockResolvedValue({ id: 1, buyer_id: 5 });
        deliveryRepository.findByOrderIdWithAgent.mockResolvedValue({ id: 9, agent_id: 20 });
        orderRepository.sellerHasItemInOrder.mockResolvedValue(true);
        deliveryRepository.findRatingByOrder.mockResolvedValue(undefined);

        await expect(deliveryService.getDelivery(1, 99)).resolves.toBeDefined();
    });

    it("rejects an unrelated user (not buyer, agent, or seller on the order)", async () => {
        orderRepository.findOrderById.mockResolvedValue({ id: 1, buyer_id: 5 });
        deliveryRepository.findByOrderIdWithAgent.mockResolvedValue({ id: 9, agent_id: 20 });
        orderRepository.sellerHasItemInOrder.mockResolvedValue(false);

        await expect(deliveryService.getDelivery(1, 99)).rejects.toThrow("No delivery record for this order yet");
    });
});

describe("delivery.service.updateDeliveryStatus", () => {
    it("rejects when there's no delivery, or it belongs to a different agent", async () => {
        deliveryRepository.findByOrderId.mockResolvedValue(undefined);
        await expect(deliveryService.updateDeliveryStatus(1, 5, "picked_up")).rejects.toThrow("Delivery not found");

        deliveryRepository.findByOrderId.mockResolvedValue({ id: 9, agent_id: 999, status: "assigned" });
        await expect(deliveryService.updateDeliveryStatus(1, 5, "picked_up")).rejects.toThrow("Delivery not found");
    });

    it("rejects a status transition that isn't allowed", async () => {
        deliveryRepository.findByOrderId.mockResolvedValue({ id: 9, agent_id: 5, status: "assigned" });
        await expect(deliveryService.updateDeliveryStatus(1, 5, "delivered")).rejects.toThrow(
            'Cannot move delivery from "assigned" to "delivered"'
        );
        expect(deliveryRepository.updateStatus).not.toHaveBeenCalled();
    });

    it("marking delivered also updates the order status and fires the earnings credit (fire-and-forget)", async () => {
        deliveryRepository.findByOrderId.mockResolvedValue({ id: 9, agent_id: 5, status: "in_transit" });
        orderRepository.findOrderById.mockResolvedValue({ id: 1, buyer_id: 20, order_number: "ORD-1" });

        await deliveryService.updateDeliveryStatus(1, 5, "delivered", "left at door");

        expect(deliveryRepository.updateStatus).toHaveBeenCalledWith(9, "delivered", "left at door");
        expect(orderRepository.updateOrderStatus).toHaveBeenCalledWith(1, "delivered");
        expect(earningsService.creditForDelivery).toHaveBeenCalledWith(
            expect.objectContaining({ id: 9, agent_id: 5 })
        );
    });

    it("does not update the order status for a non-terminal transition", async () => {
        deliveryRepository.findByOrderId.mockResolvedValue({ id: 9, agent_id: 5, status: "assigned" });
        orderRepository.findOrderById.mockResolvedValue({ id: 1, buyer_id: 20, order_number: "ORD-1" });

        await deliveryService.updateDeliveryStatus(1, 5, "picked_up");

        expect(orderRepository.updateOrderStatus).not.toHaveBeenCalled();
        expect(earningsService.creditForDelivery).not.toHaveBeenCalled();
    });

    it("only sends the buyer an email when the delivery is actually completed", async () => {
        deliveryRepository.findByOrderId.mockResolvedValue({ id: 9, agent_id: 5, status: "assigned" });
        orderRepository.findOrderById.mockResolvedValue({ id: 1, buyer_id: 20, order_number: "ORD-1" });

        await deliveryService.updateDeliveryStatus(1, 5, "picked_up");

        expect(notificationService.notify).toHaveBeenCalledWith(
            expect.objectContaining({ withEmail: false })
        );
        expect(socket.emitToOrder).toHaveBeenCalledWith(1, "delivery:status", { orderId: 1, status: "picked_up" });
    });
});

describe("delivery.service.updateAgentLocation", () => {
    it("returns order ids for deliveries still in progress, excluding delivered/failed", async () => {
        deliveryRepository.findByAgent.mockResolvedValue([
            { order_id: 1, status: "in_transit" },
            { order_id: 2, status: "delivered" },
            { order_id: 3, status: "failed" },
            { order_id: 4, status: "picked_up" }
        ]);

        const result = await deliveryService.updateAgentLocation(5, -6.8, 39.2);

        expect(deliveryRepository.updateLocation).toHaveBeenCalledWith(5, -6.8, 39.2);
        expect(result).toEqual([1, 4]);
    });
});

describe("delivery.service.assertCanTrackOrder", () => {
    it("rejects an unknown order", async () => {
        orderRepository.findOrderById.mockResolvedValue(undefined);
        await expect(deliveryService.assertCanTrackOrder(1, 5)).rejects.toThrow("Order not found");
    });

    it("allows the buyer", async () => {
        orderRepository.findOrderById.mockResolvedValue({ id: 1, buyer_id: 5 });
        await expect(deliveryService.assertCanTrackOrder(1, 5)).resolves.toBe(true);
    });

    it("allows the assigned agent", async () => {
        orderRepository.findOrderById.mockResolvedValue({ id: 1, buyer_id: 999 });
        deliveryRepository.findByOrderId.mockResolvedValue({ agent_id: 5 });
        await expect(deliveryService.assertCanTrackOrder(1, 5)).resolves.toBe(true);
    });

    it("allows a seller with an item on the order", async () => {
        orderRepository.findOrderById.mockResolvedValue({ id: 1, buyer_id: 999 });
        deliveryRepository.findByOrderId.mockResolvedValue(undefined);
        orderRepository.sellerHasItemInOrder.mockResolvedValue(true);
        await expect(deliveryService.assertCanTrackOrder(1, 5)).resolves.toBe(true);
    });

    it("rejects everyone else", async () => {
        orderRepository.findOrderById.mockResolvedValue({ id: 1, buyer_id: 999 });
        deliveryRepository.findByOrderId.mockResolvedValue(undefined);
        orderRepository.sellerHasItemInOrder.mockResolvedValue(false);
        await expect(deliveryService.assertCanTrackOrder(1, 5)).rejects.toThrow("Not authorized to track this order");
    });
});

describe("delivery.service.startMatching / offer flow", () => {
    it("does nothing when the order can't be found", async () => {
        orderRepository.findOrderById.mockResolvedValue(undefined);
        await deliveryService.startMatching(1);
        expect(deliveryRepository.findCandidateAgents).not.toHaveBeenCalled();
    });

    it("skips matching entirely when the order has no delivery pin", async () => {
        orderRepository.findOrderById.mockResolvedValue({ id: 1, delivery_lat: null, delivery_lng: null });
        await deliveryService.startMatching(1);
        expect(deliveryRepository.findCandidateAgents).not.toHaveBeenCalled();
    });

    it("bails out if the order was manually claimed while matching was about to start", async () => {
        orderRepository.findOrderById.mockResolvedValue({ id: 1, delivery_lat: -6.8, delivery_lng: 39.2 });
        deliveryRepository.findByOrderId.mockResolvedValue({ id: 9 }); // already claimed

        await deliveryService.startMatching(1);

        expect(deliveryRepository.findCandidateAgents).not.toHaveBeenCalled();
    });

    it("leaves the order in the manual pool when no candidate agent is within range", async () => {
        orderRepository.findOrderById.mockResolvedValue({ id: 1, delivery_lat: -6.8, delivery_lng: 39.2 });
        deliveryRepository.findByOrderId.mockResolvedValue(undefined);
        // Agent far outside OFFER_RADIUS_KM (15km) - Dodoma vs Dar es Salaam
        deliveryRepository.findCandidateAgents.mockResolvedValue([
            { id: 50, current_lat: -6.1730, current_lng: 35.7419 }
        ]);

        await deliveryService.startMatching(1);

        expect(deliveryRepository.createOffer).not.toHaveBeenCalled();
    });

    it("offers to the nearest in-range candidate and notifies them via socket + push", async () => {
        orderRepository.findOrderById
            .mockResolvedValueOnce({ id: 1, delivery_lat: -6.8, delivery_lng: 39.2 })
            .mockResolvedValueOnce({ id: 1, order_number: "ORD-1", shipping_address: "123 St", shipping_city: "Dar" });
        deliveryRepository.findByOrderId.mockResolvedValue(undefined);
        deliveryRepository.findCandidateAgents.mockResolvedValue([
            { id: 50, current_lat: -6.81, current_lng: 39.21 }, // ~1.5km away, in range
            { id: 51, current_lat: -6.9, current_lng: 39.3 }    // farther away
        ]);
        deliveryRepository.createOffer.mockResolvedValue(200);

        await deliveryService.startMatching(1);

        expect(deliveryRepository.createOffer).toHaveBeenCalledWith(1, 50, expect.any(Number), expect.any(Date));
        expect(socket.emitToUser).toHaveBeenCalledWith(50, "delivery:offer", expect.objectContaining({ offerId: 200, orderId: 1 }));
        expect(pushService.sendToUser).toHaveBeenCalledWith(50, expect.objectContaining({ offerId: 200, orderId: 1 }));
    });

    it("advances to the next candidate once an unaccepted offer expires", async () => {
        orderRepository.findOrderById
            .mockResolvedValueOnce({ id: 1, delivery_lat: -6.8, delivery_lng: 39.2 }) // startMatching
            .mockResolvedValueOnce({ id: 1, order_number: "ORD-1" }) // first offer notify
            .mockResolvedValueOnce({ id: 1, order_number: "ORD-1" }); // second offer notify (after expiry)
        deliveryRepository.findByOrderId.mockResolvedValue(undefined);
        deliveryRepository.findCandidateAgents.mockResolvedValue([
            { id: 50, current_lat: -6.81, current_lng: 39.21 }
        ]);
        deliveryRepository.createOffer.mockResolvedValueOnce(200).mockResolvedValueOnce(201);
        deliveryRepository.expireOffer.mockResolvedValue(true); // still pending -> advance

        await deliveryService.startMatching(1);
        expect(deliveryRepository.createOffer).toHaveBeenCalledTimes(1);

        await jest.runOnlyPendingTimersAsync();

        expect(deliveryRepository.expireOffer).toHaveBeenCalledWith(200);
        expect(deliveryRepository.createOffer).toHaveBeenCalledTimes(2);
    });

    it("does not re-offer once an offer was accepted before it expired", async () => {
        orderRepository.findOrderById
            .mockResolvedValueOnce({ id: 1, delivery_lat: -6.8, delivery_lng: 39.2 })
            .mockResolvedValueOnce({ id: 1, order_number: "ORD-1" });
        deliveryRepository.findByOrderId.mockResolvedValue(undefined);
        deliveryRepository.findCandidateAgents.mockResolvedValue([
            { id: 50, current_lat: -6.81, current_lng: 39.21 }
        ]);
        deliveryRepository.createOffer.mockResolvedValue(200);
        deliveryRepository.expireOffer.mockResolvedValue(false); // already accepted

        await deliveryService.startMatching(1);
        await jest.runOnlyPendingTimersAsync();

        expect(deliveryRepository.createOffer).toHaveBeenCalledTimes(1);
    });
});

describe("delivery.service.acceptOffer", () => {
    it("rejects when the offer doesn't exist or belongs to a different agent", async () => {
        deliveryRepository.findOfferById.mockResolvedValue(undefined);
        await expect(deliveryService.acceptOffer(200, 50)).rejects.toThrow("Offer not found");

        deliveryRepository.findOfferById.mockResolvedValue({ id: 200, agent_id: 999, order_id: 1 });
        await expect(deliveryService.acceptOffer(200, 50)).rejects.toThrow("Offer not found");
    });

    it("rejects when the order was already claimed by someone else", async () => {
        deliveryRepository.findOfferById.mockResolvedValue({ id: 200, agent_id: 50, order_id: 1 });
        deliveryRepository.findByOrderId.mockResolvedValue({ id: 9 });

        await expect(deliveryService.acceptOffer(200, 50)).rejects.toThrow("This order has already been claimed");
    });

    it("rejects an expired offer", async () => {
        deliveryRepository.findOfferById.mockResolvedValue({ id: 200, agent_id: 50, order_id: 1 });
        deliveryRepository.findByOrderId.mockResolvedValue(undefined);
        deliveryRepository.acceptOffer.mockResolvedValue(false);

        await expect(deliveryService.acceptOffer(200, 50)).rejects.toThrow("This offer has expired");
    });

    it("prices via the real order when available and notifies the buyer + tracking room", async () => {
        deliveryRepository.findOfferById.mockResolvedValue({ id: 200, agent_id: 50, order_id: 1 });
        deliveryRepository.findByOrderId.mockResolvedValue(undefined);
        deliveryRepository.acceptOffer.mockResolvedValue(true);
        orderRepository.findOrderById.mockResolvedValue({ id: 1, buyer_id: 5, order_number: "ORD-1" });
        deliveryPricingService.calculateDeliveryFee.mockResolvedValue({ fee: 3000, distanceKm: 4 });

        const result = await deliveryService.acceptOffer(200, 50);

        expect(deliveryRepository.create).toHaveBeenCalledWith(1, 50, 3000, 4);
        expect(notificationService.notify).toHaveBeenCalledWith(
            expect.objectContaining({ userId: 5, type: "delivery_assigned" })
        );
        expect(socket.emitToOrder).toHaveBeenCalledWith(1, "delivery:assigned", { orderId: 1, agentId: 50 });
        expect(result).toEqual({ orderId: 1, deliveryId: 1 });
    });

    it("falls back to the flat rider fee when the underlying order can no longer be found", async () => {
        deliveryRepository.findOfferById.mockResolvedValue({ id: 200, agent_id: 50, order_id: 1 });
        deliveryRepository.findByOrderId.mockResolvedValue(undefined);
        deliveryRepository.acceptOffer.mockResolvedValue(true);
        orderRepository.findOrderById.mockResolvedValue(undefined);
        settingsService.getRiderDeliveryFee.mockResolvedValue(2500);

        await deliveryService.acceptOffer(200, 50);

        expect(deliveryPricingService.calculateDeliveryFee).not.toHaveBeenCalled();
        expect(deliveryRepository.create).toHaveBeenCalledWith(1, 50, 2500, null);
        expect(notificationService.notify).not.toHaveBeenCalled();
    });
});

describe("delivery.service.rateDelivery", () => {
    it("rejects when the order doesn't exist or belongs to a different buyer", async () => {
        orderRepository.findOrderById.mockResolvedValue(undefined);
        await expect(deliveryService.rateDelivery(1, 5, 5, "great")).rejects.toThrow("Order not found");

        orderRepository.findOrderById.mockResolvedValue({ id: 1, buyer_id: 999 });
        await expect(deliveryService.rateDelivery(1, 5, 5, "great")).rejects.toThrow("Order not found");
    });

    it("rejects when there's no delivery record", async () => {
        orderRepository.findOrderById.mockResolvedValue({ id: 1, buyer_id: 5 });
        deliveryRepository.findByOrderId.mockResolvedValue(undefined);
        await expect(deliveryService.rateDelivery(1, 5, 5, "great")).rejects.toThrow("No delivery record for this order yet");
    });

    it("rejects rating before the delivery is actually delivered", async () => {
        orderRepository.findOrderById.mockResolvedValue({ id: 1, buyer_id: 5 });
        deliveryRepository.findByOrderId.mockResolvedValue({ id: 9, status: "in_transit" });
        await expect(deliveryService.rateDelivery(1, 5, 5, "great")).rejects.toThrow(
            "You can only rate a delivery agent after your order has been delivered"
        );
    });

    it("rejects a duplicate rating", async () => {
        orderRepository.findOrderById.mockResolvedValue({ id: 1, buyer_id: 5 });
        deliveryRepository.findByOrderId.mockResolvedValue({ id: 9, status: "delivered", agent_id: 20 });
        deliveryRepository.findRatingByOrder.mockResolvedValue({ id: 1 });
        await expect(deliveryService.rateDelivery(1, 5, 5, "great")).rejects.toThrow("You've already rated this delivery");
    });

    it("creates the rating on a valid, first-time submission", async () => {
        orderRepository.findOrderById.mockResolvedValue({ id: 1, buyer_id: 5 });
        deliveryRepository.findByOrderId.mockResolvedValue({ id: 9, status: "delivered", agent_id: 20 });
        deliveryRepository.findRatingByOrder.mockResolvedValue(undefined);
        deliveryRepository.createRating.mockResolvedValue(500);

        const result = await deliveryService.rateDelivery(1, 5, 5, "great");

        expect(deliveryRepository.createRating).toHaveBeenCalledWith(1, 20, 5, 5, "great");
        expect(result).toEqual({ ratingId: 500 });
    });
});

describe("delivery.service.getMyRatingSummary", () => {
    it("rounds the average to 1 decimal when ratings exist", async () => {
        deliveryRepository.getAgentRatingSummary.mockResolvedValue({ average_rating: "4.6667", rating_count: 3 });
        deliveryRepository.findRatingsByAgent.mockResolvedValue([{ id: 1 }]);

        const result = await deliveryService.getMyRatingSummary(20);

        expect(result).toEqual({ average_rating: 4.7, rating_count: 3, ratings: [{ id: 1 }] });
    });

    it("returns a null average when there are no ratings yet", async () => {
        deliveryRepository.getAgentRatingSummary.mockResolvedValue({ average_rating: null, rating_count: 0 });
        deliveryRepository.findRatingsByAgent.mockResolvedValue([]);

        const result = await deliveryService.getMyRatingSummary(20);

        expect(result.average_rating).toBeNull();
    });
});

describe("delivery.service.declineOffer", () => {
    it("rejects when the offer doesn't exist or belongs to a different agent", async () => {
        deliveryRepository.findOfferById.mockResolvedValue(undefined);
        await expect(deliveryService.declineOffer(200, 50)).rejects.toThrow("Offer not found");

        deliveryRepository.findOfferById.mockResolvedValue({ id: 200, agent_id: 999, order_id: 1 });
        await expect(deliveryService.declineOffer(200, 50)).rejects.toThrow("Offer not found");
    });

    it("declines then offers the order to the next candidate", async () => {
        deliveryRepository.findOfferById.mockResolvedValue({ id: 200, agent_id: 50, order_id: 1 });
        orderRepository.findOrderById
            .mockResolvedValueOnce({ id: 1, delivery_lat: -6.8, delivery_lng: 39.2 })
            .mockResolvedValueOnce({ id: 1, order_number: "ORD-1" });
        deliveryRepository.findByOrderId.mockResolvedValue(undefined);
        deliveryRepository.findCandidateAgents.mockResolvedValue([
            { id: 51, current_lat: -6.81, current_lng: 39.21 }
        ]);
        deliveryRepository.createOffer.mockResolvedValue(201);

        await deliveryService.declineOffer(200, 50);

        expect(deliveryRepository.declineOffer).toHaveBeenCalledWith(200, 50);
        expect(deliveryRepository.createOffer).toHaveBeenCalledWith(1, 51, expect.any(Number), expect.any(Date));
    });
});
