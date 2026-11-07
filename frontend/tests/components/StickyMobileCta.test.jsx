import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import StickyMobileCta from "../../src/components/StickyMobileCta";

describe("StickyMobileCta", () => {
    it("renders its children in a phone-only bar pinned above the safe-area inset", () => {
        render(<StickyMobileCta><button type="button">Do it</button></StickyMobileCta>);

        const bar = screen.getByRole("button", { name: "Do it" }).parentElement;
        for (const cls of ["md:hidden", "fixed", "inset-x-0", "bottom-[var(--bottom-inset)]", "z-[var(--z-float)]"]) {
            expect(bar.className).toContain(cls);
        }
    });

    it("adds a phone-only spacer so the last content is not hidden behind the bar", () => {
        const { container } = render(<StickyMobileCta>x</StickyMobileCta>);

        const spacer = container.firstElementChild;
        expect(spacer).toHaveAttribute("aria-hidden", "true");
        expect(spacer.className).toContain("md:hidden");
        expect(spacer.className).toContain("h-20");
    });
});
