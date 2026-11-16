import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockGet = vi.fn();
vi.mock("../../src/api/client", () => ({
    default: { get: (...args) => mockGet(...args), post: vi.fn() },
    extractErrorMessage: (e) => e?.message || ""
}));
vi.mock("../../src/context/AuthContext", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("../../src/context/LanguageContext", () => ({
    useLanguage: () => ({
        t: (key) => ({
            "product.qaLoadMore": "Load more questions",
            "product.qaNone": "No questions",
            "infinite.error": "Couldn't load more.",
            "common.tryAgain": "Try again",
            "common.loading": "Loading"
        }[key] || key)
    })
}));

import ProductQA from "../../src/components/ProductQA";

const q = (id) => ({ id, question: `Question ${id}`, asker_name: "Buyer", created_at: "2026-01-01T00:00:00Z", answer: null });
const res = (questions, total) => ({ data: { data: { questions, total } } });

describe("ProductQA - Load more", () => {
    beforeEach(() => mockGet.mockReset());

    it("retries the same page after a failure instead of skipping ahead", async () => {
        const user = userEvent.setup();
        mockGet
            .mockResolvedValueOnce(res([q(1)], 2))
            .mockRejectedValueOnce(new Error("network"))
            .mockResolvedValueOnce(res([q(2)], 2));
        render(<ProductQA productId={7} />);
        await screen.findByText("Question 1");

        await user.click(screen.getByRole("button", { name: "Load more questions" }));
        expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load more.");

        await user.click(screen.getByRole("button", { name: "Try again" }));
        await screen.findByText("Question 2");
        expect(mockGet.mock.calls[1][1].params.page).toBe(2);
        expect(mockGet.mock.calls[2][1].params.page).toBe(2);
    });
});
