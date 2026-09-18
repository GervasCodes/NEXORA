import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import MarkdownLite from "../../src/components/legal/MarkdownLite";

// Phase 3 (Security Hardening).
//
// WRITTEN BUT NOT RUN, per the phase's ground rules.
//
// Two things are asserted here:
//
//   1. MarkdownLite does not render raw HTML. This was already true
//      before this phase — every node is a constructed JSX element and
//      all text reaches the DOM through `{value}`, so React escapes it.
//      These tests lock that in so a future "let's just use
//      dangerouslySetInnerHTML for speed" refactor fails loudly.
//
//   2. The new href allow-list. Previously the href of a `[text](url)`
//      link was passed verbatim to `<a href>`, and React does not block
//      `javascript:` URLs.

const renderDoc = (content) =>
    render(
        <MemoryRouter>
            <MarkdownLite content={content} />
        </MemoryRouter>
    );

describe("MarkdownLite — no raw HTML is ever parsed", () => {
    it("renders a script tag as visible text, not as an element", () => {
        const { container } = renderDoc("A paragraph with <script>alert(1)</script> inside.");

        expect(container.querySelector("script")).toBeNull();
        expect(container.textContent).toContain("<script>alert(1)</script>");
    });

    it("renders an onerror img payload as text, not as an element", () => {
        const { container } = renderDoc('Here: <img src=x onerror="alert(1)">');

        expect(container.querySelector("img")).toBeNull();
        expect(container.textContent).toContain("onerror");
    });

    it("escapes HTML inside table cells too", () => {
        const { container } = renderDoc(
            ["| Header |", "|---|", "| <b>not bold</b> |"].join("\n")
        );

        expect(container.querySelector("td b")).toBeNull();
        expect(container.textContent).toContain("<b>not bold</b>");
    });
});

describe("MarkdownLite — link href allow-list", () => {
    it("renders an internal path as a router link", () => {
        renderDoc("See the [Refund Policy](/legal/refund-policy).");

        const link = screen.getByRole("link", { name: "Refund Policy" });
        expect(link.getAttribute("href")).toBe("/legal/refund-policy");
    });

    it("renders an https link as an external anchor with rel protections", () => {
        renderDoc("See [the docs](https://example.com/docs).");

        const link = screen.getByRole("link", { name: "the docs" });
        expect(link.getAttribute("href")).toBe("https://example.com/docs");
        expect(link.getAttribute("rel")).toContain("noopener");
    });

    it("allows mailto: and tel:", () => {
        renderDoc("[Email us](mailto:support@example.com) or [call](tel:+255700000000).");

        expect(screen.getByRole("link", { name: "Email us" }).getAttribute("href"))
            .toBe("mailto:support@example.com");
        expect(screen.getByRole("link", { name: "call" }).getAttribute("href"))
            .toBe("tel:+255700000000");
    });

    it("refuses a javascript: URL — renders the label as plain text, no link", () => {
        const { container } = renderDoc("[Click me](javascript:alert(1))");

        expect(container.querySelector("a")).toBeNull();
        expect(container.textContent).toContain("Click me");
        expect(container.textContent).not.toContain("javascript:");
    });

    it("refuses a javascript: URL regardless of casing or leading whitespace", () => {
        const { container } = renderDoc("[One](JaVaScRiPt:alert(1)) and [Two](   javascript:alert(2))");

        expect(container.querySelector("a")).toBeNull();
        expect(container.textContent).toContain("One");
        expect(container.textContent).toContain("Two");
    });

    it("refuses a data: URL", () => {
        const { container } = renderDoc("[Open](data:text/html,<script>alert(1)</script>)");

        expect(container.querySelector("a")).toBeNull();
    });

    it("refuses a protocol-relative //host URL, which a browser treats as external", () => {
        const { container } = renderDoc("[Go](//evil.example.com/phish)");

        expect(container.querySelector("a")).toBeNull();
        expect(container.textContent).toContain("Go");
    });
});
