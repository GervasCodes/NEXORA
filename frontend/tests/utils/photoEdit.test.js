import { describe, it, expect } from "vitest";
import { computeCrop, fitOutput, applyAdjustments, isEdited } from "../../src/utils/photoEdit";

describe("computeCrop", () => {
    it("returns the full image for 'original' at zoom 1", () => {
        expect(computeCrop(1000, 800, "original")).toEqual({ sx: 0, sy: 0, sw: 1000, sh: 800 });
    });
    it("crops a landscape photo to a centred square", () => {
        const c = computeCrop(1000, 800, "1:1");
        expect(c).toEqual({ sx: 100, sy: 0, sw: 800, sh: 800 });
    });
    it("crops to 4:5 and 16:9 with the right ratio", () => {
        const a = computeCrop(1000, 1000, "4:5");
        expect(a.sw / a.sh).toBeCloseTo(0.8);
        const b = computeCrop(1000, 1000, "16:9");
        expect(b.sw / b.sh).toBeCloseTo(16 / 9);
    });
    it("zooms in and keeps the window inside the image when panned to the extremes", () => {
        const c = computeCrop(1000, 1000, "1:1", 2, 1, -1);
        expect(c.sw).toBe(500);
        expect(c.sx + c.sw).toBeLessThanOrEqual(1000);
        expect(c.sy).toBe(0);
    });
});

describe("fitOutput", () => {
    it("shrinks the longest edge to the cap and never upscales", () => {
        expect(fitOutput(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200 });
        expect(fitOutput(800, 600, 1600)).toEqual({ width: 800, height: 600 });
    });
});

describe("applyAdjustments", () => {
    const px = () => new Uint8ClampedArray([100, 150, 200, 255]);
    it("is a no-op with neutral settings", () => {
        const d = px();
        applyAdjustments(d, { brightness: 0, contrast: 0, saturation: 0, filter: "none" });
        expect(Array.from(d)).toEqual([100, 150, 200, 255]);
    });
    it("brightens and darkens", () => {
        const up = px(); applyAdjustments(up, { brightness: 50 });
        const down = px(); applyAdjustments(down, { brightness: -50 });
        expect(up[0]).toBeGreaterThan(100);
        expect(down[0]).toBeLessThan(100);
    });
    it("the mono filter removes colour (r = g = b)", () => {
        const d = px(); applyAdjustments(d, { filter: "mono" });
        expect(Math.abs(d[0] - d[1])).toBeLessThanOrEqual(1);
        expect(Math.abs(d[1] - d[2])).toBeLessThanOrEqual(1);
    });
    it("never leaves the 0-255 range and keeps alpha", () => {
        const d = new Uint8ClampedArray([250, 5, 128, 77]);
        applyAdjustments(d, { brightness: 100, contrast: 100, saturation: 100 });
        expect(d[3]).toBe(77);
    });
});

describe("isEdited", () => {
    it("detects untouched vs edited settings", () => {
        expect(isEdited({ aspect: "original", rotate: 0, brightness: 0, contrast: 0, saturation: 0, filter: "none", zoom: 1 })).toBe(false);
        expect(isEdited({ aspect: "1:1", rotate: 0 })).toBe(true);
        expect(isEdited({ aspect: "original", rotate: 90 })).toBe(true);
    });
});
