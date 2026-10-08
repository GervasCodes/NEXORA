jest.mock("../../../src/modules/broadcast/broadcast.repository");
jest.mock("../../../src/utils/sendEmail");
jest.mock("../../../src/modules/sms/providers/sms.provider");
jest.mock("../../../src/modules/whatsapp/providers/whatsapp.provider");
jest.mock("../../../src/modules/notification/notification.service");
jest.mock("../../../src/modules/audit/audit.service");

const broadcastRepository = require("../../../src/modules/broadcast/broadcast.repository");
const sendEmail = require("../../../src/utils/sendEmail");
const smsProvider = require("../../../src/modules/sms/providers/sms.provider");
const whatsappProvider = require("../../../src/modules/whatsapp/providers/whatsapp.provider");
const notificationService = require("../../../src/modules/notification/notification.service");
const auditService = require("../../../src/modules/audit/audit.service");

const broadcastService = require("../../../src/modules/broadcast/broadcast.service");

const recipient = (overrides = {}) => ({
    id: 1, email: "buyer@example.com", phone: "0700000000", language: "en",
    whatsapp_order_updates: 1, ...overrides
});

beforeEach(() => {
    jest.clearAllMocks();
    // sendEmail now resolves `true` on an actual successful send (see
    // utils/sendEmail.js) - broadcast.service.js only increments
    // emailSentCount when it gets `true` back, so the default mock here
    // has to match that "it worked" shape rather than `undefined`.
    sendEmail.mockResolvedValue(true);
    smsProvider.sendText.mockResolvedValue(undefined);
    whatsappProvider.sendText.mockResolvedValue(undefined);
    notificationService.notify.mockResolvedValue(undefined);
    broadcastRepository.create.mockResolvedValue(1);
});

describe("broadcast.service.previewAudience", () => {
    it("rejects an unknown segment", async () => {
        await expect(broadcastService.previewAudience("everyone_but_admins")).rejects.toThrow("Unknown segment");
        expect(broadcastRepository.countRecipientsBySegment).not.toHaveBeenCalled();
    });

    it.each([
        ["all_sellers"],
        ["all_buyers"],
        ["all_delivery_agents"],
        ["everyone"]
    ])("resolves the recipient count for %s from the repository", async (segment) => {
        broadcastRepository.countRecipientsBySegment.mockResolvedValue(42);

        const result = await broadcastService.previewAudience(segment);

        expect(broadcastRepository.countRecipientsBySegment).toHaveBeenCalledWith(segment);
        expect(result).toEqual({ segment, recipientCount: 42 });
    });
});

describe("broadcast.service.resolveChannelsForRecipient", () => {
    it("includes email only when the recipient has an email and it was requested", () => {
        expect(broadcastService.resolveChannelsForRecipient(
            recipient({ email: "a@b.com" }), ["email"]
        )).toEqual(["email"]);

        expect(broadcastService.resolveChannelsForRecipient(
            recipient({ email: null }), ["email"]
        )).toEqual([]);
    });

    it("includes sms only when the recipient has a phone and it was requested", () => {
        expect(broadcastService.resolveChannelsForRecipient(
            recipient({ phone: "0700000000" }), ["sms"]
        )).toEqual(["sms"]);

        expect(broadcastService.resolveChannelsForRecipient(
            recipient({ phone: null }), ["sms"]
        )).toEqual([]);
    });

    it("includes whatsapp only when the recipient has a phone AND has opted into WhatsApp updates", () => {
        expect(broadcastService.resolveChannelsForRecipient(
            recipient({ phone: "0700000000", whatsapp_order_updates: 1 }), ["whatsapp"]
        )).toEqual(["whatsapp"]);

        expect(broadcastService.resolveChannelsForRecipient(
            recipient({ phone: "0700000000", whatsapp_order_updates: 0 }), ["whatsapp"]
        )).toEqual([]);

        expect(broadcastService.resolveChannelsForRecipient(
            recipient({ phone: null, whatsapp_order_updates: 1 }), ["whatsapp"]
        )).toEqual([]);
    });

    it("includes in_app for every recipient when requested, with no email/phone precondition", () => {
        expect(broadcastService.resolveChannelsForRecipient(
            recipient({ email: null, phone: null, whatsapp_order_updates: 0 }), ["in_app"]
        )).toEqual(["in_app"]);

        expect(broadcastService.resolveChannelsForRecipient(
            recipient(), ["in_app"]
        )).toEqual(["in_app"]);

        // not requested -> not included, even though the recipient is "eligible"
        expect(broadcastService.resolveChannelsForRecipient(
            recipient(), ["email"]
        )).toEqual(["email"]);
    });

    it("never includes a channel that wasn't requested, even if the recipient is eligible for it", () => {
        expect(broadcastService.resolveChannelsForRecipient(
            recipient(), ["email"]
        )).toEqual(["email"]);
    });

    it("returns every eligible channel when several were requested", () => {
        expect(broadcastService.resolveChannelsForRecipient(
            recipient(), ["email", "sms", "whatsapp"]
        )).toEqual(["email", "sms", "whatsapp"]);
    });
});

