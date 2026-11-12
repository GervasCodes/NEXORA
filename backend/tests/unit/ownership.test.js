// Object-level ownership: user B must not read or change user A's order, booking, dispute, saved address,
// payment or conversation. The route role guards (roleMatrix.test.js) only stop the wrong KIND of user;
// these tests cover the SAME kind of user reaching for someone else's record, at the service layer where
// the check lives. Repositories are mocked, so each test states what the database "holds" and asserts
// that the stranger is refused and nothing is written.
jest.mock("../../src/config/db", () => require("../helpers/mockDb"));
jest.mock("../../src/modules/order/order.repository");
jest.mock("../../src/modules/booking/booking.repository");
jest.mock("../../src/modules/dispute/dispute.repository");
jest.mock("../../src/modules/buyerAddress/buyerAddress.repository");
jest.mock("../../src/modules/payment/payment.repository");
jest.mock("../../src/modules/chat/chat.repository");

const orderRepository = require("../../src/modules/order/order.repository");
const bookingRepository = require("../../src/modules/booking/booking.repository");
const disputeRepository = require("../../src/modules/dispute/dispute.repository");
const addressRepository = require("../../src/modules/buyerAddress/buyerAddress.repository");
const paymentRepository = require("../../src/modules/payment/payment.repository");
const chatRepository = require("../../src/modules/chat/chat.repository");

const orderService = require("../../src/modules/order/order.service");
const bookingService = require("../../src/modules/booking/booking.service");
const disputeService = require("../../src/modules/dispute/dispute.service");
const addressService = require("../../src/modules/buyerAddress/buyerAddress.service");
const paymentService = require("../../src/modules/payment/payment.service");
const chatService = require("../../src/modules/chat/chat.service");

const OWNER = 1;
const STRANGER = 2;
const OTHER_SELLER = 3;

beforeEach(() => jest.clearAllMocks());

describe("orders", () => {
    const order = { id: 10, buyer_id: OWNER, status: "pending", payment_method: "cash_on_delivery", payment_status: "unpaid", is_parent: 0 };
    beforeEach(() => {
        orderRepository.findOrderById.mockResolvedValue(order);
        orderRepository.findOrderItems.mockResolvedValue([]);
        orderRepository.sellerHasItemInOrder.mockResolvedValue(false);
    });

    it("another buyer cannot read the order", async () => {
        await expect(orderService.getOrderDetail(10, STRANGER)).rejects.toThrow("Order not found");
    });
    it("the owner can", async () => {
        await expect(orderService.getOrderDetail(10, OWNER)).resolves.toMatchObject({ id: 10 });
    });
    it("another buyer cannot cancel the order", async () => {
        await expect(orderService.cancelOrder(10, STRANGER)).rejects.toThrow("Order not found");
    });
    it("a seller with no item in the order cannot read it", async () => {
        await expect(orderService.getSellerOrderDetail(10, OTHER_SELLER)).rejects.toThrow("Order not found");
    });
    it("a seller who does have an item in the order can", async () => {
        orderRepository.sellerHasItemInOrder.mockResolvedValue(true);
        await expect(orderService.getSellerOrderDetail(10, OTHER_SELLER)).resolves.toMatchObject({ id: 10 });
    });
    it("a missing order and someone else's order look the same (no existence leak)", async () => {
        orderRepository.findOrderById.mockResolvedValue(undefined);
        const missing = await orderService.getOrderDetail(999, STRANGER).catch((e) => e.message);
        orderRepository.findOrderById.mockResolvedValue(order);
        const foreign = await orderService.getOrderDetail(10, STRANGER).catch((e) => e.message);
        expect(foreign).toBe(missing);
    });
});

