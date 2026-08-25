import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import EmptyState from "../../../src/components/ui/EmptyState";
import ErrorState from "../../../src/components/ui/ErrorState";
import Input from "../../../src/components/ui/Input";
import PageLoader from "../../../src/components/PageLoader";

// D1 (Phase 4 remediation): these components previously communicated
// nothing to assistive tech - a screen-reader user navigating into an
// empty list, a failed fetch, or a loading page heard silence. These
// tests only assert the ARIA roles/labels landed, not visual output.
describe("D1 accessibility roles", () => {
    it("EmptyState exposes role=status so its message is announced", () => {
        render(<EmptyState title="No orders yet." />);
        expect(screen.getByRole("status")).toHaveTextContent("No orders yet.");
    });

    it("ErrorState exposes role=alert so a failed fetch is announced", () => {
        render(<ErrorState title="Something went wrong" />);
        expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong");
    });

    it("PageLoader exposes role=status with a Loading label", () => {
        render(<PageLoader />);
        expect(screen.getByRole("status")).toHaveTextContent("Loading");
    });

    it("Input marks its error message with role=alert and sets aria-required", () => {
        render(<Input label="Email" required error="Email is required" />);
        expect(screen.getByRole("alert")).toHaveTextContent("Email is required");
        expect(screen.getByLabelText("Email*")).toHaveAttribute("aria-required", "true");
    });
});