describe("broadcast.service.resolveChannelContent", () => {
    it("falls back every per-channel field to the shared subject/message when left blank", () => {
        expect(broadcastService.resolveChannelContent({ subject: "Sale", message: "20% off" })).toEqual({
            email: { subject: "Sale", message: "20% off" },
            sms: "20% off",
            whatsapp: "20% off",
            inApp: { title: "Sale", message: "20% off" }
        });
    });

    it("uses each channel's own override when the admin filled it in", () => {
        const content = broadcastService.resolveChannelContent({
            subject: "Sale", message: "20% off everything this weekend, free delivery over 50,000 TZS",
            smsMessage: "20% off this weekend. nexora.co.tz",
            whatsappMessage: "Hey! 20% off everything this weekend 🎉",
            inAppTitle: "Weekend sale",
            inAppMessage: "20% off is live"
        });

        expect(content.sms).toBe("20% off this weekend. nexora.co.tz");
        expect(content.whatsapp).toBe("Hey! 20% off everything this weekend 🎉");
        expect(content.inApp).toEqual({ title: "Weekend sale", message: "20% off is live" });
        // email is untouched by the other channels' overrides
        expect(content.email).toEqual({ subject: "Sale", message: "20% off everything this weekend, free delivery over 50,000 TZS" });
    });

    it("falls back to 'Announcement' for the in-app title when there's no title AND no subject (non-email sends)", () => {
        const content = broadcastService.resolveChannelContent({ message: "Hello" });
        expect(content.inApp.title).toBe("Announcement");
    });
});

