import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
    const actual = await vi.importActual("react-router-dom");
    return { ...actual, useNavigate: () => mockNavigate };
});

const mockLogin = vi.fn();
const mockVerifyLoginOtp = vi.fn();
const mockResendLoginOtp = vi.fn();
vi.mock("../../src/context/AuthContext", () => ({
    useAuth: () => ({
        login: mockLogin,
        verifyLoginOtp: mockVerifyLoginOtp,
        resendLoginOtp: mockResendLoginOtp
    })
}));

import Login from "../../src/pages/Login";

const renderLogin = () => render(<MemoryRouter><Login /></MemoryRouter>);

// The email/password/code <label> elements aren't wired to their <input>
// via htmlFor/id in the markup, so getByLabelText can't find them.
// type="email" (and the code field's type="text") keep the ARIA
// "textbox" role; type="password" has no implicit role, so it's
// selected directly by its type attribute instead.
const getEmailField = () => screen.getByRole("textbox");
const getPasswordField = () => document.querySelector('input[type="password"]');
const getCodeField = () => screen.getByRole("textbox");

const submitCredentials = async (user, email = "buyer@nexora.tz", password = "secret123") => {
    await user.type(getEmailField(), email);
    await user.type(getPasswordField(), password);
    await user.click(screen.getByRole("button", { name: "Sign in" }));
};

beforeEach(() => {
    mockNavigate.mockClear();
    mockLogin.mockReset();
    mockVerifyLoginOtp.mockReset();
    mockResendLoginOtp.mockReset();
});

describe("Login page", () => {
    it("submits credentials and advances to the OTP step on success", async () => {
        mockLogin.mockResolvedValue({ success: true, preAuthToken: "pre-token", maskedEmail: "b***@nexora.tz" });
        const user = userEvent.setup();
        renderLogin();

        await submitCredentials(user);

        expect(mockLogin).toHaveBeenCalledWith("buyer@nexora.tz", "secret123");
        await waitFor(() => expect(screen.getByText("Check your email")).toBeInTheDocument());
        expect(screen.getByText("b***@nexora.tz")).toBeInTheDocument();
    });

    it("shows an error and stays on the credentials step when login fails", async () => {
        mockLogin.mockResolvedValue({ success: false, message: "Invalid email or password" });
        const user = userEvent.setup();
        renderLogin();

        await submitCredentials(user, "buyer@nexora.tz", "wrong");

        await waitFor(() => expect(screen.getByText("Invalid email or password")).toBeInTheDocument());
        expect(screen.queryByText("Check your email")).not.toBeInTheDocument();
    });

    it("verifies the OTP and navigates home on success", async () => {
        mockLogin.mockResolvedValue({ success: true, preAuthToken: "pre-token", maskedEmail: "b***@nexora.tz" });
        mockVerifyLoginOtp.mockResolvedValue({ success: true });
        const user = userEvent.setup();
        renderLogin();
        await submitCredentials(user);
        await waitFor(() => expect(screen.getByText("Check your email")).toBeInTheDocument());

        await user.type(getCodeField(), "123456");
        await user.click(screen.getByRole("button", { name: /Verify/ }));

        expect(mockVerifyLoginOtp).toHaveBeenCalledWith("pre-token", "123456");
        await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/"));
    });

    it("shows an error and does not navigate when the OTP is incorrect", async () => {
        mockLogin.mockResolvedValue({ success: true, preAuthToken: "pre-token", maskedEmail: "b***@nexora.tz" });
        mockVerifyLoginOtp.mockResolvedValue({ success: false, message: "Incorrect code" });
        const user = userEvent.setup();
        renderLogin();
        await submitCredentials(user);
        await waitFor(() => screen.getByText("Check your email"));

        await user.type(getCodeField(), "000000");
        await user.click(screen.getByRole("button", { name: /Verify/ }));

        await waitFor(() => expect(screen.getByText("Incorrect code")).toBeInTheDocument());
        expect(mockNavigate).not.toHaveBeenCalled();
    });

    it("strips non-digit characters typed into the code field", async () => {
        mockLogin.mockResolvedValue({ success: true, preAuthToken: "pre-token", maskedEmail: "b***@nexora.tz" });
        const user = userEvent.setup();
        renderLogin();
        await submitCredentials(user);
        await waitFor(() => screen.getByText("Check your email"));

        await user.type(getCodeField(), "1a2b3c");

        expect(getCodeField()).toHaveValue("123");
    });

    it("requests a new code via resend, showing a confirmation notice", async () => {
        mockLogin.mockResolvedValue({ success: true, preAuthToken: "pre-token", maskedEmail: "b***@nexora.tz" });
        mockResendLoginOtp.mockResolvedValue({ success: true });
        const user = userEvent.setup();
        renderLogin();
        await submitCredentials(user);
        await waitFor(() => screen.getByText("Resend code"));

        await user.click(screen.getByText("Resend code"));

        expect(mockResendLoginOtp).toHaveBeenCalledWith("pre-token");
        await waitFor(() => expect(screen.getByText("A new code has been sent.")).toBeInTheDocument());
    });

    it("returns to the credentials step when 'Use a different account' is clicked", async () => {
        mockLogin.mockResolvedValue({ success: true, preAuthToken: "pre-token", maskedEmail: "b***@nexora.tz" });
        const user = userEvent.setup();
        renderLogin();
        await submitCredentials(user);
        await waitFor(() => screen.getByText("Check your email"));

        await user.click(screen.getByText(/Use a different account/));

        expect(screen.getByText("Welcome back")).toBeInTheDocument();
    });
});
