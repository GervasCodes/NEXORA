jest.mock("../../../src/modules/order/order.repository");
jest.mock("../../../src/modules/cart/cart.repository");
jest.mock("../../../src/modules/seller/seller.repository");
jest.mock("../../../src/modules/delivery/delivery.repository");
jest.mock("../../../src/modules/delivery/deliveryPricing.service");
jest.mock("../../../src/modules/delivery/delivery.service");
jest.mock("../../../src/modules/notification/notification.service");
jest.mock("../../../src/modules/fraud/fraud.service");
jest.mock("../../../src/socket/socket");

const orderRepository = require("../../../src/modules/order/order.repository");
const cartRepository = require("../../../src/modules/cart/cart.repository");
const sellerRepository = require("../../../src/modules/seller/seller.repository");
const deliveryRepository = require("../../../src/modules/delivery/delivery.repository");
const deliveryPricingService = require("../../../src/modules/delivery/deliveryPricing.service");
const deliveryService = require("../../../src/modules/delivery/delivery.service");
const notificationService = require("../../../src/modules/notification/notification.service");
const fraudService = require("../../../src/modules/fraud/fraud.service");
const socket = require("../../../src/socket/socket");

const orderService = require("../../../src/modules/order/order.service");

// Shared helper: builds a cart row in the shape cart.repository.getCartByUser
// returns (joined with product columns).
const cartRow = (overrides = {}) => ({
    cart_item_id: 1,
    product_id: 1,
    quantity: 1,
    seller_id: 10,
    name: "Widget",
    price: 1000,
    discount_price: null,
    stock: 5,
    ...overrides
});

const productRow = (overrides = {}) => ({
    id: 1,
    price: 1000,
    discount_price: null,
    stock: 5,
    is_active: 1,
    ...overrides
});

beforeEach(() => {
    notificationService.notify.mockResolvedValue(undefined);
    fraudService.evaluateOrder.mockResolvedValue(undefined);
    socket.emitToAdmins.mockImplementation(() => {});
});

