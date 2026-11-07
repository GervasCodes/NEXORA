import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

const mockRegister = vi.fn();
vi.mock("../../src/context/AuthContext", () => ({
    useAuth: () => ({ register: mockRegister })
}));

// Identity translator - keeps the test focused on behaviour instead of a
// large hand-maintained copy of every string Register.jsx happens to call
// t() with.
vi.mock("../../src/context/LanguageContext", () => ({
    useLanguage: () => ({ t: (key) => key })
}));

// Username availability check (phase 6): every name is free in these tests.
vi.mock("../../src/api/client", () => ({
    default: { get: vi.fn(() => Promise.resolve({ data: { data: { available: true } } })) }
}));

import Register from "../../src/pages/Register";

// Required fields render their label as "<key> *" (see Input.jsx), so
// match with a prefix regex instead of the exact translated-key string.
const byLabel = (key) => screen.getByLabelText(new RegExp(`^${key}`));

const fillAccountBasics = async (user) => {
    await user.type(byLabel("auth.firstNameLabel"), "Amina");
    await user.type(byLabel("auth.lastNameLabel"), "Mrisho");
    await user.type(byLabel("username.label"), "amina_m");
    await screen.findByText("username.available");
    await user.type(byLabel("auth.emailLabel"), "amina@example.com");
    await user.type(screen.getByPlaceholderText("712 345 678"), "712345678");
};

describe("Register - confirm password", () => {
    beforeEach(() => {
        mockRegister.mockReset();
        mockRegister.mockResolvedValue({ success: true });
    });

    it("shows a mismatch error as you type and clears it once the two fields match", async () => {
        const user = userEvent.setup();
        render(
            <MemoryRouter>
                <Register />
            </MemoryRouter>
        );

        await fillAccountBasics(user);
        await user.type(byLabel("auth.passwordLabel"), "supersecret1");
        await user.type(byLabel("auth.confirmPasswordLabel"), "supersecret2");

        expect(await screen.findByText("auth.passwordMismatchError")).toBeInTheDocument();
        // Phase 6: the button stays enabled so a submit can explain what is wrong
        // and move focus there, instead of failing silently while disabled.
        expect(screen.getByRole("button", { name: "auth.createAccountButton" })).not.toBeDisabled();

        await user.clear(byLabel("auth.confirmPasswordLabel"));
        await user.type(byLabel("auth.confirmPasswordLabel"), "supersecret1");

        expect(screen.queryByText("auth.passwordMismatchError")).not.toBeInTheDocument();
        expect(screen.getByRole("button", { name: "auth.createAccountButton" })).not.toBeDisabled();
    });

    it("each password field has its own independent show/hide toggle", async () => {
        const user = userEvent.setup();
        render(
            <MemoryRouter>
                <Register />
            </MemoryRouter>
        );

        const password = byLabel("auth.passwordLabel");
        const confirm = byLabel("auth.confirmPasswordLabel");
        expect(password).toHaveAttribute("type", "password");
        expect(confirm).toHaveAttribute("type", "password");

        const toggles = screen.getAllByRole("button", { name: "auth.showPassword" });
        expect(toggles).toHaveLength(2);

        await user.click(toggles[1]);
        expect(confirm).toHaveAttribute("type", "text");
        expect(password).toHaveAttribute("type", "password");
    });

    it("never sends confirm_password to the register API", async () => {
        const user = userEvent.setup();
        render(
            <MemoryRouter>
                <Register />
            </MemoryRouter>
        );

        await fillAccountBasics(user);
        await user.type(byLabel("auth.passwordLabel"), "supersecret1");
        await user.type(byLabel("auth.confirmPasswordLabel"), "supersecret1");
        await user.click(screen.getByLabelText(/terms_accepted|auth\.termsPrefix/i, { selector: "input" }));
        await user.click(screen.getByRole("button", { name: "auth.createAccountButton" }));

        expect(mockRegister).toHaveBeenCalledTimes(1);
        const payload = mockRegister.mock.calls[0][0];
        expect(payload).not.toHaveProperty("confirm_password");
        expect(payload.password).toBe("supersecret1");
    });
});

