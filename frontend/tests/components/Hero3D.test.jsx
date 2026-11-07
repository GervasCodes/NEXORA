import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("../../src/components/HomeCarousel", () => ({
    default: () => <div data-testid="home-carousel">carousel</div>
}));

import Hero3D from "../../src/components/Hero3D";

// Hero3D no longer branches on device/preference support - every homepage
// (seller, buyer, logged-out, all of them) now always gets the same
// full-size HomeCarousel banner. See Hero3D.jsx.
describe("Hero3D", () => {
    it("always renders HomeCarousel", () => {
        render(<Hero3D />);

        expect(screen.getByTestId("home-carousel")).toBeInTheDocument();
    });
});