describe("order.service.checkout", () => {
    it("rejects an empty cart", async () => {
        cartRepository.getCartByUser.mockResolvedValue([]);

        await expect(orderService.checkout(1, {})).rejects.toThrow("Your cart is empty");
        expect(orderRepository.createOrder).not.toHaveBeenCalled();
    });

    it("rejects when a cart item's product no longer exists", async () => {
        cartRepository.getCartByUser.mockResolvedValue([cartRow({ name: "Ghost Item" })]);
        cartRepository.findProductById.mockResolvedValue(undefined);

        await expect(orderService.checkout(1, {})).rejects.toThrow('"Ghost Item" is no longer available');
    });

    it("rejects when the product has been deactivated", async () => {
        cartRepository.getCartByUser.mockResolvedValue([cartRow({ name: "Discontinued" })]);
        cartRepository.findProductById.mockResolvedValue(productRow({ is_active: 0 }));

        await expect(orderService.checkout(1, {})).rejects.toThrow('"Discontinued" is no longer available');
    });

    it("rejects when the requested quantity exceeds stock", async () => {
        cartRepository.getCartByUser.mockResolvedValue([cartRow({ name: "Widget", quantity: 10 })]);
        cartRepository.findProductById.mockResolvedValue(productRow({ stock: 3 }));

        await expect(orderService.checkout(1, {})).rejects.toThrow('Only 3 of "Widget" left in stock');
    });

    it("creates a single standalone order when all items share one vendor", async () => {
        cartRepository.getCartByUser.mockResolvedValue([
            cartRow({ product_id: 1, seller_id: 10, quantity: 2, price: 1000 }),
            cartRow({ product_id: 2, seller_id: 10, quantity: 1, price: 500 })
        ]);
        cartRepository.findProductById
            .mockResolvedValueOnce(productRow({ id: 1, price: 1000, stock: 5 }))
            .mockResolvedValueOnce(productRow({ id: 2, price: 500, stock: 5 }));
        orderRepository.createOrder.mockResolvedValue(99);

        const result = await orderService.checkout(1, { city: "Dar es Salaam" });

        expect(orderRepository.createSplitOrder).not.toHaveBeenCalled();
        expect(orderRepository.createOrder).toHaveBeenCalledTimes(1);
        const [buyerId, orderNumber, shippingInfo, cartItems, totalAmount] = orderRepository.createOrder.mock.calls[0];
        expect(buyerId).toBe(1);
        expect(shippingInfo).toEqual({ city: "Dar es Salaam" });
        expect(cartItems).toHaveLength(2);
        expect(totalAmount).toBe(2500); // (1000*2) + (500*1)

        expect(result).toEqual({
            orderId: 99,
            orderNumber,
            totalAmount: 2500,
            isMultiVendor: false,
            vendorCount: 1
        });
    });

    it("splits a multi-vendor cart into a parent order grouped by seller", async () => {
        cartRepository.getCartByUser.mockResolvedValue([
            cartRow({ product_id: 1, seller_id: 10, quantity: 1, price: 1000 }),
            cartRow({ product_id: 2, seller_id: 20, quantity: 2, price: 300 }),
            cartRow({ product_id: 3, seller_id: 10, quantity: 1, price: 200 })
        ]);
        cartRepository.findProductById
            .mockResolvedValueOnce(productRow({ id: 1, price: 1000, stock: 5 }))
            .mockResolvedValueOnce(productRow({ id: 2, price: 300, stock: 5 }))
            .mockResolvedValueOnce(productRow({ id: 3, price: 200, stock: 5 }));
        orderRepository.createSplitOrder.mockResolvedValue({ parentOrderId: 500, childOrders: [] });

        const result = await orderService.checkout(1, {});

        expect(orderRepository.createOrder).not.toHaveBeenCalled();
        expect(orderRepository.createSplitOrder).toHaveBeenCalledTimes(1);

        const [, , , sellerGroups, totalAmount] = orderRepository.createSplitOrder.mock.calls[0];
        expect(totalAmount).toBe(1800); // 1000 + 600 + 200

        // Two sellers, correctly grouped and subtotaled - not flattened
        // and not cross-contaminated.
        expect(sellerGroups).toHaveLength(2);
        const seller10 = sellerGroups.find((g) => g.sellerId === 10);
        const seller20 = sellerGroups.find((g) => g.sellerId === 20);
        expect(seller10.items).toHaveLength(2);
        expect(seller10.subtotal).toBe(1200); // 1000 + 200
        expect(seller20.items).toHaveLength(1);
        expect(seller20.subtotal).toBe(600); // 300*2

        expect(result).toEqual({
            orderId: 500,
            orderNumber: expect.any(String),
            totalAmount: 1800,
            isMultiVendor: true,
            vendorCount: 2
        });
    });

    it("prefers discount_price over price when computing line totals", async () => {
        cartRepository.getCartByUser.mockResolvedValue([
            cartRow({ product_id: 1, seller_id: 10, quantity: 2, price: 1000, discount_price: 750 })
        ]);
        cartRepository.findProductById.mockResolvedValue(productRow({ id: 1, price: 1000, discount_price: 750, stock: 5 }));
        orderRepository.createOrder.mockResolvedValue(1);

        const result = await orderService.checkout(1, {});

        expect(result.totalAmount).toBe(1500); // 750*2, not 1000*2
        const [, , , cartItems] = orderRepository.createOrder.mock.calls[0];
        expect(cartItems[0].unit_price).toBe(750);
    });

    it("sends the multi-vendor notification message key with vendor count for split orders", async () => {
        cartRepository.getCartByUser.mockResolvedValue([
            cartRow({ product_id: 1, seller_id: 10 }),
            cartRow({ product_id: 2, seller_id: 20 })
        ]);
        cartRepository.findProductById
            .mockResolvedValueOnce(productRow({ id: 1 }))
            .mockResolvedValueOnce(productRow({ id: 2 }));
        orderRepository.createSplitOrder.mockResolvedValue({ parentOrderId: 7, childOrders: [] });

        await orderService.checkout(1, {});

        expect(notificationService.notify).toHaveBeenCalledWith(
            expect.objectContaining({
                messageKey: "notifications.order.placed.messageMultiVendor",
                messageParams: expect.objectContaining({ vendorCount: 2 }),
                relatedOrderId: 7
            })
        );
    });

    it("sends the single-vendor notification message key for standalone orders", async () => {
        cartRepository.getCartByUser.mockResolvedValue([cartRow({ product_id: 1, seller_id: 10 })]);
        cartRepository.findProductById.mockResolvedValue(productRow({ id: 1 }));
        orderRepository.createOrder.mockResolvedValue(42);

        await orderService.checkout(1, {});

        expect(notificationService.notify).toHaveBeenCalledWith(
            expect.objectContaining({
                messageKey: "notifications.order.placed.messageSingle",
                messageParams: expect.objectContaining({ vendorCount: 1 }),
                relatedOrderId: 42
            })
        );
    });

    it("does not let a fraud-evaluation failure fail or block checkout", async () => {
        cartRepository.getCartByUser.mockResolvedValue([cartRow({ product_id: 1, seller_id: 10 })]);
        cartRepository.findProductById.mockResolvedValue(productRow({ id: 1 }));
        orderRepository.createOrder.mockResolvedValue(1);
        fraudService.evaluateOrder.mockRejectedValue(new Error("fraud service down"));

        await expect(orderService.checkout(1, {})).resolves.toEqual(
            expect.objectContaining({ orderId: 1 })
        );
    });

    it("notifies admins via socket after a successful checkout", async () => {
        cartRepository.getCartByUser.mockResolvedValue([cartRow({ product_id: 1, seller_id: 10 })]);
        cartRepository.findProductById.mockResolvedValue(productRow({ id: 1 }));
        orderRepository.createOrder.mockResolvedValue(1);

        await orderService.checkout(1, {});

        expect(socket.emitToAdmins).toHaveBeenCalledWith("admin:stats_changed", { reason: "order_placed" });
    });
});

