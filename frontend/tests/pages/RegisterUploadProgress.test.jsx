import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

const mockRegister = vi.fn();
vi.mock("../../src/context/AuthContext", () => ({
    useAuth: () => ({ register: mockRegister })
}));
vi.mock("../../src/context/LanguageContext", () => ({
    useLanguage: () => ({ t: (key) => key })
}));
vi.mock("../../src/api/client", () => ({
    default: { get: vi.fn(() => Promise.resolve({ data: { data: { available: true } } })) }
}));

import Register from "../../src/pages/Register";

const byLabel = (key) => screen.getByLabelText(new RegExp(`^${key}`));

const fillAccountAndContinue = async (user) => {
    await user.selectOptions(screen.getByLabelText(/auth\.roleLabel/), "seller");
    await user.type(byLabel("auth.firstNameLabel"), "Amina");
    await user.type(byLabel("auth.lastNameLabel"), "Mrisho");
    await user.type(byLabel("username.label"), "amina_m");
    await screen.findByText("username.available");
    await user.type(byLabel("auth.emailLabel"), "amina@example.com");
    await user.type(screen.getByPlaceholderText("712 345 678"), "712345678");
    await user.type(byLabel("auth.passwordLabel"), "supersecret1");
    await user.type(byLabel("auth.confirmPasswordLabel"), "supersecret1");
    await user.click(screen.getByLabelText(/terms_accepted|auth\.termsPrefix/i, { selector: "input" }));
    await user.click(screen.getByRole("button", { name: "auth.continueToVerification" }));
};

// jsdom's native `required` validation does not see files attached through
// user.upload, so submit the form directly (the component's own checks still run).
const submitDocuments = (container) => {
    fireEvent.submit(container.querySelector('input[type="file"]').closest("form"));
};

const attachDocuments = async (user, container) => {
    const [photo, idDoc] = container.querySelectorAll('input[type="file"]');
    await user.upload(photo, new File(["p"], "me.jpg", { type: "image/jpeg" }));
    await user.upload(idDoc, new File(["d"], "id.pdf", { type: "application/pdf" }));
};

describe("Register - document upload progress", () => {
    beforeEach(() => { mockRegister.mockReset(); });

    it("passes an onUploadProgress callback and shows a progress bar while documents upload", async () => {
        let finish;
        mockRegister.mockImplementation((_payload, options) => new Promise((resolve) => {
            options.onUploadProgress({ loaded: 40, total: 100 });
            finish = () => resolve({ success: true });
        }));

        const user = userEvent.setup();
        const { container } = render(<MemoryRouter><Register /></MemoryRouter>);
        await fillAccountAndContinue(user);
        expect(screen.queryByRole("progressbar")).toBeNull();

        await attachDocuments(user, container);
        submitDocuments(container);

        const bar = await screen.findByRole("progressbar", { name: "upload.progress" });
        expect(bar).toHaveAttribute("aria-valuenow", "40");
        expect(mockRegister.mock.calls[0][0]).toBeInstanceOf(FormData);
        expect(typeof mockRegister.mock.calls[0][1].onUploadProgress).toBe("function");

        await act(async () => { finish(); });
        await waitFor(() => expect(screen.queryByRole("progressbar")).toBeNull());
        expect(screen.getByText("auth.verify.accountCreated")).toBeInTheDocument();
    });

    it("removes the progress bar and shows the error when the upload fails", async () => {
        mockRegister.mockImplementation(async (_payload, options) => {
            options.onUploadProgress({ loaded: 10, total: 100 });
            return { success: false, message: "Upload failed" };
        });

        const user = userEvent.setup();
        const { container } = render(<MemoryRouter><Register /></MemoryRouter>);
        await fillAccountAndContinue(user);
        await attachDocuments(user, container);
        submitDocuments(container);

        expect(await screen.findByText("Upload failed")).toBeInTheDocument();
        expect(screen.queryByRole("progressbar")).toBeNull();
    });
});
