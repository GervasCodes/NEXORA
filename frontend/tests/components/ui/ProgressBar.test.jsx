import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import ProgressBar from "../../../src/components/ui/ProgressBar";

describe("ProgressBar", () => {
    it("exposes role=progressbar with aria-valuenow when determinate", () => {
        render(<ProgressBar value={42} label="Upload progress" />);
        const bar = screen.getByRole("progressbar", { name: "Upload progress" });
        expect(bar).toHaveAttribute("aria-valuemin", "0");
        expect(bar).toHaveAttribute("aria-valuemax", "100");
        expect(bar).toHaveAttribute("aria-valuenow", "42");
    });

    it("omits aria-valuenow when indeterminate (no value)", () => {
        render(<ProgressBar label="Working" />);
        expect(screen.getByRole("progressbar")).not.toHaveAttribute("aria-valuenow");
    });

    it("treats null, NaN and non-numbers as indeterminate", () => {
        for (const value of [null, NaN, "50", Infinity]) {
            const { unmount } = render(<ProgressBar value={value} />);
            expect(screen.getByRole("progressbar")).not.toHaveAttribute("aria-valuenow");
            unmount();
        }
    });

    it("clamps to 0-100 and rounds to a whole number", () => {
        const { rerender } = render(<ProgressBar value={150} />);
        expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100");
        rerender(<ProgressBar value={-20} />);
        expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");
        rerender(<ProgressBar value={33.6} />);
        expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "34");
    });

    it("sets the fill width from the value", () => {
        const { container } = render(<ProgressBar value={60} />);
        expect(container.querySelector("[style]")).toHaveStyle({ width: "60%" });
    });

    it("shows the percentage only when showValue is set and determinate", () => {
        const { rerender } = render(<ProgressBar value={75} label="Upload" showValue />);
        expect(screen.getByText("75%")).toBeInTheDocument();
        rerender(<ProgressBar label="Upload" showValue />);
        expect(screen.queryByText(/%/)).toBeNull();
        rerender(<ProgressBar value={75} label="Upload" />);
        expect(screen.queryByText("75%")).toBeNull();
    });

    it("hideLabel keeps the aria-label but drops the visible text", () => {
        render(<ProgressBar value={10} label="Upload" hideLabel />);
        expect(screen.getByRole("progressbar", { name: "Upload" })).toBeInTheDocument();
        expect(screen.queryByText("Upload")).toBeNull();
    });

    it("falls back to defaults for unknown size/tone and merges className", () => {
        const { container } = render(<ProgressBar value={20} size="huge" tone="neon" className="max-w-xs" />);
        expect(container.firstChild).toHaveClass("max-w-xs");
        expect(screen.getByRole("progressbar")).toHaveClass("h-1.5");
        expect(container.querySelector(".bg-mango")).not.toBeNull();
    });

    it("applies the requested tone", () => {
        const { container } = render(<ProgressBar value={20} tone="teal" />);
        expect(container.querySelector(".bg-teal")).not.toBeNull();
        expect(container.querySelector(".bg-mango")).toBeNull();
    });
});