describe("order.service.getMyOrders", () => {
    it("delegates to the repository for the given buyer", async () => {
        orderRepository.findOrdersByBuyer.mockResolvedValue([{ id: 1 }]);

        const result = await orderService.getMyOrders(7);

        expect(orderRepository.findOrdersByBuyer).toHaveBeenCalledWith(7);
        expect(result).toEqual([{ id: 1 }]);
    });
});

describe("order.service.getOrderDetail", () => {
    it("rejects when the order does not exist", async () => {
        orderRepository.findOrderById.mockResolvedValue(undefined);

        await expect(orderService.getOrderDetail(1, 5)).rejects.toThrow("Order not found");
    });

    it("rejects when the order belongs to a different buyer", async () => {
        orderRepository.findOrderById.mockResolvedValue({ id: 1, buyer_id: 99, is_parent: false });

        await expect(orderService.getOrderDetail(1, 5)).rejects.toThrow("Order not found");
    });

    it("returns flat items for a non-parent order", async () => {
        orderRepository.findOrderById.mockResolvedValue({ id: 1, buyer_id: 5, is_parent: false });
        orderRepository.findOrderItems.mockResolvedValue([{ id: 1, name: "Widget" }]);

        const result = await orderService.getOrderDetail(1, 5);

        expect(result.items).toEqual([{ id: 1, name: "Widget" }]);
        expect(orderRepository.findChildOrders).not.toHaveBeenCalled();
    });

    it("returns each child order with its own items for a parent order", async () => {
        orderRepository.findOrderById.mockResolvedValue({ id: 1, buyer_id: 5, is_parent: true });
        orderRepository.findChildOrders.mockResolvedValue([
            { id: 2, seller_id: 10 },
            { id: 3, seller_id: 20 }
        ]);
        orderRepository.findOrderItems
            .mockImplementation(async (orderId) =>
                orderId === 2 ? [{ id: 1, name: "From seller 10" }] : [{ id: 2, name: "From seller 20" }]
            );

        const result = await orderService.getOrderDetail(1, 5);

        expect(result.children).toHaveLength(2);
        expect(result.children[0].items).toEqual([{ id: 1, name: "From seller 10" }]);
        expect(result.children[1].items).toEqual([{ id: 2, name: "From seller 20" }]);
    });
});