describe("bookings", () => {
    const booking = { id: 20, customer_id: OWNER, provider_id: 5, status: "pending", service_id: 1 };
    beforeEach(() => bookingRepository.findById.mockResolvedValue(booking));

    it("a stranger cannot read the booking", async () => {
        await expect(bookingService.getBookingById(20, STRANGER)).rejects.toThrow("Booking not found");
    });
    it("a stranger cannot cancel the booking and nothing is written", async () => {
        await expect(bookingService.cancelBooking(20, STRANGER)).rejects.toThrow("Booking not found");
        expect(bookingRepository.cancelBooking).not.toHaveBeenCalled();
    });
    it("a stranger cannot read the booking's payment", async () => {
        await expect(paymentService.getBookingPayment(20, STRANGER)).rejects.toThrow("Booking not found");
        expect(paymentRepository.findByBookingId).not.toHaveBeenCalled();
    });
    it("the customer and the provider are let through the access check", async () => {
        paymentRepository.findByBookingId.mockResolvedValue({ id: 1 });
        await expect(paymentService.getBookingPayment(20, OWNER)).resolves.toEqual({ id: 1 });
        await expect(paymentService.getBookingPayment(20, 5)).resolves.toEqual({ id: 1 });
    });
});

describe("disputes", () => {
    const dispute = { id: 30, buyer_id: OWNER, seller_id: OTHER_SELLER, dispute_number: "D-1", order_id: 10 };
    beforeEach(() => disputeRepository.findById.mockResolvedValue(dispute));

    it("a different buyer is refused", async () => {
        await expect(disputeService.getDisputeDetail(30, STRANGER, "buyer")).rejects.toThrow("do not have access");
    });
    it("a different seller is refused", async () => {
        await expect(disputeService.getDisputeDetail(30, 99, "seller")).rejects.toThrow("do not have access");
    });
    it("the buyer's id presented with the seller role is refused (role is not interchangeable with identity)", async () => {
        await expect(disputeService.getDisputeDetail(30, OWNER, "seller")).rejects.toThrow("do not have access");
    });
    it("a delivery agent is refused", async () => {
        await expect(disputeService.getDisputeDetail(30, 7, "delivery_agent")).rejects.toThrow("do not have access");
    });
    it("the buyer, the seller and an admin pass the access check", async () => {
        for (const [id, role] of [[OWNER, "buyer"], [OTHER_SELLER, "seller"], [50, "admin"]]) {
            const outcome = await disputeService.getDisputeDetail(30, id, role).catch((e) => e.message);
            expect(String(outcome)).not.toMatch(/do not have access/);
        }
    });
});

describe("saved addresses", () => {
    it("lookups are always scoped to the caller, and another user's address is 'not found'", async () => {
        addressRepository.findById.mockResolvedValue(undefined); // the repository filters by user id
        await expect(addressService.update(40, STRANGER, { city: "X" })).rejects.toThrow("Address not found");
        await expect(addressService.remove(40, STRANGER)).rejects.toThrow("Address not found");
        expect(addressRepository.findById).toHaveBeenCalledWith(40, STRANGER);
        expect(addressRepository.update).not.toHaveBeenCalled();
        expect(addressRepository.remove).not.toHaveBeenCalled();
    });
});

describe("order payments", () => {
    beforeEach(() => {
        orderRepository.findOrderById.mockResolvedValue({ id: 10, buyer_id: OWNER });
        orderRepository.sellerHasItemInOrder.mockResolvedValue(false);
    });
    it("another buyer cannot read the payment record", async () => {
        await expect(paymentService.getPayment(10, STRANGER)).rejects.toThrow("Order not found");
        expect(paymentRepository.findByOrderId).not.toHaveBeenCalled();
    });
});

describe("conversations", () => {
    const conversation = { id: 50, buyer_id: OWNER, seller_id: OTHER_SELLER, delivery_agent_id: 7 };
    beforeEach(() => chatRepository.findConversationById.mockResolvedValue(conversation));

    it("a stranger cannot read the messages, delete messages or delete the conversation", async () => {
        await expect(chatService.getMessages(50, STRANGER)).rejects.toThrow("Conversation not found");
        await expect(chatService.deleteConversation(50, STRANGER)).rejects.toThrow("Conversation not found");
        await expect(chatService.deleteMessage(50, 1, STRANGER)).rejects.toThrow("Conversation not found");
        expect(chatRepository.findMessages).not.toHaveBeenCalled();
    });
    it("the buyer, the seller and the delivery agent are participants", async () => {
        for (const id of [OWNER, OTHER_SELLER, 7]) {
            await expect(chatService.assertParticipant(50, id)).resolves.toBeTruthy();
        }
    });
});
