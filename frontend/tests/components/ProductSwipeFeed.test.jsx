import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, waitFor, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const mockGet = vi.fn();
vi.mock("../../src/api/client", () => ({
    default: { get: (...args) => mockGet(...args) }
}));
vi.mock("../../src/context/LanguageContext", () => ({ useLanguage: () => ({ t: (key) => key }) }));
vi.mock("../../src/context/CurrencyContext", () => ({ useCurrency: () => ({ format: (v) => `TZS ${v}` }) }));

import ProductSwipeFeed, { LOAD_AHEAD } from "../../src/components/ProductSwipeFeed";

// setupTests' IntersectionObserver stub never fires. Swap in one that
// records its targets so a test can report "slide N is now on screen".
let observers = [];
class RecordingObserver {
    constructor(callback) { this.callback = callback; this.targets = []; observers.push(this); }
    observe(node) { this.targets.push(node); }
    unobserve() {}
    disconnect() {}
}
const realObserver = global.IntersectionObserver;
const realPlay = window.HTMLMediaElement.prototype.play;

const showSlide = (index) => {
    const observer = observers[observers.length - 1];
    const target = observer.targets.find((node) => node.dataset.feedIndex === String(index));
    act(() => observer.callback([{ isIntersecting: true, target }]));
};

const makeProducts = (count, overrides = {}) =>
    Array.from({ length: count }, (_, i) => ({
        id: i + 1,
        slug: `product-${i + 1}`,
        name: `Product ${i + 1}`,
        price: "1000",
        discount_price: null,
        store_name: "Store",
        image_url: `https://img.test/${i + 1}.jpg`,
        ...(overrides[i] || {})
    }));

const baseProps = { hasMore: false, loadingMore: false, onLoadMore: vi.fn(), onClose: vi.fn(), onOpenFilters: vi.fn() };

const renderFeed = (props) =>
    render(
        <MemoryRouter>
            <ProductSwipeFeed {...baseProps} {...props} />
        </MemoryRouter>
    );

beforeEach(() => {
    observers = [];
    global.IntersectionObserver = RecordingObserver;
    window.HTMLMediaElement.prototype.play = vi.fn();
    mockGet.mockReset();
    mockGet.mockResolvedValue({ data: { data: { videos: [] } } });
    baseProps.onLoadMore = vi.fn();
});

afterEach(() => {
    global.IntersectionObserver = realObserver;
    window.HTMLMediaElement.prototype.play = realPlay;
});

describe("ProductSwipeFeed media", () => {
    it("plays a product's video when it has one, and shows its image otherwise", () => {
        const products = makeProducts(2, { 1: { videos: [{ id: 9, video_url: "https://cdn.test/clip.mp4" }] } });
        const { container } = renderFeed({ products });

        // Slide 0 has no video: image only.
        expect(container.querySelector("video")).toBeNull();
        expect(container.querySelector("img")).toHaveAttribute("src", "https://img.test/1.jpg");

        // Slide 1 has one: it becomes the active slide and plays.
        showSlide(1);
        expect(container.querySelector("video")).toHaveAttribute("src", "https://cdn.test/clip.mp4");
    });

    it("finds a video the list response didn't include by looking up the product detail", async () => {
        mockGet.mockResolvedValue({ data: { data: { videos: [{ id: 1, video_url: "https://cdn.test/detail.mp4" }] } } });
        const { container } = renderFeed({ products: makeProducts(1) });

        await waitFor(() => expect(container.querySelector("video")).toHaveAttribute("src", "https://cdn.test/detail.mp4"));
        expect(mockGet).toHaveBeenCalledWith("/products/product-1");
    });
});

describe("ProductSwipeFeed pagination", () => {
    it("requests the next page once when the shopper nears the end, not on every slide change", () => {
        const onLoadMore = vi.fn();
        renderFeed({ products: makeProducts(8), hasMore: true, onLoadMore });

        showSlide(8 - LOAD_AHEAD - 1);
        expect(onLoadMore).not.toHaveBeenCalled();

        showSlide(8 - LOAD_AHEAD);
        expect(onLoadMore).toHaveBeenCalledTimes(1);

        // Same loaded length, still near the end: no second request.
        showSlide(8 - 1);
        showSlide(8 - LOAD_AHEAD);
        expect(onLoadMore).toHaveBeenCalledTimes(1);
    });

    it("asks again after more products have loaded, and never when there is nothing more", () => {
        const onLoadMore = vi.fn();
        const { rerender } = renderFeed({ products: makeProducts(8), hasMore: true, onLoadMore });
        showSlide(7);
        expect(onLoadMore).toHaveBeenCalledTimes(1);

        rerender(
            <MemoryRouter>
                <ProductSwipeFeed {...baseProps} products={makeProducts(16)} hasMore onLoadMore={onLoadMore} />
            </MemoryRouter>
        );
        showSlide(15);
        expect(onLoadMore).toHaveBeenCalledTimes(2);

        const noMore = vi.fn();
        renderFeed({ products: makeProducts(4), hasMore: false, onLoadMore: noMore });
        showSlide(3);
        expect(noMore).not.toHaveBeenCalled();
    });
});