describe("order.service.cancelOrder", () => {
    it("rejects when the order does not exist or belongs to someone else", async () => {
        orderRepository.findOrderById.mockResolvedValue(undefined);
        await expect(orderService.cancelOrder(1, 5)).rejects.toThrow("Order not found");

        orderRepository.findOrderById.mockResolvedValue({ id: 1, buyer_id: 99 });
        await expect(orderService.cancelOrder(1, 5)).rejects.toThrow("Order not found");
    });

    it("refuses to cancel a single child order directly", async () => {
        orderRepository.findOrderById.mockResolvedValue({ id: 2, buyer_id: 5, parent_order_id: 1 });

        await expect(orderService.cancelOrder(2, 5)).rejects.toThrow(
            "Cancel the full order instead of a single vendor's part of it"
        );
        expect(orderRepository.updateOrderStatus).not.toHaveBeenCalled();
    });

    it("cancels every child and then the parent when all children are cancellable", async () => {
        orderRepository.findOrderById.mockResolvedValue({
            id: 1, buyer_id: 5, parent_order_id: null, is_parent: true, order_number: "ORD-1"
        });
        orderRepository.findChildOrders.mockResolvedValue([
            { id: 2, status: "pending", order_number: "ORD-1-V1" },
            { id: 3, status: "processing", order_number: "ORD-1-V2" }
        ]);

        await orderService.cancelOrder(1, 5);

        expect(orderRepository.updateOrderStatus).toHaveBeenCalledWith(2, "cancelled");
        expect(orderRepository.updateOrderStatus).toHaveBeenCalledWith(3, "cancelled");
        expect(orderRepository.updateOrderStatus).toHaveBeenCalledWith(1, "cancelled");
        expect(orderRepository.updateOrderStatus).toHaveBeenCalledTimes(3);
    });

    it("refuses to cancel a parent order when any child is past the cancellable window", async () => {
        orderRepository.findOrderById.mockResolvedValue({
            id: 1, buyer_id: 5, parent_order_id: null, is_parent: true, order_number: "ORD-1"
        });
        orderRepository.findChildOrders.mockResolvedValue([
            { id: 2, status: "pending", order_number: "ORD-1-V1" },
            { id: 3, status: "shipped", order_number: "ORD-1-V2" }
        ]);

        await expect(orderService.cancelOrder(1, 5)).rejects.toThrow(
            'Order can no longer be cancelled (vendor order ORD-1-V2 is "shipped")'
        );
        expect(orderRepository.updateOrderStatus).not.toHaveBeenCalled();
    });

    it("refuses to cancel a standalone order once it's past the cancellable window", async () => {
        orderRepository.findOrderById.mockResolvedValue({
            id: 1, buyer_id: 5, parent_order_id: null, is_parent: false, status: "delivered"
        });

        await expect(orderService.cancelOrder(1, 5)).rejects.toThrow(
            "Order can no longer be cancelled (status: delivered)"
        );
        expect(orderRepository.updateOrderStatus).not.toHaveBeenCalled();
    });

    it("cancels a standalone order while still cancellable and notifies the buyer", async () => {
        orderRepository.findOrderById.mockResolvedValue({
            id: 1, buyer_id: 5, parent_order_id: null, is_parent: false, status: "pending", order_number: "ORD-1"
        });

        await orderService.cancelOrder(1, 5);

        expect(orderRepository.updateOrderStatus).toHaveBeenCalledWith(1, "cancelled");
        expect(notificationService.notify).toHaveBeenCalledWith(
            expect.objectContaining({
                userId: 5,
                type: "order_cancelled",
                messageKey: "notifications.order.cancelled.message",
                relatedOrderId: 1
            })
        );
    });
});

describe("order.service.autoCancelStaleOrder", () => {
    it("cancels only the order itself when it has no children", async () => {
        await orderService.autoCancelStaleOrder({ id: 1, is_parent: false, buyer_id: 5, order_number: "ORD-1" });

        expect(orderRepository.findChildOrders).not.toHaveBeenCalled();
        expect(orderRepository.updateOrderStatus).toHaveBeenCalledWith(1, "cancelled");
        expect(orderRepository.updateOrderStatus).toHaveBeenCalledTimes(1);
    });

    it("cancels all children then the parent, without checking cancellable status (system-initiated)", async () => {
        orderRepository.findChildOrders.mockResolvedValue([{ id: 2 }, { id: 3 }]);

        await orderService.autoCancelStaleOrder({ id: 1, is_parent: true, buyer_id: 5, order_number: "ORD-1" });

        expect(orderRepository.updateOrderStatus).toHaveBeenCalledWith(2, "cancelled");
        expect(orderRepository.updateOrderStatus).toHaveBeenCalledWith(3, "cancelled");
        expect(orderRepository.updateOrderStatus).toHaveBeenCalledWith(1, "cancelled");
    });

    it("notifies the buyer using the unpaid-cancellation message key", async () => {
        await orderService.autoCancelStaleOrder({ id: 1, is_parent: false, buyer_id: 5, order_number: "ORD-1" });

        expect(notificationService.notify).toHaveBeenCalledWith(
            expect.objectContaining({
                userId: 5,
                messageKey: "notifications.order.cancelledUnpaid.message",
                relatedOrderId: 1
            })
        );
    });
});

