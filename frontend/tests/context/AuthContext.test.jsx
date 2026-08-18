import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../../src/api/client", () => ({
    default: { post: vi.fn(), get: vi.fn() },
    extractErrorMessage: (error) => error?.response?.data?.message || "Something went wrong. Please try again",
    registerSuspensionHandler: vi.fn(),
    registerSessionExpiredHandler: vi.fn()
}));

import api from "../../src/api/client";
import { AuthProvider, useAuth } from "../../src/context/AuthContext";

function Harness() {
    const { user, login, verifyLoginOtp, resendLoginOtp, register, logout, updateUser } = useAuth();
    return (
        <div>
            <div data-testid="user">{JSON.stringify(user)}</div>
            <button onClick={() => login("buyer@nexora.tz", "secret")}>Login</button>
            <button onClick={() => verifyLoginOtp("pre-token", "123456")}>Verify OTP</button>
            <button onClick={() => resendLoginOtp("pre-token")}>Resend OTP</button>
            <button onClick={() => register({ email: "new@nexora.tz" })}>Register</button>
            <button onClick={() => logout()}>Logout</button>
            <button onClick={() => updateUser({ name: "Updated" })}>Update</button>
        </div>
    );
}

const renderWithProvider = () =>
    render(
        <AuthProvider>
            <Harness />
        </AuthProvider>
    );

beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    // Phase 4 (Testing & Session Hardening): AuthProvider's checkSession
    // effect calls GET /auth/me on mount whenever a cached user exists
    // (see AuthContext.jsx) - this is a *background confirmation*, not
    // gating the initial optimistic render, so most tests below don't
    // need to care about it at all. A safe default (never resolves)
    // keeps it from throwing on tests that happen to pre-populate
    // nexora_user without caring about this specific behavior; tests
    // that DO care override it explicitly.
    api.get.mockImplementation(() => new Promise(() => {}));
});

