import { describe, it, expect, afterEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { computeHero3DSupport, use3DHeroSupport } from "../../src/hooks/use3DHeroSupport";

const ORIGINAL_MATCH_MEDIA = window.matchMedia;
const ORIGINAL_HARDWARE_CONCURRENCY = navigator.hardwareConcurrency;
const ORIGINAL_DEVICE_MEMORY = navigator.deviceMemory;
const ORIGINAL_CONNECTION = navigator.connection;

function mockMatchMedia(matches) {
    window.matchMedia = vi.fn().mockImplementation(() => ({ matches }));
}

function mockWebGL(supported) {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = vi.fn((type) => {
        if (!supported) return null;
        if (type === "webgl2" || type === "webgl" || type === "experimental-webgl") return {};
        return null;
    });
    return () => { HTMLCanvasElement.prototype.getContext = original; };
}

describe("computeHero3DSupport", () => {
    afterEach(() => {
        window.matchMedia = ORIGINAL_MATCH_MEDIA;
        Object.defineProperty(navigator, "hardwareConcurrency", { value: ORIGINAL_HARDWARE_CONCURRENCY, configurable: true });
        Object.defineProperty(navigator, "deviceMemory", { value: ORIGINAL_DEVICE_MEMORY, configurable: true });
        Object.defineProperty(navigator, "connection", { value: ORIGINAL_CONNECTION, configurable: true });
        vi.restoreAllMocks();
    });

    it("supports the hero when every signal is favorable", () => {
        mockMatchMedia(false);
        const restoreWebGL = mockWebGL(true);
        Object.defineProperty(navigator, "hardwareConcurrency", { value: 8, configurable: true });
        Object.defineProperty(navigator, "deviceMemory", { value: 8, configurable: true });
        Object.defineProperty(navigator, "connection", { value: { saveData: false }, configurable: true });

        expect(computeHero3DSupport()).toBe(true);
        restoreWebGL();
    });

    it("declines when prefers-reduced-motion is set", () => {
        mockMatchMedia(true);
        const restoreWebGL = mockWebGL(true);

        expect(computeHero3DSupport()).toBe(false);
        restoreWebGL();
    });

    it("declines when the browser has Save-Data on", () => {
        mockMatchMedia(false);
        const restoreWebGL = mockWebGL(true);
        Object.defineProperty(navigator, "connection", { value: { saveData: true }, configurable: true });

        expect(computeHero3DSupport()).toBe(false);
        restoreWebGL();
    });

    it("declines on a low core-count device", () => {
        mockMatchMedia(false);
        const restoreWebGL = mockWebGL(true);
        Object.defineProperty(navigator, "hardwareConcurrency", { value: 2, configurable: true });

        expect(computeHero3DSupport()).toBe(false);
        restoreWebGL();
    });

    it("declines on a low-memory device", () => {
        mockMatchMedia(false);
        const restoreWebGL = mockWebGL(true);
        Object.defineProperty(navigator, "hardwareConcurrency", { value: 8, configurable: true });
        Object.defineProperty(navigator, "deviceMemory", { value: 2, configurable: true });

        expect(computeHero3DSupport()).toBe(false);
        restoreWebGL();
    });

    it("declines when WebGL is unavailable", () => {
        mockMatchMedia(false);
        const restoreWebGL = mockWebGL(false);
        Object.defineProperty(navigator, "hardwareConcurrency", { value: 8, configurable: true });
        Object.defineProperty(navigator, "deviceMemory", { value: 8, configurable: true });

        expect(computeHero3DSupport()).toBe(false);
        restoreWebGL();
    });

    it("does not penalize a device that simply doesn't report deviceMemory/hardwareConcurrency", () => {
        mockMatchMedia(false);
        const restoreWebGL = mockWebGL(true);
        Object.defineProperty(navigator, "hardwareConcurrency", { value: undefined, configurable: true });
        Object.defineProperty(navigator, "deviceMemory", { value: undefined, configurable: true });

        expect(computeHero3DSupport()).toBe(true);
        restoreWebGL();
    });
});

describe("use3DHeroSupport", () => {
    afterEach(() => {
        window.matchMedia = ORIGINAL_MATCH_MEDIA;
        vi.restoreAllMocks();
    });

    it("starts false and resolves to the computed support value after mount", async () => {
        mockMatchMedia(false);
        const restoreWebGL = mockWebGL(true);
        Object.defineProperty(navigator, "hardwareConcurrency", { value: 8, configurable: true });
        Object.defineProperty(navigator, "deviceMemory", { value: 8, configurable: true });

        const { result } = renderHook(() => use3DHeroSupport());

        await waitFor(() => expect(result.current).toBe(true));
        restoreWebGL();
    });
});
