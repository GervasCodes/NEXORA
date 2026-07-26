jest.mock("../../../src/config/db", () => require("../../helpers/mockDb"));
jest.mock("../../../src/modules/account/account.repository");
jest.mock("../../../src/modules/otp/otp.service");
jest.mock("../../../src/modules/audit/audit.service");
jest.mock("../../../src/modules/adminNotification/adminNotification.service");
jest.mock("../../../src/utils/comparePassword");
jest.mock("../../../src/utils/hashPassword");

const db = require("../../../src/config/db");
const accountRepository = require("../../../src/modules/account/account.repository");
const otpService = require("../../../src/modules/otp/otp.service");
const auditService = require("../../../src/modules/audit/audit.service");
const adminNotificationService = require("../../../src/modules/adminNotification/adminNotification.service");
const comparePassword = require("../../../src/utils/comparePassword");
const hashPassword = require("../../../src/utils/hashPassword");
const { generateShortLivedToken } = require("../../../src/utils/shortLivedToken");

const accountService = require("../../../src/modules/account/account.service");

const connection = db.__mockConnection;

beforeEach(() => {
    hashPassword.mockResolvedValue("hashed-random-password");
    accountRepository.deactivateSellerListings.mockResolvedValue(undefined);
});

describe("account.service.getProfile", () => {
    it("rejects an unknown user", async () => {
        accountRepository.findById.mockResolvedValue(undefined);
        await expect(accountService.getProfile(1)).rejects.toMatchObject({ code: "ACCOUNT_NOT_FOUND" });
    });

    it("returns the profile row when found", async () => {
        accountRepository.findById.mockResolvedValue({ id: 1, email: "a@b.com" });
        await expect(accountService.getProfile(1)).resolves.toEqual({ id: 1, email: "a@b.com" });
    });
});

describe("account.service.updateProfile", () => {
    it("rejects when the new email is already used by another account", async () => {
        accountRepository.findByEmailExcluding.mockResolvedValue({ id: 2 });
        await expect(accountService.updateProfile(1, { email: "taken@b.com" })).rejects.toMatchObject({
            code: "EMAIL_IN_USE"
        });
        expect(accountRepository.updateProfile).not.toHaveBeenCalled();
    });

    it("rejects when the new phone is already used by another account", async () => {
        accountRepository.findByEmailExcluding.mockResolvedValue(undefined);
        accountRepository.findByPhoneExcluding.mockResolvedValue({ id: 2 });
        await expect(accountService.updateProfile(1, { phone: "0700000000" })).rejects.toMatchObject({
            code: "PHONE_IN_USE"
        });
        expect(accountRepository.updateProfile).not.toHaveBeenCalled();
    });

    it("updates the profile and returns the refreshed record when email/phone are free", async () => {
        accountRepository.findByEmailExcluding.mockResolvedValue(undefined);
        accountRepository.findById.mockResolvedValue({ id: 1, email: "new@b.com" });

        const result = await accountService.updateProfile(1, { email: "new@b.com" });

        expect(accountRepository.updateProfile).toHaveBeenCalledWith(1, { email: "new@b.com" });
        expect(result).toEqual({ id: 1, email: "new@b.com" });
    });
});

describe("account.service.updateSettings", () => {
    it("persists settings and returns the refreshed profile", async () => {
        accountRepository.findById.mockResolvedValue({ id: 1, language: "sw" });
        const result = await accountService.updateSettings(1, { language: "sw" });

        expect(accountRepository.updateSettings).toHaveBeenCalledWith(1, { language: "sw" });
        expect(result).toEqual({ id: 1, language: "sw" });
    });
});

describe("account.service password-change OTP flow", () => {
    it("requestPasswordChangeOtp rejects an unknown user", async () => {
        accountRepository.findById.mockResolvedValue(undefined);
        await expect(accountService.requestPasswordChangeOtp(1)).rejects.toMatchObject({
            code: "ACCOUNT_NOT_FOUND"
        });
    });

    it("requestPasswordChangeOtp delegates to otpService for a known user", async () => {
        accountRepository.findById.mockResolvedValue({ id: 1, email: "a@b.com" });
        otpService.requestOtp.mockResolvedValue({ sent: true });

        const result = await accountService.requestPasswordChangeOtp(1);

        expect(otpService.requestOtp).toHaveBeenCalledWith({ id: 1, email: "a@b.com" }, "password_change");
        expect(result).toEqual({ sent: true });
    });

    it("verifyPasswordChangeOtp verifies the code and returns a reauth token", async () => {
        otpService.verifyOtp.mockResolvedValue(undefined);
        const token = await accountService.verifyPasswordChangeOtp(1, "123456");

        expect(otpService.verifyOtp).toHaveBeenCalledWith(1, "password_change", "123456");
        expect(typeof token).toBe("string");
    });

    it("changePassword rejects a garbage/expired reauth token", async () => {
        await expect(accountService.changePassword(1, "not-a-real-token", "NewPass123!")).rejects.toMatchObject({
            code: "REAUTH_EXPIRED"
        });
        expect(accountRepository.updatePassword).not.toHaveBeenCalled();
    });

    it("changePassword rejects a reauth token minted for a different user", async () => {
        const token = generateShortLivedToken("pwd_reauth", { id: 999 }, "10m");
        await expect(accountService.changePassword(1, token, "NewPass123!")).rejects.toMatchObject({
            code: "REAUTH_EXPIRED"
        });
    });

    it("changePassword rejects when the account no longer exists", async () => {
        const token = generateShortLivedToken("pwd_reauth", { id: 1 }, "10m");
        accountRepository.findAuthById.mockResolvedValue(undefined);
        await expect(accountService.changePassword(1, token, "NewPass123!")).rejects.toMatchObject({
            code: "ACCOUNT_NOT_FOUND"
        });
    });

    it("changePassword hashes and persists the new password for a valid reauth token", async () => {
        const token = generateShortLivedToken("pwd_reauth", { id: 1 }, "10m");
        accountRepository.findAuthById.mockResolvedValue({ id: 1 });
        hashPassword.mockResolvedValue("new-hashed-password");

        await accountService.changePassword(1, token, "NewPass123!");

        expect(accountRepository.updatePassword).toHaveBeenCalledWith(1, "new-hashed-password");
    });
});

