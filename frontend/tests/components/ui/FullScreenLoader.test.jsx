import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";

import FullScreenLoader from "../../../src/components/ui/FullScreenLoader";

vi.mock("../../../src/components/ui/useT", () => ({ default: () => (k) => k }));

describe("FullScreenLoader", () => {
    beforeEach(() => { vi.useFakeTimers(); });
    afterEach(() => { vi.useRealTimers(); document.body.style.overflow = ""; });

    it("renders nothing when closed", () => {
        render(<FullScreenLoader open={false} message="Working" />);
        expect(screen.queryByRole("alertdialog")).toBeNull();
    });

    it("waits for the delay so quick actions never flash it", () => {
        render(<FullScreenLoader open message="Taking you to secure payment…" delay={250} />);
        act(() => { vi.advanceTimersByTime(200); });
        expect(screen.queryByRole("alertdialog")).toBeNull();
        act(() => { vi.advanceTimersByTime(100); });
        const dialog = screen.getByRole("alertdialog");
        expect(dialog).toHaveAttribute("aria-busy", "true");
        expect(dialog).toHaveAttribute("aria-modal", "true");
        expect(screen.getByText("Taking you to secure payment…")).toBeInTheDocument();
    });

    it("never shows if the action finishes inside the delay", () => {
        const { rerender } = render(<FullScreenLoader open message="x" delay={250} />);
        act(() => { vi.advanceTimersByTime(100); });
        rerender(<FullScreenLoader open={false} message="x" delay={250} />);
        act(() => { vi.advanceTimersByTime(1000); });
        expect(screen.queryByRole("alertdialog")).toBeNull();
    });

    it("locks page scroll while visible and restores it afterwards", () => {
        const { rerender } = render(<FullScreenLoader open message="x" delay={0} />);
        act(() => { vi.advanceTimersByTime(10); });
        expect(document.body.style.overflow).toBe("hidden");
        rerender(<FullScreenLoader open={false} message="x" delay={0} />);
        expect(document.body.style.overflow).not.toBe("hidden");
    });

    it("offers a cancel escape hatch only after the slow threshold", () => {
        const onCancel = vi.fn();
        render(<FullScreenLoader open message="x" delay={0} slowAfter={15000} onCancel={onCancel} />);
        act(() => { vi.advanceTimersByTime(14000); });
        expect(screen.queryByText("loader.slow")).toBeNull();
        act(() => { vi.advanceTimersByTime(2000); });
        expect(screen.getByText("loader.slow")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "common.cancel" }));
        expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it("shows the slow note but no cancel button when nothing can be cancelled", () => {
        render(<FullScreenLoader open message="x" delay={0} slowAfter={1000} />);
        act(() => { vi.advanceTimersByTime(1500); });
        expect(screen.getByText("loader.slow")).toBeInTheDocument();
        expect(screen.queryByRole("button")).toBeNull();
    });
});