describe("AuthContext", () => {
    it("starts with no user when nothing is stored", () => {
        renderWithProvider();
        expect(screen.getByTestId("user")).toHaveTextContent("null");
    });

    it("restores a previously stored user from localStorage on mount, optimistically", () => {
        localStorage.setItem("nexora_user", JSON.stringify({ id: 1, role: "buyer" }));

        renderWithProvider();

        expect(screen.getByTestId("user")).toHaveTextContent("\"role\":\"buyer\"");
    });

    // Phase 4: the localStorage value above is only ever optimistic - the
    // real session lives in an httpOnly cookie this code can't read, so
    // checkSession's GET /auth/me confirms (or corrects) it against the
    // server. This is the behavior that actually makes the cookie the
    // source of truth rather than localStorage.
    it("confirms the optimistic user against GET /auth/me and updates it with the server's copy", async () => {
        localStorage.setItem("nexora_user", JSON.stringify({ id: 1, role: "buyer", name: "Stale" }));
        api.get.mockResolvedValue({ data: { data: { user: { id: 1, role: "buyer", name: "Fresh" } } } });

        renderWithProvider();

        expect(api.get).toHaveBeenCalledWith("/auth/me");
        await waitFor(() => expect(screen.getByTestId("user")).toHaveTextContent("Fresh"));
        expect(JSON.parse(localStorage.getItem("nexora_user")).name).toBe("Fresh");
    });

    it("clears the user when GET /auth/me rejects (cookie expired/invalid server-side)", async () => {
        localStorage.setItem("nexora_user", JSON.stringify({ id: 1, role: "buyer" }));
        api.get.mockRejectedValue({ response: { status: 401 } });

        renderWithProvider();

        await waitFor(() => expect(screen.getByTestId("user")).toHaveTextContent("null"));
    });

    it("never calls GET /auth/me when there's no cached user at all", () => {
        renderWithProvider();
        expect(api.get).not.toHaveBeenCalled();
    });

    it("login() posts credentials and returns the pre-auth OTP details without setting the user yet", async () => {
        api.post.mockResolvedValue({
            data: { data: { preAuthToken: "pre-token", maskedEmail: "b***@nexora.tz" } }
        });
        let hookResult;
        function Capture() {
            hookResult = useAuth();
            return null;
        }
        render(<AuthProvider><Capture /></AuthProvider>);

        const result = await hookResult.login("buyer@nexora.tz", "secret");

        expect(api.post).toHaveBeenCalledWith("/auth/login", { email: "buyer@nexora.tz", password: "secret" });
        expect(result).toEqual({
            success: true,
            needsOtp: true,
            preAuthToken: "pre-token",
            maskedEmail: "b***@nexora.tz"
        });
        expect(hookResult.user).toBeNull();
    });

    it("login() returns a failure result with a message on invalid credentials, without throwing", async () => {
        api.post.mockRejectedValue({ response: { data: { message: "Invalid email or password" } } });
        let hookResult;
        function Capture() {
            hookResult = useAuth();
            return null;
        }
        render(<AuthProvider><Capture /></AuthProvider>);

        const result = await hookResult.login("buyer@nexora.tz", "wrong");

        expect(result).toEqual({ success: false, message: "Invalid email or password" });
    });

    // Phase 4: the session token itself no longer appears anywhere in the
    // response body or in localStorage - the backend sets it as an
    // httpOnly cookie directly (see auth.controller.js#verifyLoginOtp).
    // Only the non-sensitive user profile is cached client-side now.
    it("verifyLoginOtp() stores only the user (never a token) and updates context state on success", async () => {
        api.post.mockResolvedValue({
            data: { data: { user: { id: 1, role: "buyer", email: "buyer@nexora.tz" } } }
        });
        const user = userEvent.setup();
        renderWithProvider();

        await user.click(screen.getByText("Verify OTP"));

        expect(api.post).toHaveBeenCalledWith("/auth/login/verify-otp", { pre_auth_token: "pre-token", code: "123456" });
        await waitFor(() => expect(screen.getByTestId("user")).toHaveTextContent("buyer@nexora.tz"));
        expect(JSON.parse(localStorage.getItem("nexora_user"))).toEqual({ id: 1, role: "buyer", email: "buyer@nexora.tz" });
    });

    it("verifyLoginOtp() returns a failure result on an incorrect code, without touching storage", async () => {
        api.post.mockRejectedValue({ response: { data: { message: "Incorrect code" } } });
        let hookResult;
        function Capture() {
            hookResult = useAuth();
            return null;
        }
        render(<AuthProvider><Capture /></AuthProvider>);

        const result = await hookResult.verifyLoginOtp("pre-token", "000000");

        expect(result).toEqual({ success: false, message: "Incorrect code" });
        expect(localStorage.getItem("nexora_user")).toBeNull();
    });

    it("resendLoginOtp() succeeds without changing the current user", async () => {
        api.post.mockResolvedValue({});
        const user = userEvent.setup();
        renderWithProvider();

        await user.click(screen.getByText("Resend OTP"));

        expect(api.post).toHaveBeenCalledWith("/auth/login/resend-otp", { pre_auth_token: "pre-token" });
    });

    it("resendLoginOtp() surfaces a failure message when the resend fails", async () => {
        api.post.mockRejectedValue({ response: { data: { message: "Too many requests" } } });
        let hookResult;
        function Capture() {
            hookResult = useAuth();
            return null;
        }
        render(<AuthProvider><Capture /></AuthProvider>);

        const result = await hookResult.resendLoginOtp("pre-token");

        expect(result).toEqual({ success: false, message: "Too many requests" });
    });

    it("register() posts a plain JSON payload without a multipart content-type header", async () => {
        api.post.mockResolvedValue({});
        const user = userEvent.setup();
        renderWithProvider();

        await user.click(screen.getByText("Register"));

        expect(api.post).toHaveBeenCalledWith("/auth/register", { email: "new@nexora.tz" }, undefined);
    });

    it("register() sends multipart/form-data headers when given a FormData payload", async () => {
        api.post.mockResolvedValue({});
        let hookResult;
        function Capture() {
            hookResult = useAuth();
            return null;
        }
        render(<AuthProvider><Capture /></AuthProvider>);

        const formData = new FormData();
        formData.append("email", "seller@nexora.tz");
        await hookResult.register(formData);

        expect(api.post).toHaveBeenCalledWith("/auth/register", formData, {
            headers: { "Content-Type": "multipart/form-data" }
        });
    });

    it("register() returns a failure result when registration fails", async () => {
        api.post.mockRejectedValue({ response: { data: { message: "Email already in use" } } });
        let hookResult;
        function Capture() {
            hookResult = useAuth();
            return null;
        }
        render(<AuthProvider><Capture /></AuthProvider>);

        const result = await hookResult.register({ email: "dup@nexora.tz" });

        expect(result).toEqual({ success: false, message: "Email already in use" });
    });

    // Phase 4: logout can no longer just clear localStorage - the session
    // cookie is httpOnly, so only a server response can actually remove
    // it (see auth.controller.js#logout). Local state still clears
    // immediately regardless (fire-and-forget on the network call), so
    // this asserts both halves: the server call happens, and the local
    // state clears without waiting for it.
    it("logout() calls POST /auth/logout and clears the user from storage and context state", async () => {
        localStorage.setItem("nexora_user", JSON.stringify({ id: 1, role: "buyer" }));
        api.get.mockResolvedValue({ data: { data: { user: { id: 1, role: "buyer" } } } });
        api.post.mockResolvedValue({});
        const user = userEvent.setup();
        renderWithProvider();
        expect(screen.getByTestId("user")).toHaveTextContent("\"role\":\"buyer\"");

        await user.click(screen.getByText("Logout"));

        expect(api.post).toHaveBeenCalledWith("/auth/logout");
        expect(screen.getByTestId("user")).toHaveTextContent("null");
        expect(localStorage.getItem("nexora_user")).toBeNull();
    });

    it("logout() still clears local state even if the server call fails", async () => {
        localStorage.setItem("nexora_user", JSON.stringify({ id: 1, role: "buyer" }));
        api.get.mockResolvedValue({ data: { data: { user: { id: 1, role: "buyer" } } } });
        api.post.mockRejectedValue(new Error("network error"));
        const user = userEvent.setup();
        renderWithProvider();

        await user.click(screen.getByText("Logout"));

        expect(screen.getByTestId("user")).toHaveTextContent("null");
        expect(localStorage.getItem("nexora_user")).toBeNull();
    });

    it("updateUser() merges a patch into the current user and persists it", async () => {
        localStorage.setItem("nexora_user", JSON.stringify({ id: 1, role: "buyer", name: "Original" }));
        api.get.mockResolvedValue({ data: { data: { user: { id: 1, role: "buyer", name: "Original" } } } });
        const user = userEvent.setup();
        renderWithProvider();

        await user.click(screen.getByText("Update"));

        await waitFor(() => expect(screen.getByTestId("user")).toHaveTextContent("\"name\":\"Updated\""));
        expect(screen.getByTestId("user")).toHaveTextContent("\"role\":\"buyer\"");
        expect(JSON.parse(localStorage.getItem("nexora_user")).name).toBe("Updated");
    });
});
