import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
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

import Register from "../../src/pages/Register";

// Required fields render their label as "<key> *" (see Input.jsx), so
// match with a prefix regex instead of the exact translated-key string.
const byLabel = (key) => screen.getByLabelText(new RegExp(`^${key}`));

const fillAccountBasics = async (user) => {
    await user.type(byLabel("auth.firstNameLabel"), "Amina");
    await user.type(byLabel("auth.lastNameLabel"), "Mrisho");
    await user.type(byLabel("auth.emailLabel"), "amina@example.com");
    await user.type(screen.getByPlaceholderText("712 345 678"), "712345678");
};

describe("Register - confirm password", () => {
    beforeEach(() => {
        mockRegister.mockReset();
        mockRegister.mockResolvedValue({ success: true });
    });

    it("shows a mismatch error and keeps the submit button disabled until the two fields match", async () => {
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
        expect(screen.getByRole("button", { name: "auth.createAccountButton" })).toBeDisabled();

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
