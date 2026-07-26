import "@testing-library/jest-dom/vitest";

// jsdom (the test environment below) doesn't implement IntersectionObserver,
// so any component that uses it - ProductGrid's infinite-scroll trigger, for
// instance - throws "IntersectionObserver is not defined" the moment it
// mounts. This is a minimal stub, not a real implementation: it never
// actually fires the callback, since none of the current tests depend on
// the observer *triggering* - they just need mounting/unmounting not to
// crash. A test that needs to simulate a scroll-into-view should capture
// the callback passed to the constructor and invoke it directly.
class IntersectionObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
}

global.IntersectionObserver = IntersectionObserverStub;