describe("order.service.getSellerOrders", () => {
    it("delegates to the repository for the given seller", async () => {
        orderRepository.findOrdersBySeller.mockResolvedValue([{ id: 1 }]);

        const result = await orderService.getSellerOrders(10);

        expect(orderRepository.findOrdersBySeller).toHaveBeenCalledWith(10);
        expect(result).toEqual([{ id: 1 }]);
    });
});

describe("order.service.getSellerOrderDetail", () => {
    it("rejects when the order does not exist", async () => {
        orderRepository.findOrderById.mockResolvedValue(undefined);

        await expect(orderService.getSellerOrderDetail(1, 10)).rejects.toThrow("Order not found");
    });

    it("rejects when the seller has no items in the order (prevents cross-seller access)", async () => {
        orderRepository.findOrderById.mockResolvedValue({ id: 1 });
        orderRepository.sellerHasItemInOrder.mockResolvedValue(false);

        await expect(orderService.getSellerOrderDetail(1, 10)).rejects.toThrow("Order not found");
    });

    it("returns only seller-relevant fields, not the full order (no other buyers'/sellers' payment internals)", async () => {
        orderRepository.findOrderById.mockResolvedValue({
            id: 1,
            order_number: "ORD-1",
            status: "processing",
            payment_status: "paid",
            payment_method: "mobile_money",
            payment_reference: "SECRET-REF-123",
            shipping_address: "123 St",
            shipping_city: "Dar",
            shipping_region: "Dar",
            shipping_phone: "0700000000",
            created_at: "2026-01-01",
            buyer_id: 999
        });
        orderRepository.sellerHasItemInOrder.mockResolvedValue(true);
        orderRepository.findOrderItemsBySeller.mockResolvedValue([{ id: 1, name: "Widget" }]);

        const result = await orderService.getSellerOrderDetail(1, 10);

        expect(result).toEqual({
            id: 1,
            order_number: "ORD-1",
            status: "processing",
            payment_status: "paid",
            payment_method: "mobile_money",
            shipping_address: "123 St",
            shipping_city: "Dar",
            shipping_region: "Dar",
            shipping_phone: "0700000000",
            created_at: "2026-01-01",
            items: [{ id: 1, name: "Widget" }]
        });
        expect(result.payment_reference).toBeUndefined();
        expect(result.buyer_id).toBeUndefined();
    });
});

