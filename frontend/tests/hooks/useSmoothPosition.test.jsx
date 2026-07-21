import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import useSmoothPosition from "../../src/hooks/useSmoothPosition";

// requestAnimationFrame doesn't run in jsdom by default - drive it
// manually with a small helper that just invokes the callback once per
// call, treating each call as "one frame" a fixed distance apart.
const flushFrames = (count = 60) => {
    for (let i = 0; i < count; i++) {
        act(() => {
            vi.advanceTimersByTime(16);
        });
    }
};

describe("useSmoothPosition", () => {
    it("starts at the initial target immediately", () => {
        const { result } = renderHook(() => useSmoothPosition({ lat: -6.8, lng: 39.2, timestamp: 1 }));
        expect(result.current).toMatchObject({ lat: -6.8, lng: 39.2 });
    });

    it("returns null when there's no target yet", () => {
        const { result } = renderHook(() => useSmoothPosition(null));
        expect(result.current).toBeNull();
    });

    it("eventually animates to a new target position", async () => {
        vi.useFakeTimers();

        const { result, rerender } = renderHook(
            ({ target }) => useSmoothPosition(target, 200),
            { initialProps: { target: { lat: -6.80, lng: 39.20, timestamp: 1 } } }
        );

        rerender({ target: { lat: -6.90, lng: 39.30, timestamp: 2 } });

        flushFrames(30);

        // Should have moved from the old position, though not
        // necessarily landed exactly on the new one mid-animation.
        expect(result.current.lat).not.toBe(-6.80);

        vi.useRealTimers();
    });
});
