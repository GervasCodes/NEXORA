import { Component } from "react";

// Phase 7 sub-phase 1: belt-and-suspenders alongside use3DHeroSupport's
// WebGL detection. A device can report WebGL support yet still throw at
// actual context-creation time (driver blocklists, a context limit already
// exhausted by other tabs, etc.) - this catches that at render time and
// falls back to the same component use3DHeroSupport would have chosen
// (HomeCarousel, passed in as `fallback` by Hero3D.jsx), rather than a
// blank hero or a crashed page.
export default class Hero3DErrorBoundary extends Component {
    state = { hasError: false };

    static getDerivedStateFromError() {
        return { hasError: true };
    }

    componentDidCatch(error) {
        // eslint-disable-next-line no-console
        console.warn("3D hero failed to render, falling back to the carousel:", error);
    }

    render() {
        if (this.state.hasError) return this.props.fallback;
        return this.props.children;
    }
}
