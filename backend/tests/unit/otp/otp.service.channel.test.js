// One-time code channels (Phase 9). SMS and WhatsApp are optional and env
// gated; a channel that is missing or fails must not throw, must not switch
// channels silently, and must not kill a code the user already received.

jest.mock("bcrypt", () => ({
    hash: jest.fn(async (value) => `hashed:${value}`),
    compare: jest.fn()
}));

jest.mock("../../../src/modules/otp/otp.repository", () => ({
    countRecent: jest.fn(async () => 0),
    create: jest.fn(async () => 11),
    invalidateOthers: jest.fn(async () => {}),
    consume: jest.fn(async () => {}),
    findActive: jest.fn(),
    incrementAttempts: jest.fn(),
    invalidateActive: jest.fn()
}));

jest.mock("../../../src/config/brevo", () => ({
    sendTransactionalEmail: jest.fn(async () => ({}))
}));

jest.mock("../../../src/modules/sms/providers/sms.provider", () => ({
    isConfigured: jest.fn(() => true),
    sendText: jest.fn(async () => ({ success: true }))
}));

jest.mock("../../../src/modules/whatsapp/providers/whatsapp.provider", () => ({
    isConfigured: jest.fn(() => true),
    sendOtpTemplate: jest.fn(async () => ({ success: true }))
}));

jest.mock("../../../src/utils/logger", () => ({
    child: () => ({ warn: jest.fn(), error: jest.fn(), info: jest.fn() })
}));

const otpService = require("../../../src/modules/otp/otp.service");
const otpRepository = require("../../../src/modules/otp/otp.repository");
const { sendTransactionalEmail } = require("../../../src/config/brevo");
const smsProvider = require("../../../src/modules/sms/providers/sms.provider");
const whatsappProvider = require("../../../src/modules/whatsapp/providers/whatsapp.provider");

const user = {
    id: 7,
    email: "buyer@example.com",
    phone: "+255700000001",
    first_name: "Asha",
    last_name: "Juma",
    language: "en"
};

beforeEach(() => {
    jest.clearAllMocks();
    smsProvider.isConfigured.mockReturnValue(true);
    whatsappProvider.isConfigured.mockReturnValue(true);
    process.env.WHATSAPP_OTP_TEMPLATE_NAME = "nexora_otp";
});

test("email is the default channel and delivers the code", async () => {
    const result = await otpService.requestOtp(user, "login");

    expect(result).toMatchObject({ channel: "email", delivered: true });
    expect(sendTransactionalEmail).toHaveBeenCalledTimes(1);
    expect(otpRepository.invalidateOthers).toHaveBeenCalledWith(user.id, "login", 11);
});

test("an unconfigured SMS channel reports failure without sending or switching channel", async () => {
    smsProvider.isConfigured.mockReturnValue(false);

    const result = await otpService.requestOtp(user, "login", { channel: "sms" });

    expect(result).toMatchObject({ channel: "sms", delivered: false, reason: "not_available" });
    expect(smsProvider.sendText).not.toHaveBeenCalled();
    expect(sendTransactionalEmail).not.toHaveBeenCalled();
    expect(otpRepository.consume).toHaveBeenCalledWith(11);
});

test("a failed WhatsApp send is reported, not thrown, and an older code is kept alive", async () => {
    whatsappProvider.sendOtpTemplate.mockResolvedValueOnce({ success: false });

    const result = await otpService.requestOtp(user, "password_reset", { channel: "whatsapp" });

    expect(result).toMatchObject({ channel: "whatsapp", delivered: false, reason: "send_failed" });
    expect(sendTransactionalEmail).not.toHaveBeenCalled();
    expect(otpRepository.invalidateOthers).not.toHaveBeenCalled();
    expect(otpRepository.consume).toHaveBeenCalledWith(11);
});

test("SMS sends the code when configured and the account has a phone; no phone means not available", async () => {
    const sent = await otpService.requestOtp(user, "login", { channel: "sms" });
    expect(sent.delivered).toBe(true);
    expect(smsProvider.sendText).toHaveBeenCalledWith(user.phone, expect.stringMatching(/\d{6}/));

    const noPhone = await otpService.requestOtp({ ...user, phone: null }, "login", { channel: "sms" });
    expect(noPhone).toMatchObject({ delivered: false, reason: "not_available" });
});

test("a channel's availability is read from env, not from the account", () => {
    expect(otpService.channelConfigured("email")).toBe(true);
    expect(otpService.channelConfigured("sms")).toBe(true);

    delete process.env.WHATSAPP_OTP_TEMPLATE_NAME;
    expect(otpService.channelConfigured("whatsapp")).toBe(false);
});