describe("account.service.deleteAccount (Phase 3 - soft account deletion)", () => {
    it("rejects an unknown account", async () => {
        accountRepository.findAuthById.mockResolvedValue(undefined);
        await expect(accountService.deleteAccount(1, "pw")).rejects.toMatchObject({ code: "ACCOUNT_NOT_FOUND" });
        expect(db.getConnection).not.toHaveBeenCalled();
    });

    it("rejects an incorrect password without touching the database", async () => {
        accountRepository.findAuthById.mockResolvedValue({ id: 1, password: "hashed" });
        comparePassword.mockResolvedValue(false);

        await expect(accountService.deleteAccount(1, "wrong-pw")).rejects.toMatchObject({
            code: "INCORRECT_PASSWORD"
        });
        expect(db.getConnection).not.toHaveBeenCalled();
        expect(accountRepository.softDeleteUser).not.toHaveBeenCalled();
    });

    it("locks the account out (cart, push subscriptions, listings, random password) inside one transaction", async () => {
        accountRepository.findAuthById.mockResolvedValue({ id: 1, password: "hashed" });
        comparePassword.mockResolvedValue(true);
        accountRepository.findById.mockResolvedValue({
            id: 1, first_name: "Amina", last_name: "H", email: "amina@b.com", role: "buyer"
        });

        await accountService.deleteAccount(1, "correct-pw");

        expect(connection.beginTransaction).toHaveBeenCalled();
        expect(accountRepository.deleteCartItems).toHaveBeenCalledWith(1, connection);
        expect(accountRepository.deletePushSubscriptions).toHaveBeenCalledWith(1, connection);
        expect(accountRepository.deactivateSellerListings).toHaveBeenCalledWith(1, connection);
        expect(accountRepository.softDeleteUser).toHaveBeenCalledWith(1, "hashed-random-password", connection);
        expect(connection.commit).toHaveBeenCalled();
        expect(connection.release).toHaveBeenCalled();
    });

    it("rolls back and releases the connection, and never soft-deletes, if a step inside the transaction fails", async () => {
        accountRepository.findAuthById.mockResolvedValue({ id: 1, password: "hashed" });
        comparePassword.mockResolvedValue(true);
        accountRepository.findById.mockResolvedValue({ id: 1, role: "buyer" });
        accountRepository.deactivateSellerListings.mockRejectedValue(new Error("db exploded"));

        await expect(accountService.deleteAccount(1, "correct-pw")).rejects.toThrow("db exploded");

        expect(connection.rollback).toHaveBeenCalled();
        expect(connection.release).toHaveBeenCalled();
        expect(connection.commit).not.toHaveBeenCalled();
        expect(auditService.log).not.toHaveBeenCalled();
        expect(adminNotificationService.notify).not.toHaveBeenCalled();
    });

    it("logs the deletion to the audit trail with the account's role, after commit", async () => {
        accountRepository.findAuthById.mockResolvedValue({ id: 1, password: "hashed" });
        comparePassword.mockResolvedValue(true);
        accountRepository.findById.mockResolvedValue({
            id: 1, first_name: "Amina", last_name: "H", email: "amina@b.com", role: "seller"
        });

        await accountService.deleteAccount(1, "correct-pw");

        expect(auditService.log).toHaveBeenCalledWith(
            expect.objectContaining({
                userId: 1,
                eventType: "user_account_deleted",
                metadata: { role: "seller" }
            })
        );
    });

    it("raises an admin notification naming the account, for review before permanent removal", async () => {
        accountRepository.findAuthById.mockResolvedValue({ id: 1, password: "hashed" });
        comparePassword.mockResolvedValue(true);
        accountRepository.findById.mockResolvedValue({
            id: 1, first_name: "Amina", last_name: "H", email: "amina@b.com", role: "buyer"
        });

        await accountService.deleteAccount(1, "correct-pw");

        expect(adminNotificationService.notify).toHaveBeenCalledWith(
            expect.objectContaining({
                type: "user_account_deleted",
                category: "account",
                severity: "info",
                relatedUserId: 1,
                message: expect.stringContaining("Amina H (amina@b.com)")
            })
        );
    });

    it("still deletes and notifies with a generic message even if the profile lookup comes back empty", async () => {
        accountRepository.findAuthById.mockResolvedValue({ id: 1, password: "hashed" });
        comparePassword.mockResolvedValue(true);
        accountRepository.findById.mockResolvedValue(undefined);

        await accountService.deleteAccount(1, "correct-pw");

        expect(connection.commit).toHaveBeenCalled();
        expect(adminNotificationService.notify).toHaveBeenCalledWith(
            expect.objectContaining({ message: expect.stringContaining("Account #1") })
        );
    });
});