// Phase 6 form-error pattern (t() is the identity function here, so messages
// are asserted by key).
describe("Register - field errors", () => {
    beforeEach(() => {
        mockRegister.mockReset();
        mockRegister.mockResolvedValue({ success: true });
    });

    it("shows a message under every empty required field and focuses the first one", async () => {
        const user = userEvent.setup();
        render(<MemoryRouter><Register /></MemoryRouter>);

        await user.click(screen.getByRole("button", { name: "auth.createAccountButton" }));

        expect(mockRegister).not.toHaveBeenCalled();
        expect(byLabel("auth.firstNameLabel")).toHaveAttribute("aria-invalid", "true");
        expect(byLabel("auth.lastNameLabel")).toHaveAttribute("aria-invalid", "true");
        expect(byLabel("auth.emailLabel")).toHaveAttribute("aria-invalid", "true");
        expect(byLabel("auth.passwordLabel")).toHaveAttribute("aria-invalid", "true");
        expect(screen.getByText("username.required")).toBeInTheDocument();
        expect(screen.getByText("auth.invalidPhoneError")).toBeInTheDocument();
        expect(screen.getByText("auth.error.passwordRequired")).toBeInTheDocument();
        expect(screen.getByText("auth.error.confirmPasswordRequired")).toBeInTheDocument();
        expect(screen.getByText("auth.termsRequiredError")).toBeInTheDocument();
        await waitFor(() => expect(byLabel("auth.firstNameLabel")).toHaveFocus());
    });

    it("marks the terms checkbox invalid and links it to its message", async () => {
        const user = userEvent.setup();
        render(<MemoryRouter><Register /></MemoryRouter>);

        await user.click(screen.getByRole("button", { name: "auth.createAccountButton" }));

        const terms = screen.getByRole("checkbox");
        expect(terms).toHaveAttribute("aria-invalid", "true");
        expect(terms).toHaveAttribute("aria-describedby", screen.getByText("auth.termsRequiredError").id);

        await user.click(terms);
        expect(screen.queryByText("auth.termsRequiredError")).not.toBeInTheDocument();
        expect(terms).not.toHaveAttribute("aria-invalid");
    });

    it("clears a field's message when that field is edited", async () => {
        const user = userEvent.setup();
        render(<MemoryRouter><Register /></MemoryRouter>);

        await user.click(screen.getByRole("button", { name: "auth.createAccountButton" }));
        await user.type(byLabel("auth.firstNameLabel"), "A");

        expect(byLabel("auth.firstNameLabel")).not.toHaveAttribute("aria-invalid");
        expect(byLabel("auth.lastNameLabel")).toHaveAttribute("aria-invalid", "true");
    });

    it("rejects a malformed email and a too-short password", async () => {
        const user = userEvent.setup();
        render(<MemoryRouter><Register /></MemoryRouter>);

        await fillAccountBasics(user);
        await user.clear(byLabel("auth.emailLabel"));
        await user.type(byLabel("auth.emailLabel"), "amina@");
        await user.type(byLabel("auth.passwordLabel"), "short");
        await user.type(byLabel("auth.confirmPasswordLabel"), "short");
        await user.click(screen.getByRole("button", { name: "auth.createAccountButton" }));

        expect(mockRegister).not.toHaveBeenCalled();
        expect(screen.getByText("form.error.emailInvalid")).toBeInTheDocument();
        expect(screen.getByText("form.error.minLength")).toBeInTheDocument();
        await waitFor(() => expect(byLabel("auth.emailLabel")).toHaveFocus());
    });

    it("focuses the confirm-password field when the two passwords differ on submit", async () => {
        const user = userEvent.setup();
        render(<MemoryRouter><Register /></MemoryRouter>);

        await fillAccountBasics(user);
        await user.type(byLabel("auth.passwordLabel"), "supersecret1");
        await user.type(byLabel("auth.confirmPasswordLabel"), "supersecret2");
        await user.click(screen.getByRole("checkbox"));
        await user.click(screen.getByRole("button", { name: "auth.createAccountButton" }));

        expect(mockRegister).not.toHaveBeenCalled();
        await waitFor(() => expect(byLabel("auth.confirmPasswordLabel")).toHaveFocus());
    });
});
