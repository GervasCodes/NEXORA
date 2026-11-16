import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act, fireEvent } from "@testing-library/react";
import { MemoryRouter, useNavigate } from "react-router-dom";
import ScrollToTop from "../../src/components/ScrollToTop";

let nav;
function Grab() {
    nav = useNavigate();
    return null;
}

// MemoryRouter gives every first entry the key "default", and ScrollToTop
// remembers positions per key across renders, so give each test its own.
let seq = 0;
function setup(initial = "/a") {
    const [pathname, search = ""] = initial.split("?");
    const entry = { pathname, search: search ? `?${search}` : "", key: `test-${++seq}` };
    return render(
        <MemoryRouter initialEntries={[entry]}>
            <ScrollToTop />
            <Grab />
            <div id="section-x" />
        </MemoryRouter>
    );
}

const setScrollY = (y) => Object.defineProperty(window, "scrollY", { value: y, configurable: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const topCalls = (spy) => spy.mock.calls.map((c) => c[0]?.top);

describe("ScrollToTop", () => {
    let scrollTo;
    let scrollIntoView;

    beforeEach(() => {
        scrollTo = vi.fn();
        window.scrollTo = scrollTo;
        scrollIntoView = vi.fn();
        Element.prototype.scrollIntoView = scrollIntoView;
        setScrollY(0);
        Object.defineProperty(document.documentElement, "scrollHeight", { value: 5000, configurable: true });
    });

    afterEach(() => {
        setScrollY(0);
    });

    it("does not move the page on the first render of a fresh visit", () => {
        setup("/a");
        expect(scrollTo).not.toHaveBeenCalled();
    });

    it("jumps to the top when navigating to a different page (the 'page starts at the bottom' bug)", () => {
        setup("/a");
        setScrollY(1800);
        act(() => nav("/b"));
        expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 0, behavior: "instant" }));
    });

    it("leaves the scroll alone when only filters/tabs in the query string change", () => {
        setup("/products");
        act(() => nav("/products?status=pending"));
        act(() => nav("/products?status=shipped", { replace: true }));
        expect(scrollTo).not.toHaveBeenCalled();
    });

    it("jumps to the top when the ?page number changes on the same pathname", () => {
        setup("/products?page=1");
        act(() => nav("/products?page=2"));
        expect(topCalls(scrollTo)).toEqual([0]);
    });

    it("honours state.preserveScroll", () => {
        setup("/a");
        act(() => nav("/b", { state: { preserveScroll: true } }));
        expect(scrollTo).not.toHaveBeenCalled();
    });

    it("scrolls a #hash target into view instead of jumping to the top", () => {
        setup("/a");
        act(() => nav("/b#section-x"));
        expect(scrollIntoView).toHaveBeenCalledTimes(1);
        expect(topCalls(scrollTo)).not.toContain(0);
    });

    it("restores the remembered position on Back", async () => {
        setup("/a");
        setScrollY(400);
        fireEvent.scroll(window);
        await act(async () => { await wait(40); }); // scroll position is recorded on the next frame

        act(() => nav("/b"));
        scrollTo.mockClear();
        act(() => nav(-1));

        expect(topCalls(scrollTo)).toEqual([400]);
    });

    it("goes to the top on Back when nothing was remembered for that entry", () => {
        setup("/a");
        act(() => nav("/b"));
        scrollTo.mockClear();
        act(() => nav(-1));
        expect(topCalls(scrollTo)).toEqual([0]);
    });
});
