jest.mock("../../../src/modules/broadcast/broadcast.repository");

const broadcastRepository = require("../../../src/modules/broadcast/broadcast.repository");
const brevoWebhookController = require("../../../src/modules/broadcast/brevoWebhook.controller");

const mockRes = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
};

beforeEach(() => {
    jest.clearAllMocks();
    broadcastRepository.recordDeliveryEvent.mockResolvedValue(undefined);
});

describe("brevoWebhook.handleEvent", () => {
    it("records a single delivered event", async () => {
        const req = { body: { event: "delivered", email: "a@x.com", "message-id": "<abc@brevo>" } };
        const res = mockRes();

        await brevoWebhookController.handleEvent(req, res);

        expect(broadcastRepository.recordDeliveryEvent).toHaveBeenCalledWith({
            eventType: "delivered",
            recipientEmail: "a@x.com",
            brevoMessageId: "<abc@brevo>",
            rawEvent: req.body
        });
        expect(res.status).toHaveBeenCalledWith(200);
    });

    it.each([
        ["hard_bounce", "hard_bounce"],
        ["soft_bounce", "soft_bounce"],
        ["blocked", "hard_bounce"],
        ["spam", "spam"],
        ["unsubscribed", "other"],
        ["click", "other"]
    ])("maps Brevo event '%s' to event_type '%s'", async (brevoEvent, expectedType) => {
        const req = { body: { event: brevoEvent, email: "a@x.com" } };
        const res = mockRes();

        await brevoWebhookController.handleEvent(req, res);

        expect(broadcastRepository.recordDeliveryEvent).toHaveBeenCalledWith(
            expect.objectContaining({ eventType: expectedType, recipientEmail: "a@x.com" })
        );
    });

    it("handles a batch payload (an array of events)", async () => {
        const req = {
            body: [
                { event: "delivered", email: "a@x.com" },
                { event: "hard_bounce", email: "b@x.com" }
            ]
        };
        const res = mockRes();

        await brevoWebhookController.handleEvent(req, res);

        expect(broadcastRepository.recordDeliveryEvent).toHaveBeenCalledTimes(2);
        expect(res.status).toHaveBeenCalledWith(200);
    });

    it("handles a { events: [...] } wrapper payload", async () => {
        const req = { body: { events: [{ event: "delivered", email: "a@x.com" }] } };
        const res = mockRes();

        await brevoWebhookController.handleEvent(req, res);

        expect(broadcastRepository.recordDeliveryEvent).toHaveBeenCalledTimes(1);
    });

    it("skips malformed entries (no email) without throwing", async () => {
        const req = { body: [{ event: "delivered" }, { event: "delivered", email: "ok@x.com" }] };
        const res = mockRes();

        await brevoWebhookController.handleEvent(req, res);

        expect(broadcastRepository.recordDeliveryEvent).toHaveBeenCalledTimes(1);
        expect(res.status).toHaveBeenCalledWith(200);
    });

    it("still responds 200 if recording an event fails, so Brevo doesn't retry-storm", async () => {
        broadcastRepository.recordDeliveryEvent.mockRejectedValueOnce(new Error("db down"));
        const req = { body: { event: "delivered", email: "a@x.com" } };
        const res = mockRes();

        await brevoWebhookController.handleEvent(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
    });
});
