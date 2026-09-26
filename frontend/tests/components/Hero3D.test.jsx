import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const mockUse3DHeroSupport = vi.fn();
vi.mock("../../src/hooks/use3DHeroSupport", () => ({
    use3DHeroSupport: () => mockUse3DHeroSupport()
}));

vi.mock("../../src/components/HomeCarousel", () => ({
    default: () => <div data-testid="home-carousel">carousel</div>
}));

// The real Hero3DScene imports @react-three/fiber, which needs a WebGL
// context jsdom doesn't provide - it's mocked here since this test is only
// about Hero3D's gating/fallback logic, not the scene itself.
vi.mock("../../src/components/hero3d/Hero3DScene", () => ({
    default: () => <div data-testid="hero-3d-scene">3d scene</div>
}));

import Hero3D from "../../src/components/Hero3D";

describe("Hero3D", () => {
    afterEach(() => {
        vi.clearAllMocks();
    });

    it("renders HomeCarousel when the device/preferences don't support the 3D hero", () => {
        mockUse3DHeroSupport.mockReturnValue(false);

        render(<Hero3D />);

        expect(screen.getByTestId("home-carousel")).toBeInTheDocument();
        expect(screen.queryByTestId("hero-3d-scene")).not.toBeInTheDocument();
    });

    it("renders the 3D scene when supported", async () => {
        mockUse3DHeroSupport.mockReturnValue(true);

        render(<Hero3D />);

        await waitFor(() => expect(screen.getByTestId("hero-3d-scene")).toBeInTheDocument());
    });
});