describe("broadcast.service.sendBroadcast", () => {
    it("rejects an unknown segment before touching the repository", async () => {
        await expect(broadcastService.sendBroadcast({
            adminId: 1, segment: "everyone_but_admins", channels: ["email"], subject: "Hi", message: "Hello"
        })).rejects.toThrow("Unknown segment");
        expect(broadcastRepository.findRecipientsBySegment).not.toHaveBeenCalled();
    });

    it("rejects an empty channel list", async () => {
        await expect(broadcastService.sendBroadcast({
            adminId: 1, segment: "all_buyers", channels: [], subject: "Hi", message: "Hello"
        })).rejects.toThrow("At least one channel is required");
    });

    it("rejects an unknown channel", async () => {
        await expect(broadcastService.sendBroadcast({
            adminId: 1, segment: "all_buyers", channels: ["carrier_pigeon"], message: "Hello"
        })).rejects.toThrow("Unknown channel(s)");
    });

    it("requires a subject when email is one of the channels", async () => {
        await expect(broadcastService.sendBroadcast({
            adminId: 1, segment: "all_buyers", channels: ["email"], message: "Hello"
        })).rejects.toThrow("A subject is required when sending by email");
    });

    it("requires a non-empty message", async () => {
        await expect(broadcastService.sendBroadcast({
            adminId: 1, segment: "all_buyers", channels: ["sms"], message: "   "
        })).rejects.toThrow("Message is required");
    });

    it("only messages recipients eligible for the requested channels, and counts each channel correctly", async () => {
        broadcastRepository.findRecipientsBySegment.mockResolvedValue([
            recipient({ id: 1, email: "a@x.com", phone: "0700000001", whatsapp_order_updates: 1 }),
            recipient({ id: 2, email: null, phone: "0700000002", whatsapp_order_updates: 0 }), // sms only
            recipient({ id: 3, email: "c@x.com", phone: null, whatsapp_order_updates: 1 }) // email only
        ]);

        const result = await broadcastService.sendBroadcast({
            adminId: 9, segment: "all_buyers", channels: ["email", "sms", "whatsapp"],
            subject: "Sale", message: "20% off this weekend"
        });

        expect(broadcastRepository.findRecipientsBySegment).toHaveBeenCalledWith("all_buyers");

        // recipient 1: email + sms + whatsapp; recipient 2: sms only; recipient 3: email only
        expect(sendEmail).toHaveBeenCalledTimes(2);
        // Marketing sends never enter the retry queue ({ retry: false }): a
        // failed broadcast email is dropped rather than retried hours later.
        // Routed through renderEmail() (same branded template as every other
        // transactional email) rather than a bare html=undefined fallback,
        // so the broadcast carries the logo - the html arg is now the
        // rendered template, not undefined.
        expect(sendEmail).toHaveBeenCalledWith(
            "a@x.com", "Sale",
            expect.stringContaining("20% off this weekend"),
            expect.stringContaining("20% off this weekend"),
            { retry: false }
        );
        expect(sendEmail).toHaveBeenCalledWith(
            "c@x.com", "Sale",
            expect.stringContaining("20% off this weekend"),
            expect.stringContaining("20% off this weekend"),
            { retry: false }
        );
        // The html body is the real branded template, not the bare
        // paragraph fallback - this is the logo-in-broadcast-emails fix.
        const [, , , emailHtml] = sendEmail.mock.calls[0];
        expect(emailHtml).toContain("nexora-logo.png");

        expect(smsProvider.sendText).toHaveBeenCalledTimes(2);
        expect(smsProvider.sendText).toHaveBeenCalledWith("0700000001", "20% off this weekend");
        expect(smsProvider.sendText).toHaveBeenCalledWith("0700000002", "20% off this weekend");

        expect(whatsappProvider.sendText).toHaveBeenCalledTimes(1);
        expect(whatsappProvider.sendText).toHaveBeenCalledWith("0700000001", "20% off this weekend");

        expect(result).toEqual({
            broadcastId: 1,
            segment: "all_buyers",
            recipientCount: 3,
            emailSentCount: 2,
            smsSentCount: 2,
            whatsappSentCount: 1,
            inAppSentCount: 0
        });

        expect(broadcastRepository.create).toHaveBeenCalledWith(expect.objectContaining({
            adminId: 9, segment: "all_buyers", channels: ["email", "sms", "whatsapp"],
            subject: "Sale", message: "20% off this weekend",
            recipientCount: 3, emailSentCount: 2, smsSentCount: 2, whatsappSentCount: 1
        }));

        expect(auditService.log).toHaveBeenCalledWith(expect.objectContaining({
            userId: 9, eventType: "broadcast_sent"
        }));
    });

    it("keeps sending to the rest of the segment when one recipient's send throws", async () => {
        broadcastRepository.findRecipientsBySegment.mockResolvedValue([
            recipient({ id: 1, email: "a@x.com" }),
            recipient({ id: 2, email: "b@x.com" })
        ]);
        sendEmail.mockRejectedValueOnce(new Error("bounced")).mockResolvedValueOnce(true);

        const result = await broadcastService.sendBroadcast({
            adminId: 1, segment: "all_buyers", channels: ["email"], subject: "Hi", message: "Hello"
        });

        expect(sendEmail).toHaveBeenCalledTimes(2);
        expect(result.emailSentCount).toBe(1); // only the successful one counted
        expect(result.recipientCount).toBe(2); // audience size is unaffected by individual failures
    });

    // Regression test for the real bug: sendEmail({retry:false}) never
    // actually throws (it catches the provider error itself and resolves
    // `false` - see utils/sendEmail.js), so a broadcast could previously
    // show "email N/N sent" while every single one had silently failed
    // at the provider. emailSentCount must only count a `true` result.
    it("does not count an email as sent when sendEmail resolves false (a swallowed provider failure)", async () => {
        broadcastRepository.findRecipientsBySegment.mockResolvedValue([
            recipient({ id: 1, email: "a@x.com" }),
            recipient({ id: 2, email: "b@x.com" })
        ]);
        sendEmail.mockResolvedValueOnce(false).mockResolvedValueOnce(true);

        const result = await broadcastService.sendBroadcast({
            adminId: 1, segment: "all_buyers", channels: ["email"], subject: "Hi", message: "Hello"
        });

        expect(sendEmail).toHaveBeenCalledTimes(2);
        expect(result.emailSentCount).toBe(1);
    });

    it("creates an in-app notification for a recipient with no email or phone on file", async () => {
        broadcastRepository.findRecipientsBySegment.mockResolvedValue([
            recipient({ id: 7, email: null, phone: null, whatsapp_order_updates: 0 })
        ]);

        const result = await broadcastService.sendBroadcast({
            adminId: 1, segment: "all_buyers", channels: ["in_app"], message: "Big sale this weekend"
        });

        expect(notificationService.notify).toHaveBeenCalledTimes(1);
        expect(notificationService.notify).toHaveBeenCalledWith(expect.objectContaining({
            userId: 7, message: "Big sale this weekend"
        }));
        expect(sendEmail).not.toHaveBeenCalled();
        expect(smsProvider.sendText).not.toHaveBeenCalled();
        expect(whatsappProvider.sendText).not.toHaveBeenCalled();

        expect(result).toEqual(expect.objectContaining({ recipientCount: 1, inAppSentCount: 1 }));
        expect(broadcastRepository.create).toHaveBeenCalledWith(expect.objectContaining({ inAppSentCount: 1 }));
    });

    it("sends each channel's own override content, not the shared message, when provided", async () => {
        broadcastRepository.findRecipientsBySegment.mockResolvedValue([
            recipient({ id: 1, email: "a@x.com", phone: "0700000001", whatsapp_order_updates: 1 })
        ]);

        await broadcastService.sendBroadcast({
            adminId: 1, segment: "all_buyers", channels: ["sms", "whatsapp", "in_app"],
            message: "Shared fallback body",
            smsMessage: "Short SMS version",
            whatsappMessage: "Longer WhatsApp version with an emoji 🎉",
            inAppTitle: "New in the app",
            inAppMessage: "Short in-app line"
        });

        expect(smsProvider.sendText).toHaveBeenCalledWith("0700000001", "Short SMS version");
        expect(whatsappProvider.sendText).toHaveBeenCalledWith("0700000001", "Longer WhatsApp version with an emoji 🎉");
        expect(notificationService.notify).toHaveBeenCalledWith(expect.objectContaining({
            title: "New in the app", message: "Short in-app line"
        }));

        expect(broadcastRepository.create).toHaveBeenCalledWith(expect.objectContaining({
            smsMessage: "Short SMS version",
            whatsappMessage: "Longer WhatsApp version with an emoji 🎉",
            inAppTitle: "New in the app",
            inAppMessage: "Short in-app line"
        }));
    });

    it("resolves an empty segment (0 recipients) without error", async () => {
        broadcastRepository.findRecipientsBySegment.mockResolvedValue([]);

        const result = await broadcastService.sendBroadcast({
            adminId: 1, segment: "all_delivery_agents", channels: ["sms"], message: "Hello"
        });

        expect(result).toEqual(expect.objectContaining({ recipientCount: 0, smsSentCount: 0 }));
    });
});
