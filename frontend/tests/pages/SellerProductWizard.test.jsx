import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";

const store = new Map();
vi.mock("../../src/utils/mediaDraftStore", () => ({
    saveMediaDraft: vi.fn(async (k, state, meta) => { store.set(k, { coverId: state.coverId, items: state.items.map((i) => ({ ...i })), meta }); }),
    loadMediaDraft: vi.fn(async (k) => store.get(k)),
    clearMediaDraft: vi.fn(async (k) => { store.delete(k); })
}));
vi.mock("../../src/api/client", () => ({
    default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
    extractErrorMessage: (e) => e?.message || "error"
}));
vi.mock("../../src/api/ai", () => ({ generateListingDraft: vi.fn(), generateMarketingCopy: vi.fn() }));
vi.mock("../../src/utils/photoEdit", async (orig) => ({
    ...(await orig()),
    decodeImage: vi.fn(async () => ({ close() {} })),
    renderPhoto: vi.fn(async (f) => f)
}));
vi.mock("../../src/utils/mediaPipeline", () => ({
    uploadPending: vi.fn(),
    saveOrder: vi.fn().mockResolvedValue(undefined)
}));

import api from "../../src/api/client";
import { uploadPending, saveOrder } from "../../src/utils/mediaPipeline";
import { LanguageProvider } from "../../src/context/LanguageContext";
import SellerProductWizard from "../../src/pages/seller/SellerProductWizard";

const jpg = (name) => new File(["x"], name, { type: "image/jpeg" });

const renderWizard = (path = "/seller/products/new") =>
    render(
        <MemoryRouter initialEntries={[path]}>
            <LanguageProvider>
                <Routes>
                    <Route path="/seller/products/new" element={<SellerProductWizard />} />
                    <Route path="/seller/products/:id/edit" element={<SellerProductWizard />} />
                    <Route path="/seller/products" element={<p>products list</p>} />
                </Routes>
            </LanguageProvider>
        </MemoryRouter>
    );

const addFiles = async (...files) => {
    const input = document.querySelector('input[type="file"][multiple]');
    fireEvent.change(input, { target: { files } });
};

beforeEach(() => {
    vi.clearAllMocks();
    store.clear();
    URL.createObjectURL = vi.fn(() => "blob:x");
    URL.revokeObjectURL = vi.fn();
    api.get.mockImplementation(async (url) => (url === "/categories" ? { data: { data: [{ id: 1, name: "Art" }] } } : { data: { data: [] } }));
    api.post.mockResolvedValue({ data: { data: { productId: 55 } } });
    api.put.mockResolvedValue({});
});

describe("SellerProductWizard", () => {
    it("starts on the select step with Next disabled until something is added", () => {
        renderWizard();
        expect(screen.getByRole("heading", { name: "Add photos and videos" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
        expect(screen.getByText("1. Select").closest("li")).toHaveAttribute("aria-current", "step");
    });

    it("lets the seller reorder with the arrow buttons and choose a cover", async () => {
        const user = userEvent.setup();
        renderWizard();
        await addFiles(jpg("a.jpg"), jpg("b.jpg"));
        const list = await screen.findByRole("list", { name: "Your photos and videos" });
        let items = within(list).getAllByRole("listitem");
        expect(items).toHaveLength(2);
        expect(within(items[0]).getByText("Cover")).toBeInTheDocument();

        await user.click(within(items[0]).getByRole("button", { name: "Move Photo later" }));
        items = within(list).getAllByRole("listitem");
        expect(items[0].getAttribute("aria-label")).toBe("Photo 1 of 2");
        await user.click(within(items[1]).getByRole("button", { name: "Make this the cover photo" }));
        expect(within(list).getAllByRole("listitem")[1]).toHaveTextContent("Cover");
    });

    it("creates the draft when reaching step 2, uploads, saves order, then publishes from step 3", async () => {
        const user = userEvent.setup();
        uploadPending.mockResolvedValue({ failed: 0, serverIds: new Map() });
        renderWizard();
        await addFiles(jpg("a.jpg"));
        await user.click(await screen.findByRole("button", { name: "Next" }));

        await waitFor(() => expect(api.post).toHaveBeenCalledWith("/products/draft", { name: "Untitled product" }));
        expect(await screen.findByRole("heading", { name: "Edit your photos and videos" })).toBeInTheDocument();

        await user.click(screen.getByRole("button", { name: "Upload and continue" }));
        await waitFor(() => expect(uploadPending).toHaveBeenCalled());
        await waitFor(() => expect(saveOrder).toHaveBeenCalled());

        await user.type(await screen.findByLabelText(/Name/i), "Crochet bag");
        await user.type(screen.getByLabelText(/^Price/i), "12000");
        await user.selectOptions(screen.getByLabelText("Category", { selector: "select" }), "1");
        await user.click(screen.getByRole("button", { name: "Publish product" }));

        await waitFor(() => expect(api.post).toHaveBeenCalledWith("/products/draft/55/publish", expect.objectContaining({ name: "Crochet bag", price: "12000" })));
        expect(await screen.findByText("products list")).toBeInTheDocument();
    });

    it("stays on step 2 and shows a message when an upload fails", async () => {
        const user = userEvent.setup();
        uploadPending.mockResolvedValue({ failed: 1, serverIds: new Map() });
        renderWizard();
        await addFiles(jpg("a.jpg"));
        await user.click(await screen.findByRole("button", { name: "Next" }));
        await user.click(await screen.findByRole("button", { name: "Upload and continue" }));
        expect(await screen.findByRole("alert")).toHaveTextContent("1 file(s) did not upload");
        expect(saveOrder).not.toHaveBeenCalled();
        expect(screen.getByRole("heading", { name: "Edit your photos and videos" })).toBeInTheDocument();
    });

    it("keeps work across a refresh (restored from the draft store)", async () => {
        const user = userEvent.setup();
        const first = renderWizard();
        await addFiles(jpg("a.jpg"), jpg("b.jpg"));
        await screen.findByRole("list", { name: "Your photos and videos" });
        await waitFor(() => expect(store.get("wizard:new")?.items).toHaveLength(2), { timeout: 2000 });
        first.unmount();

        renderWizard();
        expect(await screen.findByRole("status")).toHaveTextContent("restored your unfinished work");
        const list = await screen.findByRole("list", { name: "Your photos and videos" });
        expect(within(list).getAllByRole("listitem")).toHaveLength(2);
        expect(user).toBeTruthy();
    });

    it("edit mode loads the product and its gallery from the server", async () => {
        api.get.mockImplementation(async (url) => {
            if (url === "/categories") return { data: { data: [] } };
            if (url === "/products/mine/9") return { data: { data: { id: 9, name: "Painting", price: "50000", is_draft: false, category_id: 1 } } };
            if (url === "/products/9/media") return { data: { data: [{ id: 3, kind: "image", url: "https://cdn/a.webp", is_cover: true, edits: null }] } };
            return { data: { data: [] } };
        });
        renderWizard("/seller/products/9/edit");
        const list = await screen.findByRole("list", { name: "Your photos and videos" });
        expect(within(list).getAllByRole("listitem")).toHaveLength(1);
        expect(within(list).getByText("Cover")).toBeInTheDocument();
    });
});
