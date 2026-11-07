import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

vi.mock("../../../src/components/ui/useT", () => ({ default: () => (k) => k }));

import PullToRefresh from "../../../src/components/ui/PullToRefresh";

// jsdom has no matchMedia. Install one that answers per media query.
const setMedia = ({ touch = false, reduced = false } = {}) => {
    window.matchMedia = vi.fn((query) => ({
        matches: query.includes("pointer: coarse") ? touch : query.includes("prefers-reduced-motion") ? reduced : false,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {}
    }));
};

const touch = (clientX, clientY) => ({ touches: [{ clientX, clientY }] });

// Drag gesture helper: start at y=0, move down by `dy` (pull = dy * 0.5, ready at >=70 i.e. dy >= 140).
const startPull = (el, dy, { x = 0 } = {}) => {
    fireEvent.touchStart(el, touch(x, 0));
    fireEvent.touchMove(el, touch(x, dy));
};

const deferred = () => {
    let resolve;
    const promise = new Promise((r) => { resolve = r; });
    return { promise, resolve };
};

describe("PullToRefresh", () => {
    beforeEach(() => { vi.useFakeTimers(); });
    afterEach(() => { vi.useRealTimers(); delete window.matchMedia; });

    it("renders children only on non-touch devices (no indicator, no button)", () => {
        setMedia({ touch: false });
        render(<PullToRefresh onRefresh={() => {}}><p>content</p></PullToRefresh>);
        expect(screen.getByText("content")).toBeInTheDocument();
        expect(screen.queryByRole("button")).toBeNull();
        expect(screen.queryByRole("status")).toBeNull();
    });

    it("renders only children when disabled, even on touch", () => {
        setMedia({ touch: true, reduced: true });
        render(<PullToRefresh enabled={false} onRefresh={() => {}}><p>content</p></PullToRefresh>);
        expect(screen.getByText("content")).toBeInTheDocument();
        expect(screen.queryByRole("button")).toBeNull();
    });

    it("applies className to the wrapper", () => {
        setMedia();
        const { container } = render(<PullToRefresh className="page" onRefresh={() => {}}>x</PullToRefresh>);
        expect(container.firstChild).toHaveClass("page");
    });

    describe("touch + reduced motion: manual Refresh button", () => {
        beforeEach(() => setMedia({ touch: true, reduced: true }));

        it("shows a Refresh button instead of the gesture", () => {
            render(<PullToRefresh onRefresh={() => {}}><p>content</p></PullToRefresh>);
            expect(screen.getByRole("button", { name: "ptr.refresh" })).toBeInTheDocument();
        });

        it("calls onRefresh and shows a busy state until it resolves", async () => {
            const d = deferred();
            const onRefresh = vi.fn(() => d.promise);
            render(<PullToRefresh onRefresh={onRefresh}>x</PullToRefresh>);
            fireEvent.click(screen.getByRole("button", { name: "ptr.refresh" }));
            expect(onRefresh).toHaveBeenCalledTimes(1);
            expect(screen.getByRole("button")).toHaveAttribute("aria-busy", "true");
            await act(async () => { d.resolve(); await d.promise; });
            expect(screen.getByRole("button")).not.toHaveAttribute("aria-busy");
        });

        it("clears the busy state even when onRefresh rejects", async () => {
            const onRefresh = vi.fn(() => Promise.reject(new Error("nope")));
            render(<PullToRefresh onRefresh={onRefresh}>x</PullToRefresh>);
            // The component's finally block resets the state; the rejection itself
            // propagates from the click handler, so swallow it here.
            const onUnhandled = (e) => e.preventDefault?.();
            process.on("unhandledRejection", onUnhandled);
            await act(async () => {
                fireEvent.click(screen.getByRole("button", { name: "ptr.refresh" }));
                await Promise.resolve();
                await Promise.resolve();
            });
            process.off("unhandledRejection", onUnhandled);
            expect(screen.getByRole("button")).not.toHaveAttribute("aria-busy");
        });
    });

    describe("touch gesture", () => {
        beforeEach(() => setMedia({ touch: true, reduced: false }));

        // RTL wraps the render in a <div>; the component root is its first child.
        const container = () => document.body.firstChild.firstChild;

        it("shows 'pull' hint while dragging below the threshold", () => {
            render(<PullToRefresh onRefresh={() => {}}>x</PullToRefresh>);
            act(() => startPull(container(), 60)); // pull = 30
            expect(screen.getByRole("status")).toHaveTextContent("ptr.pull");
        });

        it("switches to 'release' once past the threshold", () => {
            render(<PullToRefresh onRefresh={() => {}}>x</PullToRefresh>);
            act(() => startPull(container(), 200)); // pull = 100
            expect(screen.getByRole("status")).toHaveTextContent("ptr.release");
        });

        it("does not refresh when released below the threshold", () => {
            const onRefresh = vi.fn();
            render(<PullToRefresh onRefresh={onRefresh}>x</PullToRefresh>);
            act(() => startPull(container(), 60));
            act(() => { fireEvent.touchEnd(container()); });
            expect(onRefresh).not.toHaveBeenCalled();
            expect(screen.queryByRole("status")).toBeNull();
        });

        it("refreshes on release past the threshold: refreshing -> updated -> idle", async () => {
            const d = deferred();
            const onRefresh = vi.fn(() => d.promise);
            render(<PullToRefresh onRefresh={onRefresh}>x</PullToRefresh>);
            act(() => startPull(container(), 200));
            await act(async () => { fireEvent.touchEnd(container()); });
            expect(onRefresh).toHaveBeenCalledTimes(1);
            expect(screen.getByRole("status")).toHaveTextContent("ptr.refreshing");

            await act(async () => { d.resolve(); await d.promise; });
            expect(screen.getByRole("status")).toHaveTextContent("ptr.updated");

            await act(async () => { vi.advanceTimersByTime(700); });
            expect(screen.queryByRole("status")).toBeNull();
        });

        it("still finishes (and does not throw) when onRefresh rejects", async () => {
            const onRefresh = vi.fn(() => Promise.reject(new Error("fail")));
            render(<PullToRefresh onRefresh={onRefresh}>x</PullToRefresh>);
            act(() => startPull(container(), 200));
            await act(async () => { fireEvent.touchEnd(container()); });
            expect(screen.getByRole("status")).toHaveTextContent("ptr.updated");
            await act(async () => { vi.advanceTimersByTime(700); });
            expect(screen.queryByRole("status")).toBeNull();
        });

        it("ignores a second pull while a refresh is running", async () => {
            const d = deferred();
            const onRefresh = vi.fn(() => d.promise);
            render(<PullToRefresh onRefresh={onRefresh}>x</PullToRefresh>);
            act(() => startPull(container(), 200));
            await act(async () => { fireEvent.touchEnd(container()); });
            act(() => startPull(container(), 200));
            await act(async () => { fireEvent.touchEnd(container()); });
            expect(onRefresh).toHaveBeenCalledTimes(1);
            await act(async () => { d.resolve(); await d.promise; });
        });

        it("ignores mostly-horizontal drags", () => {
            render(<PullToRefresh onRefresh={() => {}}>x</PullToRefresh>);
            act(() => {
                fireEvent.touchStart(container(), touch(0, 0));
                fireEvent.touchMove(container(), touch(100, 20));
            });
            expect(screen.queryByRole("status")).toBeNull();
        });

        it("ignores upward drags", () => {
            render(<PullToRefresh onRefresh={() => {}}>x</PullToRefresh>);
            act(() => {
                fireEvent.touchStart(container(), touch(0, 100));
                fireEvent.touchMove(container(), touch(0, 20));
            });
            expect(screen.queryByRole("status")).toBeNull();
        });

        it("does not arm when the page is already scrolled", () => {
            Object.defineProperty(window, "scrollY", { value: 50, configurable: true });
            try {
                render(<PullToRefresh onRefresh={() => {}}>x</PullToRefresh>);
                act(() => startPull(container(), 200));
                expect(screen.queryByRole("status")).toBeNull();
            } finally {
                Object.defineProperty(window, "scrollY", { value: 0, configurable: true });
            }
        });

        it("does not arm when the touch starts inside a form field", () => {
            const onRefresh = vi.fn();
            render(<PullToRefresh onRefresh={onRefresh}><input aria-label="name" /></PullToRefresh>);
            const input = screen.getByLabelText("name");
            act(() => {
                fireEvent.touchStart(input, touch(0, 0));
                fireEvent.touchMove(input, touch(0, 200));
            });
            expect(screen.queryByRole("status")).toBeNull();
        });

        it("does not arm when the touch starts inside a data-no-ptr region", () => {
            render(<PullToRefresh onRefresh={() => {}}><div data-no-ptr data-testid="blocked">map</div></PullToRefresh>);
            const blocked = screen.getByTestId("blocked");
            act(() => {
                fireEvent.touchStart(blocked, touch(0, 0));
                fireEvent.touchMove(blocked, touch(0, 200));
            });
            expect(screen.queryByRole("status")).toBeNull();
        });

        it("restores the document's overscroll-behavior on unmount", () => {
            document.documentElement.style.overscrollBehaviorY = "auto";
            const { unmount } = render(<PullToRefresh onRefresh={() => {}}>x</PullToRefresh>);
            expect(document.documentElement.style.overscrollBehaviorY).toBe("contain");
            unmount();
            expect(document.documentElement.style.overscrollBehaviorY).toBe("auto");
        });
    });
});
