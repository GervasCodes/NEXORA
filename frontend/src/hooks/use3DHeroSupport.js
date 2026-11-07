import { useEffect, useState } from "react";

// Phase 7 sub-phase 1 (3D landing hero - dependency + fallback scaffolding):
// decides whether the 3D hero is even attempted, so the three/@react-three
// bundle (Hero3DScene, lazy-loaded from Hero3D.jsx) is never fetched at all
// for anyone who wouldn't get a good experience from it - not just hidden
// after loading. Any one of these disqualifies:
//
// - prefers-reduced-motion: a WebGL render loop isn't a CSS animation, so
//   the global `* { animation-duration: 0.001ms }` rule in index.css
//   (Phase 3) doesn't touch it - this is the JS-level equivalent for the
//   same intent, checked separately here.
// - navigator.connection?.saveData: an explicit user request to avoid
//   unnecessary heavy loads. Same spirit as why the offline service worker
//   only caches the catalog endpoints, not "the whole app" (sw.js).
// - Low-end device heuristics: navigator.hardwareConcurrency and
//   navigator.deviceMemory are the two real signals the platform exposes.
//   deviceMemory is Chromium-only and simply `undefined` elsewhere - that's
//   treated as "unknown, don't penalize" rather than "definitely low-end",
//   same reasoning applied to hardwareConcurrency. Thresholds are
//   deliberately conservative: this marketplace's audience skews toward the
//   kind of phone that showed up in the Phase 6 "products not visible on
//   phone" report, not high-end flagship devices.
// - No WebGL support: some browsers/devices/locked-down environments have
//   it disabled entirely - mounting <Canvas> there would just throw. This
//   is the last check (not the first) since it's the only one requiring an
//   actual canvas element to be created, and there's no point paying that
//   cost if an earlier, cheaper check already disqualified the device.
//
// This is a genuinely new capability check for this codebase - the
// low-end/save-data reasoning doesn't reuse an existing pattern here, so
// it's laid out in full for the sub-phase-2 scene author to extend rather
// than re-derive.
const LOW_END_CORES_THRESHOLD = 4;
const LOW_END_MEMORY_GB_THRESHOLD = 4;

function detectWebGL() {
    if (typeof document === "undefined") return false;
    try {
        const canvas = document.createElement("canvas");
        // Getting a context back is sufficient proof of support on its own -
        // gating on `window.WebGLRenderingContext` as well is redundant in
        // real browsers (it's always present alongside a working
        // getContext) and actively wrong in test/locked-down environments
        // that stub getContext without also defining the global class,
        // which made this always report "unsupported" there.
        return Boolean(
            canvas.getContext("webgl2") || canvas.getContext("webgl") || canvas.getContext("experimental-webgl")
        );
    } catch {
        return false;
    }
}

export function computeHero3DSupport() {
    if (typeof window === "undefined") return false;

    if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) return false;

    if (navigator.connection?.saveData) return false;

    const cores = navigator.hardwareConcurrency;
    if (typeof cores === "number" && cores > 0 && cores < LOW_END_CORES_THRESHOLD) return false;

    const memory = navigator.deviceMemory;
    if (typeof memory === "number" && memory > 0 && memory < LOW_END_MEMORY_GB_THRESHOLD) return false;

    return detectWebGL();
}

// Computed once per mount rather than kept reactive to matchMedia/connection
// changes - a visitor toggling their OS reduced-motion setting mid-session
// and expecting the landing hero to swap live under them is a vanishingly
// unlikely case, not worth the added listener/cleanup complexity here.
export function use3DHeroSupport() {
    const [supported, setSupported] = useState(false);

    useEffect(() => {
        setSupported(computeHero3DSupport());
    }, []);

    return supported;
}
