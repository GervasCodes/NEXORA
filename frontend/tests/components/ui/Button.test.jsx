import { createRef } from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

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

describe("Button behaviour", () => {
    it("defaults to type=button so it never submits a form by accident", () => {
        render(<Button>Go</Button>);
        expect(screen.getByRole("button", { name: "Go" })).toHaveAttribute("type", "button");
    });

    it("forwards type=submit", () => {
        render(<Button type="submit">Save</Button>);
        expect(screen.getByRole("button", { name: "Save" })).toHaveAttribute("type", "submit");
    });

    it("calls onClick, but not when disabled", async () => {
        const onClick = vi.fn();
        const user = userEvent.setup();
        const { rerender } = render(<Button onClick={onClick}>Go</Button>);
        await user.click(screen.getByRole("button"));
        expect(onClick).toHaveBeenCalledTimes(1);
        rerender(<Button onClick={onClick} disabled>Go</Button>);
        await user.click(screen.getByRole("button"));
        expect(onClick).toHaveBeenCalledTimes(1);
    });

    it("applies size classes and falls back to md for unknown sizes", () => {
        const { rerender } = render(<Button size="sm">A</Button>);
        expect(screen.getByRole("button")).toHaveClass("text-xs", "px-3");
        rerender(<Button size="lg">A</Button>);
        expect(screen.getByRole("button")).toHaveClass("w-full");
        rerender(<Button size="xxl">A</Button>);
        expect(screen.getByRole("button")).toHaveClass("text-sm", "px-5");
    });

    it("falls back to primary for an unknown variant", () => {
        render(<Button variant="weird">A</Button>);
        expect(screen.getByRole("button")).toHaveClass("bg-mango");
    });

    it("fullWidth and className are merged", () => {
        render(<Button fullWidth className="extra">A</Button>);
        expect(screen.getByRole("button")).toHaveClass("w-full", "extra");
    });

    it("loading disables the button, sets aria-busy and blocks clicks", async () => {
        const onClick = vi.fn();
        const user = userEvent.setup();
        render(<Button loading onClick={onClick}>Save</Button>);
        const button = screen.getByRole("button");
        expect(button).toBeDisabled();
        expect(button).toHaveAttribute("aria-busy", "true");
        await user.click(button);
        expect(onClick).not.toHaveBeenCalled();
    });

    it("loadingText replaces the label only while loading", () => {
        const { rerender } = render(<Button loading loadingText="Saving…">Save</Button>);
        expect(screen.getByRole("button")).toHaveTextContent("Saving…");
        rerender(<Button loadingText="Saving…">Save</Button>);
        expect(screen.getByRole("button")).toHaveTextContent("Save");
        expect(screen.getByRole("button")).not.toHaveAttribute("aria-busy");
    });

    it("keeps the original label while loading when no loadingText is given", () => {
        render(<Button loading>Save</Button>);
        expect(screen.getByRole("button")).toHaveTextContent("Save");
    });

    it("renders a polymorphic link with aria-disabled and prevents navigation when inert", () => {
        const onClick = vi.fn();
        const Anchor = ({ children, ...p }) => <a {...p}>{children}</a>;
        const { rerender } = render(<Button as={Anchor} href="/x" onClick={onClick}>Open</Button>);
        const link = screen.getByRole("link", { name: "Open" });
        expect(link).not.toHaveAttribute("type");
        expect(link).not.toHaveAttribute("aria-disabled");

        rerender(<Button as={Anchor} href="/x" loading onClick={onClick}>Open</Button>);
        const inert = screen.getByRole("link", { name: "Open" });
        expect(inert).toHaveAttribute("aria-disabled", "true");
        const event = new MouseEvent("click", { bubbles: true, cancelable: true });
        inert.dispatchEvent(event);
        expect(event.defaultPrevented).toBe(true);
        expect(onClick).not.toHaveBeenCalled();
    });

    it("forwards refs to the underlying element", () => {
        const ref = createRef();
        render(<Button ref={ref}>A</Button>);
        expect(ref.current).toBeInstanceOf(HTMLButtonElement);
    });
});
