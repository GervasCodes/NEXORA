import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import ReadReceipt from "../../../src/components/chat/ReadReceipt";

describe("ReadReceipt", () => {
    it("renders a single check (one path) for 'sent'", () => {
        render(<ReadReceipt status="sent" />);
        const el = screen.getByLabelText("sent");
        expect(el.querySelectorAll("path")).toHaveLength(1);
        expect(el.className).toContain("text-frost/60");
    });

    it("renders a double check (two paths) for 'delivered', in the muted color", () => {
        render(<ReadReceipt status="delivered" />);
        const el = screen.getByLabelText("delivered");
        expect(el.querySelectorAll("path")).toHaveLength(2);
        expect(el.className).toContain("text-frost/60");
    });

    it("renders a double check in the azure 'read' color for 'read'", () => {
        render(<ReadReceipt status="read" />);
        const el = screen.getByLabelText("read");
        expect(el.querySelectorAll("path")).toHaveLength(2);
        expect(el.className).toContain("text-azure");
        expect(el.className).not.toContain("text-frost/60");
    });
});
