import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act } from "@testing-library/react";

let saverState = null;
vi.mock("../../src/context/DataSaverContext", () => ({
    useDataSaver: () => saverState
}));

import useInfiniteScroll from "../../src/hooks/useInfiniteScroll";

// The shared test setup stubs IntersectionObserver with a no-op class. Here
// we need to observe construction and trigger the callback by hand.
let observers;
class FakeObserver {
    constructor(cb, options) {
        this.cb = cb;
        this.options = options;
        this.observed = [];
        this.disconnected = false;
        observers.push(this);
    }
    observe(el) { this.observed.push(el); }
    unobserve() {}
    disconnect() { this.disconnected = true; }
    trigger(isIntersecting = true) { this.cb([{ isIntersecting }]); }
}

function Harness({ showSentinel = true, onResult, ...opts }) {
    const result = useInfiniteScroll(opts);
    onResult?.(result);
    return showSentinel ? <div data-testid="sentinel" ref={result.sentinelRef} /> : null;
}

const live = () => observers.filter((o) => !o.disconnected);

describe("useInfiniteScroll", () => {
    let original;
    beforeEach(() => {
        original = global.IntersectionObserver;
        observers = [];
        saverState = null;
        global.IntersectionObserver = FakeObserver;
    });
    afterEach(() => { global.IntersectionObserver = original; });

    it("observes the sentinel and loads more when it intersects", () => {
        const onLoadMore = vi.fn();
        const { getByTestId } = render(<Harness hasMore loading={false} onLoadMore={onLoadMore} />);
        expect(live()).toHaveLength(1);
        expect(live()[0].observed[0]).toBe(getByTestId("sentinel"));
        act(() => live()[0].trigger(true));
        expect(onLoadMore).toHaveBeenCalledTimes(1);
    });

    it("ignores non-intersecting entries", () => {
        const onLoadMore = vi.fn();
        render(<Harness hasMore loading={false} onLoadMore={onLoadMore} />);
        act(() => live()[0].trigger(false));
        expect(onLoadMore).not.toHaveBeenCalled();
    });

    it("uses a 400px rootMargin by default and accepts an override", () => {
        render(<Harness hasMore loading={false} onLoadMore={() => {}} />);
        expect(live()[0].options.rootMargin).toBe("400px");
        observers = [];
        render(<Harness hasMore loading={false} onLoadMore={() => {}} rootMargin="50px" />);
        expect(live()[0].options.rootMargin).toBe("50px");
    });

    it.each([
        ["there is nothing more to load", { hasMore: false }],
        ["a page is already loading", { loading: true }],
        ["an error is set", { error: new Error("boom") }],
        ["it is explicitly disabled", { disabled: true }]
    ])("does not observe when %s", (_label, override) => {
        let result;
        render(<Harness hasMore loading={false} onLoadMore={() => {}} {...override} onResult={(r) => { result = r; }} />);
        expect(live()).toHaveLength(0);
        expect(result.autoLoad).toBe(false);
    });

    it("turns auto-load off in data-saver mode", () => {
        saverState = { enabled: true };
        let result;
        render(<Harness hasMore loading={false} onLoadMore={() => {}} onResult={(r) => { result = r; }} />);
        expect(live()).toHaveLength(0);
        expect(result.autoLoad).toBe(false);
    });

    it("works without a DataSaverProvider (context is null)", () => {
        saverState = null;
        let result;
        render(<Harness hasMore loading={false} onLoadMore={() => {}} onResult={(r) => { result = r; }} />);
        expect(result.autoLoad).toBe(true);
    });

    it("calls the latest onLoadMore without re-creating the observer", () => {
        const first = vi.fn();
        const second = vi.fn();
        const { rerender } = render(<Harness hasMore loading={false} onLoadMore={first} />);
        const before = observers.length;
        rerender(<Harness hasMore loading={false} onLoadMore={second} />);
        expect(observers).toHaveLength(before);
        act(() => live()[0].trigger(true));
        expect(first).not.toHaveBeenCalled();
        expect(second).toHaveBeenCalledTimes(1);
    });

    it("disconnects when loading starts and re-attaches when it ends", () => {
        const { rerender } = render(<Harness hasMore loading={false} onLoadMore={() => {}} />);
        const first = live()[0];
        rerender(<Harness hasMore loading onLoadMore={() => {}} />);
        expect(first.disconnected).toBe(true);
        expect(live()).toHaveLength(0);
        rerender(<Harness hasMore loading={false} onLoadMore={() => {}} />);
        expect(live()).toHaveLength(1);
    });

    it("re-attaches to a new sentinel node after the list is remounted", () => {
        const { rerender, getByTestId } = render(<Harness hasMore loading={false} onLoadMore={() => {}} />);
        const firstNode = getByTestId("sentinel");
        rerender(<Harness hasMore loading={false} onLoadMore={() => {}} showSentinel={false} />);
        expect(live()).toHaveLength(0);
        rerender(<Harness hasMore loading={false} onLoadMore={() => {}} />);
        const secondNode = getByTestId("sentinel");
        expect(secondNode).not.toBe(firstNode);
        expect(live()).toHaveLength(1);
        expect(live()[0].observed[0]).toBe(secondNode);
    });

    it("disconnects on unmount", () => {
        const { unmount } = render(<Harness hasMore loading={false} onLoadMore={() => {}} />);
        const obs = live()[0];
        unmount();
        expect(obs.disconnected).toBe(true);
    });

    it("does not throw when IntersectionObserver is unavailable", () => {
        delete global.IntersectionObserver;
        expect(() => render(<Harness hasMore loading={false} onLoadMore={() => {}} />)).not.toThrow();
    });
});
