import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import BrandLogo, { BRANDS } from "../../src/components/BrandLogo";

describe("BrandLogo", () => {
    it("renders a lazy image with alt text for a bundled brand", () => {
        render(<BrandLogo name="whatsapp" />);
        const img = screen.getByAltText("WhatsApp");
        expect(img).toHaveAttribute("src", "/brand/whatsapp.svg");
        expect(img).toHaveAttribute("loading", "lazy");
    });

    it("falls back to a named placeholder chip when the supplied file is missing", () => {
        render(<BrandLogo name="mpesa" />);
        fireEvent.error(screen.getByAltText("M-Pesa"));
        const chip = screen.getByRole("img", { name: "M-Pesa" });
        expect(chip).toHaveAttribute("data-brand-placeholder", "mpesa");
    });

    it("renders nothing for an unknown brand", () => {
        const { container } = render(<BrandLogo name="nope" />);
        expect(container).toBeEmptyDOMElement();
    });

    it("ships artwork for the four mobile-money networks", () => {
        for (const k of ["mpesa", "airtel_money", "mixx", "halopesa"]) expect(BRANDS[k].file).toMatch(/\.webp$/);
    });
});