describe("order.service.updateOrderStatusBySeller", () => {
    it("rejects when the order does not exist", async () => {
        orderRepository.findOrderById.mockResolvedValue(undefined);

        await expect(orderService.updateOrderStatusBySeller(1, 10, "processing")).rejects.toThrow("Order not found");
    });

    it("rejects when the seller has no items in the order", async () => {
        orderRepository.findOrderById.mockResolvedValue({ id: 1, status: "pending" });
        orderRepository.sellerHasItemInOrder.mockResolvedValue(false);

        await expect(orderService.updateOrderStatusBySeller(1, 10, "processing")).rejects.toThrow("Order not found");
    });

    it("rejects a status transition that isn't allowed from the current status", async () => {
        orderRepository.findOrderById.mockResolvedValue({ id: 1, status: "pending", buyer_id: 5, order_number: "ORD-1" });
        orderRepository.sellerHasItemInOrder.mockResolvedValue(true);

        await expect(orderService.updateOrderStatusBySeller(1, 10, "delivered")).rejects.toThrow(
            'Cannot move order from "pending" to "delivered"'
        );
        expect(orderRepository.updateOrderStatus).not.toHaveBeenCalled();
    });

    it("assigns a roster agent on shipment: prices the delivery, marks it 'own', and notifies the agent", async () => {
        orderRepository.findOrderById.mockResolvedValue({
            id: 1, status: "processing", buyer_id: 5, order_number: "ORD-1"
        });
        orderRepository.sellerHasItemInOrder.mockResolvedValue(true);
        sellerRepository.isInRoster.mockResolvedValue(true);
        deliveryRepository.findByOrderId.mockResolvedValue(undefined);
        deliveryPricingService.calculateDeliveryFee.mockResolvedValue({
            fee: 5000, distanceKm: 8.2, durationMinutes: 15, routingProvider: "osrm"
        });

        await orderService.updateOrderStatusBySeller(1, 10, "shipped", 77);

        expect(sellerRepository.isInRoster).toHaveBeenCalledWith(10, 77);
        expect(orderRepository.setDeliveryMode).toHaveBeenCalledWith(1, "own");
        expect(deliveryRepository.create).toHaveBeenCalledWith(1, 77, 5000, 8.2, 15, "osrm");
        expect(deliveryService.startMatching).not.toHaveBeenCalled();
        expect(orderRepository.updateOrderStatus).toHaveBeenCalledWith(1, "shipped");
        expect(notificationService.notify).toHaveBeenCalledWith(
            expect.objectContaining({ userId: 77, type: "delivery_assigned", relatedOrderId: 1 })
        );
    });

    it("rejects assigning an agent who isn't in the seller's roster", async () => {
        orderRepository.findOrderById.mockResolvedValue({
            id: 1, status: "processing", buyer_id: 5, order_number: "ORD-1"
        });
        orderRepository.sellerHasItemInOrder.mockResolvedValue(true);
        sellerRepository.isInRoster.mockResolvedValue(false);

        await expect(orderService.updateOrderStatusBySeller(1, 10, "shipped", 77)).rejects.toThrow(
            "That agent isn't in your delivery roster"
        );
        expect(orderRepository.updateOrderStatus).not.toHaveBeenCalled();
        expect(deliveryRepository.create).not.toHaveBeenCalled();
    });

    it("rejects assigning a roster agent when the order already has a delivery", async () => {
        orderRepository.findOrderById.mockResolvedValue({
            id: 1, status: "processing", buyer_id: 5, order_number: "ORD-1"
        });
        orderRepository.sellerHasItemInOrder.mockResolvedValue(true);
        sellerRepository.isInRoster.mockResolvedValue(true);
        deliveryRepository.findByOrderId.mockResolvedValue({ id: 900 });

        await expect(orderService.updateOrderStatusBySeller(1, 10, "shipped", 77)).rejects.toThrow(
            "This order already has a delivery assigned"
        );
        expect(deliveryRepository.create).not.toHaveBeenCalled();
        expect(orderRepository.updateOrderStatus).not.toHaveBeenCalled();
    });

    it("kicks off nearest-agent matching when shipped without a specific roster agent", async () => {
        orderRepository.findOrderById.mockResolvedValue({
            id: 1, status: "processing", buyer_id: 5, order_number: "ORD-1"
        });
        orderRepository.sellerHasItemInOrder.mockResolvedValue(true);
        deliveryService.startMatching.mockResolvedValue(undefined);

        await orderService.updateOrderStatusBySeller(1, 10, "shipped");

        expect(sellerRepository.isInRoster).not.toHaveBeenCalled();
        expect(deliveryService.startMatching).toHaveBeenCalledWith(1);
        expect(orderRepository.updateOrderStatus).toHaveBeenCalledWith(1, "shipped");
    });

    it("does not let a matching failure block or fail the status update (fire-and-forget)", async () => {
        orderRepository.findOrderById.mockResolvedValue({
            id: 1, status: "processing", buyer_id: 5, order_number: "ORD-1"
        });
        orderRepository.sellerHasItemInOrder.mockResolvedValue(true);
        deliveryService.startMatching.mockRejectedValue(new Error("no agents nearby"));

        await expect(orderService.updateOrderStatusBySeller(1, 10, "shipped")).resolves.toBeUndefined();
    });

    it("notifies the buyer on a plain status update", async () => {
        orderRepository.findOrderById.mockResolvedValue({
            id: 1, status: "pending", buyer_id: 5, order_number: "ORD-1"
        });
        orderRepository.sellerHasItemInOrder.mockResolvedValue(true);

        await orderService.updateOrderStatusBySeller(1, 10, "processing");

        expect(orderRepository.updateOrderStatus).toHaveBeenCalledWith(1, "processing");
        expect(notificationService.notify).toHaveBeenCalledWith(
            expect.objectContaining({
                userId: 5,
                type: "order_status_update",
                messageParams: { orderNumber: "ORD-1", status: "processing" },
                relatedOrderId: 1
            })
        );
    });
});
