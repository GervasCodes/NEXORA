// Import the matchers directly and register them with vitest's `expect`
// ourselves, instead of relying on the "@testing-library/jest-dom/vitest"
// auto-registration subpath. That subpath silently fails to attach the
// matchers under this project's vitest 4 / chai 6 combo (every jest-dom
// matcher - toBeInTheDocument, toHaveAttribute, toBeEmptyDOMElement, etc. -
// comes back as "Invalid Chai property"), even though the import itself
// resolves fine. Extending `expect` explicitly is the documented fallback
// and isn't sensitive to that subpath's export resolution.
import { expect } from "vitest";
import * as matchers from "@testing-library/jest-dom/matchers";

expect.extend(matchers);

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

