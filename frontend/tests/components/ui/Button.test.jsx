import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import Button from "../../../src/components/ui/Button";

// Phase 6 (icon3d roadmap): primary carries the mango-tinted "btn-*"
// elevation set and lifts/presses on hover/active; secondary carries only
// the faint neutral "btn-flat-rest" shadow with no lift/press; ghost stays
// fully flat. These tests guard that visual contract - a future edit to
// Button.jsx that silently drops the elevation classes from one variant
// should fail here rather than only being caught by eyeballing the UI.
describe("Button elevation classes", () => {
    it("primary variant has rest/hover/active elevation and lift/press transforms", () => {
        render(<Button>Buy now</Button>);
        const button = screen.getByRole("button", { name: "Buy now" });

        expect(button).toHaveClass("shadow-btn-rest");
        expect(button).toHaveClass("hover:shadow-btn-hover");
        expect(button).toHaveClass("hover:-translate-y-0.5");
        expect(button).toHaveClass("active:shadow-btn-active");
        expect(button).toHaveClass("active:translate-y-0");
    });

    it("primary variant drops elevation when disabled", () => {
        render(<Button disabled>Buy now</Button>);
        const button = screen.getByRole("button", { name: "Buy now" });

        expect(button).toHaveClass("disabled:shadow-none");
        expect(button).toHaveClass("disabled:translate-y-0");
    });

    it("secondary variant only has the faint flat rest shadow, no lift/press", () => {
        render(<Button variant="secondary">Cancel</Button>);
        const button = screen.getByRole("button", { name: "Cancel" });

        expect(button).toHaveClass("shadow-btn-flat-rest");
        expect(button.className).not.toMatch(/shadow-btn-rest\b/);
        expect(button.className).not.toMatch(/shadow-btn-hover/);
        expect(button.className).not.toMatch(/shadow-btn-active/);
        expect(button.className).not.toMatch(/-translate-y-0\.5/);
    });

    it("ghost variant carries no elevation classes at all", () => {
        render(<Button variant="ghost">Dismiss</Button>);
        const button = screen.getByRole("button", { name: "Dismiss" });

        expect(button.className).not.toMatch(/shadow-btn/);
        expect(button.className).not.toMatch(/-translate-y-0\.5/);
    });
});
